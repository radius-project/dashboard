/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';

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
  it('PB-04: the app consumes the plugin only through its public package entry point', () => {
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
        ({ specifier }) => specifier !== '@internal/plugin-radius',
      ),
    ).toEqual([]);
  });

  it('PB-01a: the current graph dependency is consumed through its public entry point', () => {
    const imports = importSpecifiers(
      path.join(repoRoot, 'plugins/plugin-radius/src'),
    );
    const graphImports = imports.filter(({ specifier }) =>
      specifier.startsWith('@radapp.io/rad-components'),
    );

    expect(graphImports.length).toBeGreaterThan(0);
    expect(
      graphImports.filter(
        ({ specifier }) => specifier !== '@radapp.io/rad-components',
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
});
