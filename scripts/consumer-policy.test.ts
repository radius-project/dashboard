import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { test } from 'node:test';
import {
  assertApprovedPolicy,
  verifyConsumerPin,
  type ConsumerPin,
  type ConsumerPolicy,
  type GitHubRead,
} from './consumer-policy.ts';

function fixture() {
  const consumer = 'a'.repeat(40);
  const candidate = 'b'.repeat(40);
  const coordinator = 'c'.repeat(40);
  const producer = 'd'.repeat(40);
  const blob = 'e'.repeat(40);
  const now = Date.parse('2026-11-12T12:00:00Z');
  const committed = '2026-11-11T12:00:00Z';
  const policy: ConsumerPolicy = {
    status: 'approved',
    approval: {
      owner: 'test-owner',
      date: committed,
      reference: 'test-only approval fixture',
    },
    maxPinAgeDays: 7,
    producer: {
      repository: 'radius-project/ai-extensions',
      path: 'radius-project/ai-extensions/.github/workflows/build.yml',
      revision: producer,
    },
    coordinator: {
      path: 'radius-project/ai-extensions/.github/workflows/coordinator.yml',
      revision: coordinator,
    },
    consumer: {
      path: 'radius-project/dashboard/.github/workflows/consumer.yml',
      revision: consumer,
    },
    requiredJobs: ['Owned consumer journeys', 'Candidate artifacts'],
    hostMatrix: [
      'legacy-external',
      'native-external',
      'native-standalone',
      'built-container',
    ],
    toolchain: {
      node: '24.22.0',
      packageManager: 'yarn@4.18.1',
      compiler: '6.0.3',
      react: '18.3.1',
    },
  };
  const lock = Buffer.from(
    '"typescript@npm:~6.0.3":\n  version: 6.0.3\n\n"react@npm:^18.3.1":\n  version: 18.3.1\n\n"react-dom@npm:^18.3.1":\n  version: 18.3.1\n',
  );
  const pin: ConsumerPin = {
    revision: consumer,
    lockSha256: createHash('sha256').update(lock).digest('hex'),
    node: '24.22.0',
    packageManager: 'yarn@4.18.1',
    compiler: '6.0.3',
    react: '18.3.1',
    hostMatrix: [...policy.hostMatrix!],
    candidateRevision: candidate,
    runId: 123,
    artifactId: 456,
  };
  const p = 'repos/radius-project/ai-extensions';
  const c = 'repos/radius-project/dashboard';
  const file = (bytes: Buffer) => ({
    encoding: 'base64',
    content: bytes.toString('base64'),
  });
  const run = {
    id: pin.runId,
    repository: { full_name: 'radius-project/ai-extensions' },
    head_repository: { full_name: 'radius-project/ai-extensions' },
    head_sha: candidate,
    status: 'completed',
    conclusion: 'success',
    updated_at: '2026-11-12T11:00:00Z',
    path: '.github/workflows/build.yml',
    run_attempt: 2,
    referenced_workflows: [policy.coordinator!, policy.consumer!].map(
      entry => ({
        path: `${entry.path}@${entry.revision}`,
        sha: entry.revision,
      }),
    ),
  };
  const jobs = {
    total_count: 2,
    jobs: policy.requiredJobs!.map(name => ({
      name,
      status: 'completed',
      conclusion: 'success',
    })),
  };
  const artifact = {
    id: pin.artifactId,
    expired: false,
    name: `dashboard-consumer-${consumer}-${candidate}`,
    digest: `sha256:${'f'.repeat(64)}`,
    created_at: '2026-11-12T10:30:00Z',
    workflow_run: { id: pin.runId, head_sha: candidate },
  };
  const routes: Record<string, unknown> = {
    [`${c}/commits/${consumer}`]: {
      sha: consumer,
      commit: { committer: { date: committed } },
    },
    [`${c}/contents/yarn.lock?ref=${consumer}`]: file(lock),
    [`${c}/contents/.node-version?ref=${consumer}`]: file(Buffer.from('24\n')),
    [`${c}/contents/package.json?ref=${consumer}`]: file(
      Buffer.from(
        JSON.stringify({
          packageManager: pin.packageManager,
          devDependencies: { typescript: '~6.0.3' },
        }),
      ),
    ),
    [`${c}/contents/packages/app/package.json?ref=${consumer}`]: file(
      Buffer.from(
        JSON.stringify({
          dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        }),
      ),
    ),
    [`${p}/actions/runs/123`]: run,
    [`${p}/actions/runs/123/attempts/2`]: {
      id: pin.runId,
      run_attempt: 2,
      head_sha: candidate,
      status: 'completed',
      conclusion: 'success',
      run_started_at: '2026-11-12T10:00:00Z',
    },
    [`${p}/contents/.github/workflows/build.yml?ref=${producer}`]: {
      sha: blob,
    },
    [`${p}/contents/.github/workflows/build.yml?ref=${candidate}`]: {
      sha: blob,
    },
    [`${p}/actions/runs/123/attempts/2/jobs?per_page=100&page=1`]: jobs,
    [`${p}/actions/artifacts/456`]: artifact,
  };
  const api: GitHubRead = async route => {
    assert(Object.hasOwn(routes, route), `Unexpected GitHub request: ${route}`);
    return structuredClone(routes[route]);
  };
  return { policy, pin, now, routes, run, jobs, artifact, api };
}

test('CP-01/04: qualify immutable consumer tuple from independent service records', async () => {
  const f = fixture();
  const result = await verifyConsumerPin(f.policy, f.pin, f.api, f.now);
  assert.equal(result.artifactDigest, f.artifact.digest);
  assert.equal(result.consumerRevision, f.pin.revision);
});

test('unapproved invocation policy cannot yield successful evidence', () => {
  const pending = JSON.parse(
    fs.readFileSync('.github/consumer-policy.json', 'utf8'),
  );
  assert.throws(() => assertApprovedPolicy(pending), /not approved/);
  const f = fixture();
  delete f.policy.approval;
  assert.throws(() => assertApprovedPolicy(f.policy), /approval/);
});

test('CP-01: reject changed lock, toolchain, host matrix and mutable refs', async () => {
  for (const change of [
    { revision: 'main' },
    { lockSha256: '0'.repeat(64) },
    { node: '26' },
    { compiler: '~7.0.0' },
    { packageManager: 'yarn@5.0.0' },
    { react: '^19' },
    { hostMatrix: ['native-external'] },
    { runId: 0 },
    { artifactId: -1 },
  ]) {
    const f = fixture();
    await assert.rejects(
      verifyConsumerPin(f.policy, { ...f.pin, ...change }, f.api, f.now),
    );
  }
});

test('CP-05: reject expired/future pin or evidence; accept the exact approved age limit', async () => {
  const f = fixture();
  await verifyConsumerPin(f.policy, f.pin, f.api, f.now + 6 * 86_400_000);
  await assert.rejects(
    verifyConsumerPin(f.policy, f.pin, f.api, f.now + 6 * 86_400_000 + 1),
    /stale/,
  );
  await assert.rejects(
    verifyConsumerPin(f.policy, f.pin, f.api, f.now - 2 * 86_400_000),
    /future/,
  );
  f.run.updated_at = '2026-11-20T11:00:00Z';
  await assert.rejects(
    verifyConsumerPin(f.policy, f.pin, f.api, f.now),
    /future/,
  );
});

test('CP-03/04: reject forged producer, run, revision, workflow or coordinator evidence', async () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => {
      f.run.repository.full_name = 'other/repository';
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.head_repository.full_name = 'fork/repository';
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.id++;
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.head_sha = '0'.repeat(40);
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.path = '.github/workflows/fake.yml';
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.referenced_workflows.pop();
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.referenced_workflows[0].sha = '0'.repeat(40);
    },
    (f: ReturnType<typeof fixture>) => {
      f.run.referenced_workflows[1].path = 'candidate/report@main';
    },
    (f: ReturnType<typeof fixture>) => {
      f.routes[
        `repos/radius-project/ai-extensions/contents/.github/workflows/build.yml?ref=${f.pin.candidateRevision}`
      ] = { sha: '0'.repeat(40) };
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f);
    await assert.rejects(verifyConsumerPin(f.policy, f.pin, f.api, f.now));
  }
});

test('reject missing, skipped, pending, cancelled, failed and ambiguous required jobs', async () => {
  for (const conclusion of [
    'skipped',
    'cancelled',
    'failure',
    'timed_out',
    'neutral',
    null,
  ]) {
    const f = fixture();
    Object.assign(f.jobs.jobs[0], { conclusion });
    await assert.rejects(
      verifyConsumerPin(f.policy, f.pin, f.api, f.now),
      /did not succeed/,
    );
  }
  for (const status of ['queued', 'in_progress', 'waiting', 'pending']) {
    const f = fixture();
    f.jobs.jobs[0].status = status;
    await assert.rejects(
      verifyConsumerPin(f.policy, f.pin, f.api, f.now),
      /pending/,
    );
  }
  for (const duplicate of [true, false]) {
    const f = fixture();
    f.jobs.jobs = duplicate
      ? [f.jobs.jobs[0], f.jobs.jobs[0]]
      : [f.jobs.jobs[0]];
    f.jobs.total_count = f.jobs.jobs.length;
    await assert.rejects(
      verifyConsumerPin(f.policy, f.pin, f.api, f.now),
      /Missing or ambiguous/,
    );
  }
  const f = fixture();
  f.run.conclusion = 'cancelled';
  await assert.rejects(
    verifyConsumerPin(f.policy, f.pin, f.api, f.now),
    /did not succeed/,
  );
});

test('latest run attempt, pagination and missing service records cannot be bypassed', async () => {
  const f = fixture();
  const second = f.jobs.jobs.pop()!;
  f.routes[
    'repos/radius-project/ai-extensions/actions/runs/123/attempts/2/jobs?per_page=100&page=2'
  ] = { total_count: 2, jobs: [second] };
  await verifyConsumerPin(f.policy, f.pin, f.api, f.now);
  delete f.routes[
    'repos/radius-project/ai-extensions/actions/runs/123/attempts/2/jobs?per_page=100&page=2'
  ];
  await assert.rejects(
    verifyConsumerPin(f.policy, f.pin, f.api, f.now),
    /Unexpected GitHub request/,
  );
});

test('reject expired, substituted or unbound artifacts, even with a success receipt', async () => {
  for (const change of [
    { expired: true },
    { id: 789 },
    { name: 'success-report' },
    { digest: undefined },
    { digest: 'candidate-supplied-success' },
    { created_at: '2026-11-12T09:00:00Z' },
    { created_at: '2026-11-12T11:30:00Z' },
    { workflow_run: { id: 789, head_sha: 'b'.repeat(40) } },
    { workflow_run: { id: 123, head_sha: '0'.repeat(40) } },
  ]) {
    const f = fixture();
    Object.assign(f.artifact, change);
    await assert.rejects(verifyConsumerPin(f.policy, f.pin, f.api, f.now));
  }
});
