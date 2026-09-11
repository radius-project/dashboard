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
 */
const EXEMPT: Record<string, string> = {
  '@internal/backend':
    'Backstage backend entry point only; 0% covered, so any floor would be zero. Phase 1 adds the first test and the floor with it.',
};

const workspaceDirs = ['packages', 'plugins'].flatMap(group =>
  fs
    .readdirSync(path.join(repoRoot, group), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `${group}/${entry.name}`)
    .filter(dir => fs.existsSync(path.join(repoRoot, dir, 'package.json'))),
);

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

  it('PU-23: gives every workspace either a floor or a recorded exemption', () => {
    const unguarded = workspaceDirs.filter(dir => {
      const guarded = Object.keys(thresholds).some(group =>
        group.replace(/^\.\//, '').startsWith(`${dir}/`),
      );
      if (guarded) return false;

      const name = readJson(path.join(repoRoot, dir, 'package.json')).name;
      return !(name && name in EXEMPT);
    });

    expect(unguarded).toEqual([]);
  });

  it('PU-24: points every floor at a directory that exists', () => {
    const missing = Object.keys(thresholds).filter(
      group => !fs.existsSync(path.join(repoRoot, group.replace(/^\.\//, ''))),
    );

    expect(missing).toEqual([]);
  });

  it('PU-25: states a floor for statements and lines in every group', () => {
    // Branch and function floors are omitted where the measured value is zero;
    // statements and lines are always meaningful, so they are always required.
    for (const [group, floors] of Object.entries(thresholds)) {
      expect([group, typeof floors.statements]).toEqual([group, 'number']);
      expect([group, typeof floors.lines]).toEqual([group, 'number']);
    }
  });
});
