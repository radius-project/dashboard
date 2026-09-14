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
    const packageReachIns = imports.filter(
      ({ specifier }) =>
        !specifier.startsWith('.') &&
        (specifier.includes('/src/') || specifier.includes('/private/')),
    );

    expect(imports.length).toBeGreaterThan(0);
    expect(relativeReachIns).toEqual([]);
    expect(packageReachIns).toEqual([]);
  });
});
