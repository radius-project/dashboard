import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface WorkflowPin {
  path: string;
  revision: string;
}

export interface ConsumerPolicy {
  status: 'pending' | 'approved';
  approval?: { owner: string; date: string; reference: string };
  maxPinAgeDays?: number;
  producer?: WorkflowPin & { repository: string };
  coordinator?: WorkflowPin;
  consumer?: WorkflowPin;
  requiredJobs?: string[];
  hostMatrix?: string[];
  toolchain?: {
    node: string;
    packageManager: string;
    compiler: string;
    react: string;
  };
}

export interface ConsumerPin {
  revision: string;
  lockSha256: string;
  node: string;
  packageManager: string;
  compiler: string;
  react: string;
  hostMatrix: string[];
  candidateRevision: string;
  runId: number;
  artifactId: number;
}

export type GitHubRead = (route: string) => Promise<unknown>;
type Json = Record<string, unknown>;
const sha = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Json => {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'Expected GitHub object',
  );
  return value as Json;
};
const text = (value: unknown) => {
  assert(
    typeof value === 'string' && value.length > 0,
    'Expected nonempty text',
  );
  return value;
};
const date = (value: unknown) => {
  const parsed = Date.parse(text(value));
  assert(Number.isFinite(parsed), 'Invalid evidence date');
  return parsed;
};
const list = (value: unknown): unknown[] => {
  assert(Array.isArray(value), 'Expected GitHub list');
  return value;
};

function workflow(pin: WorkflowPin | undefined) {
  assert(
    pin && sha(pin.revision),
    'Workflow requires an immutable trusted revision',
  );
  assert(
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/\.github\/workflows\/[a-zA-Z0-9_.-]+\.ya?ml$/.test(
      pin.path,
    ),
    'Expected repository-qualified workflow path',
  );
  return pin;
}

export function assertApprovedPolicy(policy: ConsumerPolicy) {
  assert(
    policy.status === 'approved',
    'T4 policy is not approved; consumer qualification is blocked',
  );
  const approval = policy.approval;
  assert(approval, 'Missing policy approval record');
  assert(
    approval.owner.trim() && approval.reference.trim(),
    'Missing policy approval record',
  );
  date(approval.date);
  const toolchain = policy.toolchain;
  assert(toolchain, 'Missing approved exact toolchain');
  for (const version of [toolchain.node, toolchain.compiler, toolchain.react]) {
    assert(
      /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version),
      'Toolchain versions must be exact',
    );
  }
  assert(
    /^yarn@[0-9]+\.[0-9]+\.[0-9]+$/.test(toolchain.packageManager),
    'Package manager must be exact',
  );
  assert(
    Number.isSafeInteger(policy.maxPinAgeDays) && policy.maxPinAgeDays! > 0,
    'Missing approved pin-age window',
  );
  assert(
    policy.producer &&
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(policy.producer.repository),
    'Missing producer repository',
  );
  assert(
    workflow(policy.producer).path.startsWith(`${policy.producer.repository}/`),
    'Producer workflow repository mismatch',
  );
  workflow(policy.coordinator);
  assert(
    workflow(policy.consumer).path.startsWith('radius-project/dashboard/'),
    'Consumer must invoke dashboard-owned journeys',
  );
  for (const [label, entries] of [
    ['jobs', policy.requiredJobs],
    ['hosts', policy.hostMatrix],
  ] as const) {
    assert(
      entries &&
        entries.length > 0 &&
        entries.every(entry => typeof entry === 'string' && entry.trim()),
      `Missing approved ${label}`,
    );
    assert.equal(
      new Set(entries).size,
      entries.length,
      `Duplicate approved ${label}`,
    );
  }
}

// The caller must load policy from a protected, pinned coordinator checkout,
// never from candidate artifacts or a candidate-controlled workflow revision.
// This function reads GitHub service records, not candidate success receipts.
export async function verifyConsumerPin(
  policy: ConsumerPolicy,
  pin: ConsumerPin,
  api: GitHubRead,
  now = Date.now(),
) {
  assertApprovedPolicy(policy);
  assert(
    sha(pin.revision) && sha(pin.candidateRevision) && digest(pin.lockSha256),
    'Invalid immutable consumer tuple',
  );
  assert.equal(
    pin.revision,
    policy.consumer!.revision,
    'Consumer pin and trusted journey workflow differ',
  );
  assert.deepEqual(
    pin.hostMatrix,
    policy.hostMatrix,
    'Consumer host matrix mismatch',
  );
  for (const id of [pin.runId, pin.artifactId]) {
    assert(Number.isSafeInteger(id) && id > 0, 'Invalid GitHub evidence ID');
  }
  const prefix = 'repos/radius-project/dashboard';
  const commit = object(await api(`${prefix}/commits/${pin.revision}`));
  assert.equal(commit.sha, pin.revision, 'Consumer revision mismatch');
  const committedAt = date(object(object(commit.commit).committer).date);
  assert(
    committedAt <= now &&
      now - committedAt <= policy.maxPinAgeDays! * 86_400_000,
    'Consumer pin is stale or future-dated',
  );
  const readFile = async (name: string) => {
    let file = object(
      await api(`${prefix}/contents/${name}?ref=${pin.revision}`),
    );
    if (file.encoding === 'none') {
      const blobSha = file.sha;
      assert(sha(blobSha), 'Expected immutable GitHub file blob');
      file = object(await api(`${prefix}/git/blobs/${blobSha}`));
      assert.equal(file.sha, blobSha, 'GitHub file blob mismatch');
    }
    assert.equal(file.encoding, 'base64', 'Expected GitHub file bytes');
    return Buffer.from(text(file.content).replaceAll('\n', ''), 'base64');
  };
  const lock = await readFile('yarn.lock');
  assert.equal(
    createHash('sha256').update(lock).digest('hex'),
    pin.lockSha256,
    'Consumer lock digest mismatch',
  );
  const manifest = JSON.parse(
    (await readFile('package.json')).toString('utf8'),
  );
  const node = (await readFile('.node-version')).toString('utf8').trim();
  assert(
    pin.node === node ||
      (/^[0-9]+$/.test(node) && pin.node.startsWith(`${node}.`)),
    'Consumer runtime mismatch',
  );
  assert.deepEqual(
    {
      node: pin.node,
      packageManager: pin.packageManager,
      compiler: pin.compiler,
      react: pin.react,
    },
    policy.toolchain,
    'Consumer exact toolchain mismatch',
  );
  assert.equal(
    pin.packageManager,
    manifest.packageManager,
    'Consumer package manager mismatch',
  );
  const app = JSON.parse(
    (await readFile('packages/app/package.json')).toString('utf8'),
  );
  const lockedVersion = (descriptor: string) => {
    const matches = lock
      .toString('utf8')
      .split(/\r?\n\r?\n/)
      .flatMap(block => {
        const lines = block.split(/\r?\n/);
        if (!lines[0].startsWith('"') || !lines[0].endsWith('":')) return [];
        const descriptors = text(JSON.parse(lines[0].slice(0, -1))).split(', ');
        if (!descriptors.includes(descriptor)) return [];
        const version = lines.find(line => line.startsWith('  version: '));
        assert(version, 'Missing locked toolchain version');
        return [version.slice('  version: '.length).replace(/^"|"$/g, '')];
      });
    assert.equal(
      matches.length,
      1,
      'Missing or ambiguous locked toolchain descriptor',
    );
    return matches[0];
  };
  assert.equal(
    pin.compiler,
    lockedVersion(`typescript@npm:${manifest.devDependencies.typescript}`),
    'Consumer compiler mismatch',
  );
  assert.equal(
    pin.react,
    lockedVersion(`react@npm:${app.dependencies.react}`),
    'Consumer React mismatch',
  );
  assert.equal(
    lockedVersion(`react-dom@npm:${app.dependencies['react-dom']}`),
    pin.react,
    'Consumer React DOM mismatch',
  );

  const producer = policy.producer!;
  const producerPrefix = `repos/${producer.repository}`;
  const run = object(await api(`${producerPrefix}/actions/runs/${pin.runId}`));
  assert.equal(run.id, pin.runId, 'Producer run ID mismatch');
  assert.equal(
    object(run.repository).full_name,
    producer.repository,
    'Producer repository mismatch',
  );
  assert.equal(
    object(run.head_repository).full_name,
    producer.repository,
    'Fork evidence is not qualification',
  );
  assert.equal(
    run.head_sha,
    pin.candidateRevision,
    'Candidate revision changed',
  );
  assert.equal(run.status, 'completed', 'Producer run is not complete');
  assert.equal(run.conclusion, 'success', 'Producer run did not succeed');
  assert(
    Number.isSafeInteger(run.run_attempt) && Number(run.run_attempt) > 0,
    'Invalid producer run attempt',
  );
  const completed = date(run.updated_at);
  assert(
    completed >= committedAt &&
      completed <= now &&
      now - completed <= policy.maxPinAgeDays! * 86_400_000,
    'Producer evidence is stale or future-dated',
  );
  const attempt = object(
    await api(
      `${producerPrefix}/actions/runs/${pin.runId}/attempts/${run.run_attempt}`,
    ),
  );
  assert.equal(attempt.id, pin.runId, 'Producer attempt run mismatch');
  assert.equal(
    attempt.run_attempt,
    run.run_attempt,
    'Producer attempt mismatch',
  );
  assert.equal(
    attempt.head_sha,
    pin.candidateRevision,
    'Attempt revision mismatch',
  );
  assert.equal(attempt.status, 'completed', 'Producer attempt is not complete');
  assert.equal(
    attempt.conclusion,
    'success',
    'Producer attempt did not succeed',
  );
  const started = date(attempt.run_started_at);
  assert(
    started >= committedAt && started <= completed,
    'Invalid producer attempt interval',
  );
  const producerPath = producer.path.slice(producer.repository.length + 1);
  assert.equal(run.path, producerPath, 'Producer workflow path mismatch');
  const workflowBytes = async (ref: string) =>
    object(await api(`${producerPrefix}/contents/${producerPath}?ref=${ref}`))
      .sha;
  const trustedWorkflowBlob = await workflowBytes(producer.revision);
  assert(sha(trustedWorkflowBlob), 'Missing trusted producer workflow');
  assert.equal(
    await workflowBytes(pin.candidateRevision),
    trustedWorkflowBlob,
    'Candidate changed the producer workflow',
  );
  const references = list(run.referenced_workflows).map(object);
  for (const expected of [policy.coordinator!, policy.consumer!]) {
    assert(
      references.some(
        reference =>
          reference.path === `${expected.path}@${expected.revision}` &&
          reference.sha === expected.revision,
      ),
      'Run did not invoke the pinned trusted coordinator and consumer workflows',
    );
  }

  const jobs: Json[] = [];
  for (let page = 1; ; page++) {
    assert(page <= 10, 'Producer job list exceeds evidence limit');
    const response = object(
      await api(
        `${producerPrefix}/actions/runs/${pin.runId}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
      ),
    );
    const batch = list(response.jobs).map(object);
    jobs.push(...batch);
    if (jobs.length >= Number(response.total_count)) break;
    assert(batch.length > 0, 'Incomplete producer job list');
  }
  for (const name of policy.requiredJobs!) {
    const matches = jobs.filter(job => job.name === name);
    assert.equal(
      matches.length,
      1,
      `Missing or ambiguous required job: ${name}`,
    );
    assert.equal(
      matches[0].status,
      'completed',
      `Required job is pending: ${name}`,
    );
    assert.equal(
      matches[0].conclusion,
      'success',
      `Required job did not succeed: ${name}`,
    );
  }
  const artifact = object(
    await api(`${producerPrefix}/actions/artifacts/${pin.artifactId}`),
  );
  assert.equal(artifact.id, pin.artifactId, 'Artifact ID mismatch');
  assert.equal(artifact.expired, false, 'Artifact is expired or missing');
  const created = date(artifact.created_at);
  assert(
    created >= started && created <= completed,
    'Artifact is not from the latest successful attempt',
  );
  const artifactRun = object(artifact.workflow_run);
  assert.equal(artifactRun.id, pin.runId, 'Artifact belongs to another run');
  assert.equal(
    artifactRun.head_sha,
    pin.candidateRevision,
    'Artifact belongs to another revision',
  );
  assert.equal(
    artifact.name,
    `dashboard-consumer-${pin.revision}-${pin.candidateRevision}`,
    'Artifact tuple mismatch',
  );
  assert(
    /^sha256:[a-f0-9]{64}$/.test(text(artifact.digest)),
    'Missing independent artifact digest',
  );
  return {
    consumerRevision: pin.revision,
    candidateRevision: pin.candidateRevision,
    runId: pin.runId,
    artifactId: pin.artifactId,
    artifactDigest: artifact.digest,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const policyFile = process.argv[2] ?? '.github/consumer-policy.json';
  const policy = JSON.parse(
    fs.readFileSync(policyFile, 'utf8'),
  ) as ConsumerPolicy;
  assertApprovedPolicy(policy);
  assert(process.argv[3], 'Expected independently qualified consumer pin file');
  const pin = JSON.parse(
    fs.readFileSync(process.argv[3], 'utf8'),
  ) as ConsumerPin;
  const token = process.env.GH_TOKEN;
  const api: GitHubRead = async route => {
    assert(route.startsWith('repos/'), 'Invalid GitHub API route');
    const response = await fetch(`https://api.github.com/${route}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    assert(response.ok, `GitHub evidence request failed (${response.status})`);
    return response.json();
  };
  console.log(
    JSON.stringify(await verifyConsumerPin(policy, pin, api), null, 2),
  );
}
