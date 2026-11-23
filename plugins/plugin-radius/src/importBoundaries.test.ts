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
  it('PB-03: retains license identities and portable candidate paths', () => {
    const directory = path.join(repoRoot, 'vendor/shared-libraries');
    const receipt = JSON.parse(
      fs.readFileSync(path.join(directory, 'candidate.json'), 'utf8'),
    ) as {
      licenses: { file: string; sha256: string }[];
    };
    const strings = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (value && typeof value === 'object')
        return Object.values(value).flatMap(strings);
      return [];
    };
    expect(
      strings(receipt).filter(value =>
        /(?:\b[A-Z]:[\\/]|\/mnt\/[a-z]\/|\/(?:home|Users)\/|\\\\[^\\]+\\)/i.test(
          value,
        ),
      ),
    ).toEqual([]);
    expect(receipt.licenses).toHaveLength(3);
    for (const license of receipt.licenses) {
      expect(license.file.startsWith('licenses/')).toBe(true);
      expect(license.file.split(/[\\/]/)).not.toContain('..');
      expect(
        createHash('sha256')
          .update(fs.readFileSync(path.join(directory, license.file)))
          .digest('hex'),
      ).toBe(license.sha256);
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

  it('PB-01a: the plugin uses only the parser entry, without pulling in the compatibility renderer', () => {
    const imports = importSpecifiers(
      path.join(repoRoot, 'plugins/plugin-radius/src'),
    );
    const graphImports = imports.filter(({ specifier }) =>
      specifier.startsWith('@radapp.io/rad-components'),
    );

    expect(graphImports.length).toBeGreaterThan(0);
    expect(
      graphImports.filter(
        ({ specifier }) => specifier !== '@radapp.io/rad-components/resourceId',
      ),
    ).toEqual([]);
  });

  it('PB-01: shared libraries use only reviewed browser-safe public entries', () => {
    const imports = importSpecifiers(
      path.join(repoRoot, 'plugins/plugin-radius/src'),
    ).filter(({ specifier }) => specifier.startsWith('@radius-project/'));

    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.filter(
        ({ specifier }) =>
          ![
            '@radius-project/core/domain',
            '@radius-project/core/graph',
            '@radius-project/graph-react',
            '@radius-project/graph-react/styles.css',
          ].includes(specifier),
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
      '@radapp.io/rad-components/resourceId',
      '@backstage/core-plugin-api',
      '@backstage/plugin-catalog-react/alpha',
      'react-dom/client',
      '@scope/sources/public',
      './relative/src/file',
    ].forEach(specifier => expect(isPrivateReachIn(specifier)).toBe(false));
  });
});
