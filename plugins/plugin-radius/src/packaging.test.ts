/**
 * These are build-time contract tests, not shipped plugin code: they read
 * manifests off disk to check how this package is packaged. The frontend plugin
 * bans Node builtins because they cannot run in a browser, which is right for
 * `src/**` but not for a test that never ships (`files` is `dist` only).
 */
/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';

interface PackageJson {
  name?: string;
  private?: boolean;
  license?: string;
  main?: string;
  types?: string;
  sideEffects?: boolean;
  files?: string[];
  backstage?: {
    role?: string;
    pluginId?: string;
    pluginPackages?: string[];
  };
  publishConfig?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * `packagingArtifact.test.ts` runs a real `build` and `pack` in this same Jest
 * run, and Backstage's `prepack` transiently rewrites the workspace manifest's
 * top-level `main` and `types` to their `dist` targets before `postpack` puts
 * them back. Every other field -- `publishConfig`, `backstage`, `files`,
 * `private`, `license`, and the `workspace:` dependency ranges -- is left
 * untouched, so only those two keys can be observed mid-flight.
 *
 * Reading during that window would therefore make an assertion on `main` or
 * `types` intermittently wrong, so this re-reads until the manifest is out of
 * the packed state. Source-entry assertions belong in PU-27b, which owns the
 * pack lifecycle and can guarantee ordering; do not add them here.
 */
const sleepSync = (milliseconds: number) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

const readJson = (relativePath: string) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  const deadline = Date.now() + 240_000;

  for (;;) {
    const manifest = JSON.parse(
      fs.readFileSync(absolutePath, 'utf8'),
    ) as PackageJson;

    const midPack = manifest.main?.startsWith('dist/');
    if (!midPack || Date.now() > deadline) {
      return manifest;
    }

    sleepSync(50);
  }
};

const pkg = readJson('../package.json');
const radComponents = readJson('../../../packages/rad-components/package.json');
const repo = readJson('../../../package.json');

/**
 * Phase 3 packaging contract.
 *
 * The plugin is intended to be published and consumed by an external Backstage
 * host. These tests inspect source metadata, not a packed artifact or an
 * installation. They record the conditions that currently prevent
 * publication so they cannot be forgotten or silently "fixed" by an unrelated
 * change.
 */
describe('package contract', () => {
  it('PU-11: declares the Backstage role that host discovery depends on', () => {
    expect(pkg.backstage).toEqual({
      role: 'frontend-plugin',
      pluginId: 'radius',
      pluginPackages: ['@internal/plugin-radius'],
    });
  });

  it('PU-12: ships only build output, and publishes built entry points', () => {
    expect(pkg.files).toEqual(['dist']);
    expect(pkg.publishConfig).toMatchObject({
      access: 'public',
      main: 'dist/index.esm.js',
      types: 'dist/index.d.ts',
    });
  });

  it('PU-13: is free of side effects so hosts can tree-shake it', () => {
    expect(pkg.sideEffects).toBe(false);
  });

  it('PU-14: keeps React and the router as peer dependencies', () => {
    // Bundling either would give the host a second React instance and break
    // hooks, so these must never move into `dependencies`.
    expect(Object.keys(pkg.peerDependencies ?? {}).sort()).toEqual([
      'react',
      'react-dom',
      'react-router-dom',
    ]);

    for (const name of ['react', 'react-dom', 'react-router-dom']) {
      expect(pkg.dependencies).not.toHaveProperty(name);
    }
  });

  it('PU-15: supports React 18, which is the version the dashboard host runs', () => {
    expect(pkg.peerDependencies?.react).toContain('^18.0.0');
    expect(pkg.devDependencies?.react).toMatch(/^\^18\./);
  });

  it('PU-16: KNOWN-DEFECT remains private pending release approval', () => {
    expect(pkg.private).toBe(true);
  });

  /**
   * Yarn rewrites `workspace:^` to a semver range when packing. This assertion
   * records the current source dependency, not a publication defect. Only an
   * installed-artifact test can establish whether consumers can resolve it.
   */
  it('PU-17: records the graph workspace dependency before extraction', () => {
    expect(pkg.dependencies?.['@radapp.io/rad-components']).toBe('workspace:^');

    const workspaceRanges = Object.entries(pkg.dependencies ?? {})
      .filter(([, range]) => String(range).startsWith('workspace:'))
      .map(([name]) => name);

    expect(workspaceRanges).toEqual(['@radapp.io/rad-components']);
  });

  /**
   * KNOWN-DEFECT: the repository LICENSE file is Apache-2.0 and the plugin
   * declares Apache-2.0, but the graph package it depends on declares ISC, and
   * the workspace root declares no license at all. `rad-components` is not
   * private, so it is the one publishable package in the repository and it
   * disagrees with the repository license. This must be resolved before the
   * graph code moves or anything is published.
   */
  it('PU-18: KNOWN-DEFECT the repository, plugin, and graph package disagree on license', () => {
    expect(repo.license).toBeUndefined();
    expect(
      fs.readFileSync(path.resolve(__dirname, '../../../LICENSE'), 'utf8'),
    ).toContain('Apache License');

    expect(pkg.license).toBe('Apache-2.0');
    expect(radComponents.license).toBe('ISC');
    expect(radComponents.private).toBeUndefined();
  });

  it('PU-19: pins the current internal name pending scope confirmation', () => {
    expect(pkg.name).toBe('@internal/plugin-radius');
  });
});
