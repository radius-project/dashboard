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
