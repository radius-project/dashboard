import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Floors = Record<string, Record<string, number>>;
interface CoverageManifest {
  jest?: {
    coverageThreshold?: Floors;
    coveragePathIgnorePatterns?: string[];
  };
}
const metrics = ['statements', 'branches', 'functions', 'lines'] as const;
type CoverageSummary = Record<
  string,
  Record<(typeof metrics)[number], { covered: number; total: number }>
>;

function validateCoverageGroups(groups: Floors | undefined) {
  assert(groups && Object.keys(groups).length, 'Missing coverage groups');
  for (const [group, floors] of Object.entries(groups)) {
    assert(
      /^\.\/(packages|plugins)\/[^/]+\/src\/$/.test(group) &&
        !/[*!?]/.test(group) &&
        !group.includes('/../') &&
        !group.includes('/./'),
      'Expected a full-source coverage directory',
    );
    assert(Object.keys(floors).length, `Missing coverage metrics: ${group}`);
    for (const [metric, floor] of Object.entries(floors)) {
      assert(
        metrics.some(name => name === metric) &&
          Number.isFinite(floor) &&
          floor > 0 &&
          floor <= 100,
        `Coverage floor decreased or invalid: ${group}:${metric}`,
      );
    }
  }
  return groups;
}

export function compareMeasuredCoverage(
  manifest: CoverageManifest,
  baseRoot: string,
  base: CoverageSummary,
  candidateRoot: string,
  candidate: CoverageSummary,
) {
  const groups = validateCoverageGroups(manifest.jest?.coverageThreshold);
  const aggregate = (root: string, report: CoverageSummary, group: string) => {
    const directory = group.slice(2);
    const totals = metrics.map(() => ({ covered: 0, total: 0 }));
    let files = 0;
    for (const [file, summary] of Object.entries(report)) {
      if (file === 'total') continue;
      assert(path.isAbsolute(file), 'Coverage file path is not absolute');
      const relative = path.relative(root, file).replaceAll('\\', '/');
      assert(
        relative && !relative.startsWith('../') && !path.isAbsolute(relative),
        'Coverage file is outside its checkout',
      );
      if (!relative.startsWith(directory)) continue;
      files++;
      metrics.forEach((metric, index) => {
        const count = summary[metric];
        assert(
          count &&
            Number.isSafeInteger(count.total) &&
            Number.isSafeInteger(count.covered) &&
            count.covered >= 0 &&
            count.total >= count.covered,
          `Invalid measured coverage counters: ${group}:${metric}`,
        );
        totals[index].covered += count.covered;
        totals[index].total += count.total;
        assert(
          Number.isSafeInteger(totals[index].total),
          'Coverage counter exceeds safe limit',
        );
      });
    }
    assert(files > 0, `Missing measured coverage group: ${group}`);
    return totals;
  };
  for (const group of Object.keys(groups)) {
    const before = aggregate(baseRoot, base, group);
    const after = aggregate(candidateRoot, candidate, group);
    metrics.forEach((metric, index) => {
      // Empty branch/function sets have 100% coverage, as in Jest.
      const left = after[index];
      const right = before[index];
      assert(
        BigInt(left.total ? left.covered : 1) * BigInt(right.total || 1) >=
          BigInt(right.total ? right.covered : 1) * BigInt(left.total || 1),
        `Measured coverage decreased: ${group}:${metric}`,
      );
    });
  }
}

export function compareCoveragePolicy(
  base: CoverageManifest,
  candidate: CoverageManifest,
) {
  const before = validateCoverageGroups(base.jest?.coverageThreshold);
  const after = validateCoverageGroups(candidate.jest?.coverageThreshold);
  for (const [group, metrics] of Object.entries(before)) {
    assert(after[group], `Removed coverage group: ${group}`);
    for (const [metric, floor] of Object.entries(metrics)) {
      const current: number = after[group][metric];
      assert(
        Number.isFinite(floor) &&
          floor > 0 &&
          floor <= 100 &&
          Number.isFinite(current) &&
          current >= floor &&
          current <= 100,
        `Coverage floor decreased or invalid: ${group}:${metric}`,
      );
    }
  }
  assert.deepEqual(
    candidate.jest?.coveragePathIgnorePatterns ?? [],
    base.jest?.coveragePathIgnorePatterns ?? [],
    'Coverage exclusions changed; review this boundary separately',
  );
}

export function checkCoverageBase(root: string, revision: string) {
  assert(
    /^[a-f0-9]{40}$/.test(revision),
    'Coverage base must be an immutable 40-character commit',
  );
  const base = JSON.parse(
    execFileSync('git', ['show', `${revision}:package.json`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }),
  ) as CoverageManifest;
  const candidate = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as CoverageManifest;
  compareCoveragePolicy(base, candidate);
}

const stages = [
  'policy',
  'unit',
  'coverage',
  'standalone',
  'graph',
  'artifact',
  'installed',
] as const;
const outcomes = ['success', 'failure', 'cancelled', 'skipped'];

// Do not upload candidate logs, paths, request bodies, traces or screenshots.
// Only fixed stage names and validated GitHub metadata cross this boundary.
export function failureEvidence(
  revision: string,
  run: string,
  results: Record<string, string>,
) {
  assert(/^[a-f0-9]{40}$/.test(revision), 'Invalid evidence revision');
  assert(/^[1-9][0-9]{0,19}$/.test(run), 'Invalid evidence run ID');
  assert.deepEqual(Object.keys(results).sort(), [...stages].sort());
  for (const stage of stages) {
    assert(outcomes.includes(results[stage]), 'Invalid stage outcome');
  }
  const result = `${JSON.stringify({ revision, run, stages: results }, null, 2)}\n`;
  assert(Buffer.byteLength(result) <= 1024, 'Failure evidence exceeds limit');
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv[2] === 'coverage') {
    checkCoverageBase(process.cwd(), process.argv[3] ?? '');
    console.log('Root coverage floors and exclusions preserve the base policy');
  } else if (process.argv[2] === 'measured') {
    const [baseRoot, baseFile, candidateFile] = process.argv.slice(3);
    assert(
      baseRoot && baseFile && candidateFile,
      'Expected both measured reports',
    );
    compareMeasuredCoverage(
      JSON.parse(fs.readFileSync(path.join(baseRoot, 'package.json'), 'utf8')),
      path.resolve(baseRoot),
      JSON.parse(fs.readFileSync(baseFile, 'utf8')),
      process.cwd(),
      JSON.parse(fs.readFileSync(candidateFile, 'utf8')),
    );
    console.log('Measured coverage preserves every base group and metric');
  } else if (process.argv[2] === 'evidence') {
    const results = Object.fromEntries(
      stages.map(stage => [
        stage,
        process.env[`PHASE6_${stage.toUpperCase()}`] || 'skipped',
      ]),
    );
    const content = failureEvidence(
      process.env.GITHUB_SHA ?? '',
      process.env.GITHUB_RUN_ID ?? '',
      results,
    );
    assert(process.argv[3], 'Expected evidence output file');
    fs.writeFileSync(process.argv[3], content);
  } else {
    throw new Error(
      'Expected coverage <base-commit>, measured <base-root> <base-report> <candidate-report>, or evidence <output-file>',
    );
  }
}
