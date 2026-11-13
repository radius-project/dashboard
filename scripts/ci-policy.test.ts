import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  checkCoverageBase,
  compareCoveragePolicy,
  compareMeasuredCoverage,
  failureEvidence,
} from './ci-policy.ts';

const manifest = () => ({
  jest: {
    coverageThreshold: {
      './plugins/example/src/': {
        statements: 93,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
    coveragePathIgnorePatterns: ['/__docs__/'],
  },
});

test('preserve or strengthen every existing floor, including 100% floors', () => {
  const next = manifest();
  compareCoveragePolicy(manifest(), next);
  next.jest.coverageThreshold['./plugins/example/src/'].statements = 95;
  compareCoveragePolicy(manifest(), next);
  for (const metric of [
    'statements',
    'branches',
    'functions',
    'lines',
  ] as const) {
    const lower = manifest();
    lower.jest.coverageThreshold['./plugins/example/src/'][metric]--;
    assert.throws(() => compareCoveragePolicy(manifest(), lower), /decreased/);
  }
});

test('reject removed/narrowed groups, missing metrics and wider exclusions', () => {
  const invalidFloors: Record<string, Record<string, number>>[] = [
    {},
    { './plugins/example/src/components/': { statements: 100 } },
    { './plugins/example/src/': { statements: 100 } },
    { './plugins/example/src/': { statements: NaN } },
  ];
  for (const floors of invalidFloors) {
    assert.throws(() =>
      compareCoveragePolicy(manifest(), {
        jest: { coverageThreshold: floors },
      }),
    );
  }
  const next = manifest();
  next.jest.coveragePathIgnorePatterns.push('/src/');
  assert.throws(() => compareCoveragePolicy(manifest(), next), /exclusions/);
});

test('validate added coverage groups and metrics while preserving existing groups', () => {
  const base = manifest();
  for (const group of [
    './plugins/example/src/components/',
    './plugins/../src/',
    './plugins/*/src/',
    'global',
  ]) {
    assert.throws(
      () =>
        compareCoveragePolicy(base, {
          jest: {
            ...base.jest,
            coverageThreshold: {
              ...base.jest.coverageThreshold,
              [group]: { statements: 100 },
            },
          },
        }),
      /full-source/,
    );
  }
  const partial = {
    jest: {
      coverageThreshold: {
        './plugins/example/src/': { statements: 93 },
      },
    },
  };
  for (const floor of [0, -1, 105, NaN]) {
    for (const group of [
      './plugins/example/src/',
      './packages/new-workspace/src/',
    ]) {
      assert.throws(
        () =>
          compareCoveragePolicy(partial, {
            jest: {
              coverageThreshold: {
                ...partial.jest.coverageThreshold,
                [group]: { statements: 93, branches: floor },
              },
            },
          }),
        /invalid/,
      );
    }
  }
  assert.throws(
    () =>
      compareCoveragePolicy(partial, {
        jest: {
          coverageThreshold: {
            './plugins/example/src/': { statements: 93, unknown: 100 },
          },
        },
      }),
    /invalid/,
  );
  assert.throws(
    () => compareCoveragePolicy({ jest: { coverageThreshold: {} } }, base),
    /Missing coverage groups/,
  );
  compareCoveragePolicy(partial, {
    jest: {
      coverageThreshold: {
        './plugins/example/src/': { statements: 95, branches: 100 },
        './packages/new-workspace/src/': { lines: 90 },
      },
    },
  });
});

test('compare the real immutable Git base and fail on unavailable revisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-base-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    git('init', '--quiet');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify(manifest()),
    );
    git('add', 'package.json');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'base',
    );
    const base = git('rev-parse', 'HEAD');
    checkCoverageBase(root, base);
    const next = manifest();
    next.jest.coverageThreshold['./plugins/example/src/'].branches = 85;
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(next));
    assert.throws(() => checkCoverageBase(root, base), /decreased/);
    assert.throws(() => checkCoverageBase(root, 'origin/main'), /immutable/);
    assert.throws(() => checkCoverageBase(root, '0'.repeat(40)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failure evidence is bounded metadata, never arbitrary diagnostic text', () => {
  const results = {
    policy: 'success',
    unit: 'failure',
    coverage: 'skipped',
    standalone: 'skipped',
    graph: 'skipped',
    artifact: 'skipped',
    installed: 'cancelled',
  };
  const content = failureEvidence('a'.repeat(40), '123', results);
  assert(Buffer.byteLength(content) <= 1024);
  assert.equal(JSON.parse(content).stages.unit, 'failure');
  for (const invalid of [
    { ...results, unit: 'Authorization: Bearer secret' },
    { ...results, token: 'secret' },
    { unit: 'failure' },
  ]) {
    assert.throws(() => failureEvidence('a'.repeat(40), '123', invalid));
  }
  assert.throws(() => failureEvidence('not-a-sha', '123', results));
});

test('evidence CLI defaults unset and empty outcomes without accepting invalid text', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-evidence-'));
  const output = path.join(root, 'evidence.json');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_RUN_ID: '123',
    PHASE6_POLICY: '',
    PHASE6_UNIT: 'failure',
  };
  for (const stage of [
    'coverage',
    'standalone',
    'graph',
    'artifact',
    'installed',
  ]) {
    delete env[`PHASE6_${stage.toUpperCase()}`];
  }
  const run = () =>
    execFileSync(
      process.execPath,
      [path.resolve('scripts', 'ci-policy.ts'), 'evidence', output],
      { env, stdio: 'pipe' },
    );
  try {
    run();
    const evidence = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(evidence.stages.unit, 'failure');
    for (const stage of [
      'policy',
      'coverage',
      'standalone',
      'graph',
      'artifact',
      'installed',
    ]) {
      assert.equal(evidence.stages[stage], 'skipped');
    }
    env.PHASE6_POLICY = 'invalid outcome';
    assert.throws(run);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('measured non-decrease compares exact group ratios, not rounded floors', () => {
  const root = path.resolve('base');
  const candidateRoot = path.resolve('candidate');
  const report = (directory: string, covered = 9999, total = 10000) => ({
    [path.join(directory, 'plugins', 'example', 'src', 'index.ts')]:
      Object.fromEntries(
        ['statements', 'branches', 'functions', 'lines'].map(metric => [
          metric,
          { covered, total },
        ]),
      ) as Record<
        'statements' | 'branches' | 'functions' | 'lines',
        { covered: number; total: number }
      >,
  });
  const compare = (next = report(candidateRoot)) =>
    compareMeasuredCoverage(
      manifest(),
      root,
      report(root),
      candidateRoot,
      next,
    );
  assert.throws(
    () =>
      compareMeasuredCoverage(
        {
          jest: {
            coverageThreshold: {
              './plugins/example/src/components/': { lines: 100 },
            },
          },
        },
        root,
        report(root),
        candidateRoot,
        report(candidateRoot),
      ),
    /full-source/,
  );
  compare();
  compare(report(candidateRoot, 10000));
  assert.throws(() => compare(report(candidateRoot, 9998)), /decreased/);
  assert.throws(() => compare({}), /Missing measured/);
  assert.throws(() => compare(report(root)), /outside/);
  assert.throws(() => compare(report(candidateRoot, -1)), /Invalid/);
  const noBranches = report(root, 0, 0);
  compareMeasuredCoverage(
    manifest(),
    root,
    noBranches,
    candidateRoot,
    report(candidateRoot, 1, 1),
  );
  assert.throws(
    () =>
      compareMeasuredCoverage(
        manifest(),
        root,
        noBranches,
        candidateRoot,
        report(candidateRoot, 0, 1),
      ),
    /decreased/,
  );
});
