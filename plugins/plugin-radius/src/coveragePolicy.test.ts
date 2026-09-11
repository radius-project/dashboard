/**
 * A build-time policy test rather than shipped plugin code: it reads workspace
 * manifests off disk. The frontend plugin bans Node builtins because they
 * cannot run in a browser, which is right for `src/**` but not for a test that
 * never ships (`files` is `dist` only).
 */
/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';

interface PackageJson {
  name?: string;
  jest?: { coverageThreshold?: Record<string, Record<string, number>> };
}

const repoRoot = path.resolve(__dirname, '../../..');

const readJson = (absolutePath: string) =>
  JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as PackageJson;

const repo = readJson(path.join(repoRoot, 'package.json'));

const thresholds: Record<string, Record<string, number>> = repo.jest
  ?.coverageThreshold ?? {};

/**
 * Workspaces deliberately left without a coverage floor, with the reason. A
 * floor of zero is not a floor, so an untested workspace is listed here instead
 * of being given a meaningless threshold. Removing an entry is the signal that
 * the workspace has earned a real floor.
 *
 * The list is currently empty: `@internal/backend` was the only entry, and
 * Phase 1 gave it a test (BK-01--BK-06) and a measured floor. It is kept rather
 * than deleted because PU-23 needs a mechanism for the next unguarded
 * workspace, and an empty list is the correct state for that mechanism to be
 * in -- PU-31 asserts it stays empty unless a new exemption is argued for.
 */
const EXEMPT: Record<string, string> = {};

const workspaceDirs = ['packages', 'plugins'].flatMap(group =>
  fs
    .readdirSync(path.join(repoRoot, group), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `${group}/${entry.name}`)
    .filter(dir => fs.existsSync(path.join(repoRoot, dir, 'package.json'))),
);

const unguardedWorkspaces = (
  candidate: typeof thresholds,
  exemptions = EXEMPT,
) =>
  workspaceDirs.filter(dir => {
    if (Object.hasOwn(candidate, `./${dir}/src/`)) return false;
    const name = readJson(path.join(repoRoot, dir, 'package.json')).name;
    return !(name && name in exemptions);
  });

const invalidFloors = (candidate: typeof thresholds) =>
  Object.entries(candidate).flatMap(([group, floors]) => {
    const metrics = new Set(['statements', 'lines', ...Object.keys(floors)]);
    return [...metrics]
      .filter(metric => {
        const value = floors[metric];
        return (
          !['statements', 'branches', 'functions', 'lines'].includes(metric) ||
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 100
        );
      })
      .map(metric => `${group}:${metric}`);
  });

/**
 * Coverage policy.
 *
 * CI runs `yarn test:all`, which is `backstage-cli repo test --coverage`. That
 * command runs each workspace as a Jest *project*, and Jest refuses
 * `coverageThreshold` inside a project config -- it warns and ignores it. A
 * per-workspace floor therefore enforces nothing in CI while looking like it
 * does, which is worse than having none. Floors live in the root config as path
 * groups, and these tests keep them there and keep them complete.
 */
describe('coverage policy', () => {
  it('PU-20: defines coverage floors in the root config, where the repo-wide run honors them', () => {
    expect(Object.keys(thresholds).length).toBeGreaterThan(0);
  });

  it('PU-21: declares no per-workspace floors, which the repo-wide run silently ignores', () => {
    const offenders = workspaceDirs.filter(
      dir =>
        readJson(path.join(repoRoot, dir, 'package.json')).jest
          ?.coverageThreshold,
    );

    expect(offenders).toEqual([]);
  });

  it('PU-22: sets no "global" group, which would otherwise measure the files no path group claims', () => {
    // Every source file is claimed by a path group, so a `global` entry reports
    // 0% and fails the build for a reason that has nothing to do with coverage.
    expect(thresholds).not.toHaveProperty('global');
  });

  it('PU-23: guards every complete source directory or records an exemption', () => {
    expect(unguardedWorkspaces(thresholds)).toEqual([]);
  });

  it('PU-24: points every floor at a directory that exists', () => {
    const allowedGroups = workspaceDirs.map(dir => `./${dir}/src/`);
    expect(
      Object.keys(thresholds).filter(group => !allowedGroups.includes(group)),
    ).toEqual([]);
    const missing = Object.keys(thresholds).filter(
      group => !fs.existsSync(path.join(repoRoot, group.replace(/^\.\//, ''))),
    );

    expect(missing).toEqual([]);
  });

  it('PU-25: requires positive percentage floors, including statements and lines', () => {
    // Branch and function floors are omitted where the measured value is zero;
    // statements and lines are always meaningful, so they are always required.
    expect(invalidFloors(thresholds)).toEqual([]);
  });

  it('PU-32: rejects a threshold narrowed to only part of a workspace', () => {
    const { ['./plugins/plugin-radius/src/']: floors, ...rest } = thresholds;
    expect(
      unguardedWorkspaces({
        ...rest,
        './plugins/plugin-radius/src/components/applications/': floors,
      }),
    ).toContain('plugins/plugin-radius');
  });

  it.each([0, -1, 101, NaN, Infinity])(
    'PU-33: rejects an invalid percentage floor (%s)',
    value => {
      expect(
        invalidFloors({
          './example/src/': { statements: value, lines: value },
        }),
      ).toEqual(['./example/src/:statements', './example/src/:lines']);
    },
  );

  it('PU-34: rejects missing mandatory floors and zero optional floors', () => {
    expect(
      invalidFloors({ './example/src/': { branches: 0, functions: 0 } }),
    ).toEqual([
      './example/src/:statements',
      './example/src/:lines',
      './example/src/:branches',
      './example/src/:functions',
    ]);
  });

  it('PU-31: records no coverage exemptions, so every workspace has a measured floor', () => {
    // Phase 1 removed the last one (`@internal/backend`). PU-23 still consults
    // this list, so a future workspace can be exempted deliberately -- but it
    // has to be added here, with a reason, and this assertion has to be changed
    // in the same pull request. The exemption cannot be reintroduced quietly.
    expect(EXEMPT).toEqual({});
  });
});
