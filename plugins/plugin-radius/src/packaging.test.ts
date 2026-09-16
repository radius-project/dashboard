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
 * A plain read. The only thing that transiently rewrites these manifests is
 * Backstage's `prepack`, and the suite that triggers it runs alone under
 * `yarn test:package` rather than inside this Jest run, so there is no window
 * to synchronise against. PP-01 keeps that separation from being undone.
 */
const readJson = (relativePath: string) =>
  JSON.parse(
    fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8'),
  ) as PackageJson;

const pkg = readJson('../package.json');

/**
 * Phase 3 packaging contract.
 *
 * The plugin is intended to be published and consumed by an external Backstage
 * host. These tests inspect source metadata, not a packed artifact or an
 * installation. Remaining release decisions -- final package name, whether the
 * package is published, and the repository license reconciliation -- are
 * checklist items in the design plan rather than assertions here, because a
 * test that asserts an open decision turns CI red for whoever closes it.
 */
describe('package contract', () => {
  /**
   * The artifact qualification suite runs a real build and pack, so it runs
   * alone under `yarn test:package` instead of inside this Jest run. That makes
   * it skippable, so this pins the two things that keep it running: the script
   * that sets PACKAGE_QUALIFICATION and targets the suite, and the CI step that
   * invokes the script.
   */
  it('PP-01: qualifies packed artifacts through a separate serial script in CI', () => {
    const repoManifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const script = repoManifest.scripts?.['test:package'];
    expect(script).toBe('node scripts/test-package.js');

    const runner = fs.readFileSync(
      path.resolve(__dirname, '../../../scripts/test-package.js'),
      'utf8',
    );
    expect(runner).toContain("PACKAGE_QUALIFICATION: 'true'");
    expect(runner).toContain(
      'plugins/plugin-radius/src/packagingArtifact.test.ts',
    );

    const workflow = fs.readFileSync(
      path.resolve(__dirname, '../../../.github/workflows/build.yaml'),
      'utf8',
    );
    expect(workflow).toContain('yarn run test:package');
  });

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

  it('PU-19: pins the current internal name pending scope confirmation', () => {
    expect(pkg.name).toBe('@internal/plugin-radius');
  });
});
