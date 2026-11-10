import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const sha256 = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function installedPackage(root: string, name: string) {
  const require = createRequire(path.join(root, 'package.json'));
  let file: string;
  try {
    file = require.resolve(`${name}/package.json`);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      throw error;
    }
    let directory = path.dirname(require.resolve(name));
    for (;;) {
      const manifest = path.join(directory, 'package.json');
      if (
        fs.existsSync(manifest) &&
        JSON.parse(fs.readFileSync(manifest, 'utf8')).name === name
      ) {
        file = manifest;
        break;
      }
      const parent = path.dirname(directory);
      if (parent === directory) {
        throw new Error(`Could not locate installed manifest for ${name}`);
      }
      directory = parent;
    }
  }
  return {
    directory: path.dirname(file),
    manifest: JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name: string;
      version: string;
      main?: string;
      types?: string;
    },
  };
}

export function assertInside(root: string, file: string) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Installed host input escapes its isolated root: ${file}`);
  }
}

export function assertInstalledReact18(root: string) {
  const copies: Record<string, string[]> = { react: [], 'react-dom': [] };
  const visit = (modules: string, scope = '') => {
    for (const name of fs.readdirSync(modules)) {
      if (name.startsWith('.')) continue;
      const directory = path.join(modules, name);
      if (name.startsWith('@')) {
        visit(directory, name);
        continue;
      }
      if (!fs.statSync(directory).isDirectory()) continue;
      assertInside(root, directory);
      const packageName = scope ? `${scope}/${name}` : name;
      if (Object.hasOwn(copies, packageName)) {
        const manifest = JSON.parse(
          fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
        );
        if (!/^18\./.test(manifest.version)) {
          throw new Error(
            `Backstage host requires React 18: ${packageName}@${manifest.version}`,
          );
        }
        copies[packageName].push(fs.realpathSync(directory));
      }
      const nested = path.join(directory, 'node_modules');
      if (fs.existsSync(nested)) visit(nested);
    }
  };
  visit(path.join(root, 'node_modules'));
  for (const [name, locations] of Object.entries(copies)) {
    if (new Set(locations).size !== 1) {
      throw new Error(
        `Expected one installed ${name} copy, found ${locations.length}`,
      );
    }
  }
  return Object.fromEntries(
    Object.entries(copies).map(([name, locations]) => [
      name,
      {
        version: installedPackage(root, name).manifest.version,
        path: path.relative(root, locations[0]),
      },
    ]),
  );
}

export function assertCandidateResolution(root: string) {
  const require = createRequire(path.join(root, 'package.json'));
  const plugin = createRequire(require.resolve('@internal/plugin-radius'));
  const forwarding = createRequire(
    require.resolve('@radapp.io/rad-components'),
  );
  for (const name of [
    '@radius-project/core/graph',
    '@radius-project/core/domain',
    '@radius-project/graph-react',
  ]) {
    const direct = fs.realpathSync(require.resolve(name));
    assertInside(root, direct);
    for (const consumer of [plugin, forwarding]) {
      if (fs.realpathSync(consumer.resolve(name)) !== direct) {
        throw new Error(
          `Direct and plugin/forwarding resolution differ: ${name}`,
        );
      }
    }
  }
}

export function assertProductionInputs(root: string, inputs: string[]) {
  for (const input of inputs) {
    if (input === '<define:process.env>') continue;
    assertInside(root, path.resolve(input));
    const normalized = input.replaceAll('\\', '/');
    if (/\/(?:plugin-radius|rad-components)\/src\//.test(normalized)) {
      throw new Error(
        `Production host must not build Radius workspace source: ${input}`,
      );
    }
    if (/\/node_modules\/(?:reactflow|@reactflow)\//.test(normalized)) {
      throw new Error(
        `Production Radius host must not use the old graph renderer: ${input}`,
      );
    }
  }
  for (const required of [
    '/plugin-radius/dist/index.esm.js',
    '/plugin-radius/dist/alpha.esm.js',
    '/@radius-project/core/dist/',
    '/@radius-project/graph-react/dist/',
    '/@radius-project/graph-react/dist/styles.css',
  ]) {
    if (!inputs.some(input => input.replaceAll('\\', '/').includes(required))) {
      throw new Error(
        `Production host is missing candidate input: ${required}`,
      );
    }
  }
}
