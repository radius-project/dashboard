/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const repoRoot = path.resolve(__dirname, '../../..');

const sourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [fullPath] : [];
  });

const importSpecifiers = (directory: string) =>
  sourceFiles(directory).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return [
      ...source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g),
    ].map(match => ({ file, specifier: match[1] }));
  });

const resolvesWithin = (file: string, specifier: string, directory: string) => {
  if (!specifier.startsWith('.')) {
    return false;
  }
  const relative = path.relative(
    directory,
    path.resolve(path.dirname(file), specifier),
  );
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

/**
 * True when a bare specifier reaches past a package's public entry point into
 * its source or otherwise private layout. Matching runs on whole path segments
 * after the package name, so a specifier that *ends* at the private segment -
 * '@radapp.io/rad-components/src' - is caught as well as one that continues
 * through it. A substring test for '/src/' misses the former.
 */
const isPrivateReachIn = (specifier: string) => {
  if (specifier.startsWith('.')) {
    return false;
  }
  const subpath = specifier.replace(/^@[^/]+\/[^/]+/, '');
  return /(?:^|\/)(?:src|private|internal)(?:\/|$)/.test(subpath);
};

describe('current package import boundaries', () => {
  it('PB-03: persists exact development artifacts, source/build evidence and received licenses with no machine paths', () => {
    const directory = path.join(repoRoot, 'vendor/shared-libraries');
    expect(
      fs.readFileSync(path.join(directory, '.gitattributes'), 'utf8').trim(),
    ).toBe('*.tgz binary');
    const receipt = JSON.parse(
      fs.readFileSync(
        path.join(directory, 'resource-icons-candidate.json'),
        'utf8',
      ),
    ) as {
      status: string;
      sourceRevision: string;
      core: { path: string; sha256: string; bytes: number };
      graphReact: { path: string; sha256: string; bytes: number };
      source: { tree: string; lockSha256: string; lockGitBlob: string };
      licenses: { file: string; sha256: string }[];
      build: {
        evidence: string;
        commands: { command: string; result: string }[];
      };
    };
    const hash = (file: string) =>
      createHash('sha256')
        .update(fs.readFileSync(path.join(directory, file)))
        .digest('hex');
    const strings = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (value && typeof value === 'object')
        return Object.values(value).flatMap(strings);
      return [];
    };
    expect(
      strings(receipt).filter(value =>
        /(?:^[A-Z]:[\\/]|\/mnt\/[a-z]\/)/i.test(value),
      ),
    ).toEqual([]);
    expect(receipt.status).toContain('Not a published release');
    expect(receipt.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(receipt.source.tree).toMatch(/^[a-f0-9]{40}$/);
    expect(receipt.source.lockGitBlob).toMatch(/^[a-f0-9]{40}$/);
    expect(receipt.source.lockSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.build.evidence).toContain(
      'Not an independent consumer source rebuild',
    );
    expect(receipt.build.commands.length).toBeGreaterThanOrEqual(4);
    const root = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    );
    for (const [name, artifact] of [
      ['core', receipt.core],
      ['graph-react', receipt.graphReact],
    ] as const) {
      expect(path.basename(artifact.path)).toBe(artifact.path);
      expect(hash(artifact.path)).toBe(artifact.sha256);
      expect(fs.statSync(path.join(directory, artifact.path)).size).toBe(
        artifact.bytes,
      );
      expect(artifact.bytes).toBeLessThan(150000);
      expect(root.resolutions[`@radius-project/${name}`]).toBe(
        `file:./vendor/shared-libraries/${artifact.path}`,
      );
    }
    expect(receipt.licenses).toHaveLength(3);
    for (const license of receipt.licenses) {
      expect(license.file.startsWith('licenses/')).toBe(true);
      expect(license.file.split('/')).not.toContain('..');
      expect(hash(license.file)).toBe(license.sha256);
    }
  });
  it('PB-04: the app consumes only the reviewed public root and native plugin entries', () => {
    const appRoot = path.join(repoRoot, 'packages/app/src');
    const pluginRoot = path.join(repoRoot, 'plugins/plugin-radius');
    const imports = importSpecifiers(appRoot);
    const pluginImports = imports.filter(
      ({ file, specifier }) =>
        specifier.startsWith('@internal/plugin-radius') ||
        resolvesWithin(file, specifier, pluginRoot),
    );

    expect(pluginImports.length).toBeGreaterThan(0);
    expect(
      pluginImports.filter(
        ({ specifier }) =>
          ![
            '@internal/plugin-radius',
            '@internal/plugin-radius/alpha',
          ].includes(specifier),
      ),
    ).toEqual([]);
  });

  it('PB-01: shared libraries use only reviewed browser-safe public entries', () => {
    const imports = importSpecifiers(
      path.join(repoRoot, 'plugins/plugin-radius/src'),
    );
    const graphImports = imports.filter(({ specifier }) =>
      specifier.startsWith('@radius-project/'),
    );

    expect(graphImports.length).toBeGreaterThan(0);
    expect(
      graphImports.filter(
        ({ specifier }) =>
          ![
            '@radius-project/core/domain',
            '@radius-project/core/graph',
            '@radius-project/graph-react',
            '@radius-project/graph-react/styles.css',
          ].includes(specifier),
      ),
    ).toEqual([]);
    expect(
      imports.filter(({ specifier }) =>
        specifier.startsWith('@radapp.io/rad-components'),
      ),
    ).toEqual([]);
  });

  it('PB-02a: current cross-package imports contain no private source reach-ins', () => {
    const pluginRoot = path.join(repoRoot, 'plugins/plugin-radius');
    const imports = importSpecifiers(path.join(pluginRoot, 'src'));
    const relativeReachIns = imports.filter(
      ({ file, specifier }) =>
        specifier.startsWith('.') &&
        !resolvesWithin(file, specifier, pluginRoot),
    );
    // Match whole path segments, including a specifier that *ends* at the
    // private segment. A substring search for '/src/' would let
    // '@radapp.io/rad-components/src' through, which is the same reach-in.
    const packageReachIns = imports.filter(({ specifier }) =>
      isPrivateReachIn(specifier),
    );

    expect(imports.length).toBeGreaterThan(0);
    expect(relativeReachIns).toEqual([]);
    expect(packageReachIns).toEqual([]);
  });

  it('PB-02b: recognizes reach-ins that end at the private segment', () => {
    // The exact-suffix forms are the ones a substring test for '/src/' misses.
    [
      '@radapp.io/rad-components/src',
      '@scope/package/private',
      '@internal/plugin-radius/internal',
      '@radapp.io/rad-components/src/graphRecord',
      'unscoped-package/src',
    ].forEach(specifier => expect(isPrivateReachIn(specifier)).toBe(true));

    // Public entry points and ordinary subpaths must stay allowed, including
    // names that merely contain the letters of a private segment.
    [
      '@radapp.io/rad-components',
      '@backstage/core-plugin-api',
      '@backstage/plugin-catalog-react/alpha',
      'react-dom/client',
      '@scope/sources/public',
      './relative/src/file',
    ].forEach(specifier => expect(isPrivateReachIn(specifier)).toBe(false));
  });

  it('PU-29: rad-components owns no parser, query policy, renderer or layout implementation', () => {
    const directory = path.join(repoRoot, 'packages/rad-components/src');
    const implementationFiles = sourceFiles(directory).filter(
      file =>
        !/[\\/]__(?:test|docs|fixtures)__[\\/]/.test(file) &&
        !/[\\/](?:sampledata|setupTests)\.tsx?$/.test(file),
    );
    for (const file of implementationFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(
        /\b(?:function|class)\b|=>|new RegExp|dagre|from ['"]reactflow/,
      );
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, '../package.json'), 'utf8'),
    );
    expect(manifest.dependencies).toEqual({
      '@radius-project/core': '0.1.0',
      '@radius-project/graph-react': '0.1.0',
    });
    // The root barrel statically loads the Flow11 ResourceNode entry.
    expect(manifest.peerDependencies.reactflow).toBe('^11.11.4');
    expect(manifest.peerDependenciesMeta?.reactflow).toBeUndefined();
    expect(fs.existsSync(path.join(directory, 'graphModel.ts'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'graphRecord.ts'))).toBe(false);
  });
});
