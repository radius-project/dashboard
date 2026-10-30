import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runReleaseImage } from './release-image.ts';
import type { CommandResult, CommandRunner } from './release-image.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'ghcr.io/radius-project/dashboard';
const builtImage = `${repository}:latest`;
const revisionLabel = 'org.opencontainers.image.revision';
const versionLabel = 'org.opencontainers.image.version';
const digest = `sha256:${'d'.repeat(64)}`;
const pinned = `${repository}@${digest}`;
let fixture: string;
let revision: string;

function git(args: string[]): CommandResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'),
    GIT_CONFIG_COUNT: '0',
  };
  for (const name of [
    'GIT_DIR',
    'GIT_COMMON_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_CONFIG_PARAMETERS',
  ]) {
    delete env[name];
  }
  const result = spawnSync('git', args, {
    cwd: fixture,
    encoding: 'utf8',
    env,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, null, 'Git must exit normally');
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'dashboard-release-image-'));
  for (const args of [
    ['init', '--quiet'],
    [
      '-c',
      'user.name=Image test',
      '-c',
      'user.email=image-test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'fixture',
    ],
  ]) {
    const result = git(args);
    assert.equal(result.status, 0, result.stderr);
  }
  const result = git(['rev-parse', '--verify', 'HEAD']);
  assert.equal(result.status, 0, result.stderr);
  revision = result.stdout.trim();
});

after(() => {
  if (fixture) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function releaseEnv(version = '0.60.0'): NodeJS.ProcessEnv {
  return {
    REL_VERSION: version,
    REL_CHANNEL: '0.60',
    GITHUB_REF: `refs/tags/v${version}`,
    GITHUB_SHA: 'b'.repeat(40),
    CI_PUBLISH_RELEASE: 'true',
    BUILT_IMAGE: builtImage,
  };
}

type Metadata = {
  Id: string;
  Os: string;
  Architecture: string;
  Variant?: string;
  Config: { Labels: Record<string, string> };
};

function metadata(version: string, id = 'different-local-build'): Metadata {
  return {
    Id: id,
    Os: 'linux',
    Architecture: 'amd64',
    Config: { Labels: { [revisionLabel]: revision, [versionLabel]: version } },
  };
}

function manifestDescriptor() {
  return {
    Descriptor: {
      mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      digest,
      platform: { os: 'linux', architecture: 'amd64' },
    },
  };
}

function attestationDescriptor() {
  return {
    Descriptor: {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: `sha256:${'e'.repeat(64)}`,
      platform: { os: 'unknown', architecture: 'unknown' },
      annotations: {
        'vnd.docker.reference.type': 'attestation-manifest',
        'vnd.docker.reference.digest': digest,
      },
    },
  };
}

type ScenarioOptions = {
  present?: boolean;
  remote?: Metadata;
  local?: Metadata;
  manifest?: unknown;
  manifestOutput?: string;
  queryError?: string;
  memberError?: string;
  gitError?: string;
  missingAfterPush?: boolean;
  missingMessage?: string;
};

function scenario(version = '0.60.0', options: ScenarioOptions = {}) {
  let present = options.present ?? false;
  let remote = options.remote ?? metadata(version, 'original-published-build');
  let local = options.local ?? metadata(version);
  const calls: { command: string; args: string[] }[] = [];
  const logs: string[] = [];
  const ok = (value = ''): CommandResult => ({
    status: 0,
    stdout: value,
    stderr: '',
  });
  const run: CommandRunner = (command, args) => {
    calls.push({ command, args });
    if (command === 'git') {
      assert.deepEqual(args, ['rev-parse', '--verify', 'HEAD']);
      return options.gitError
        ? { status: 1, stdout: '', stderr: options.gitError }
        : git(args);
    }
    assert.equal(command, 'docker');
    if (args[0] === 'buildx') {
      assert.deepEqual(args, [
        'buildx',
        'imagetools',
        'inspect',
        '--raw',
        `${repository}:${version}`,
      ]);
      if (options.queryError) {
        return { status: 1, stdout: '', stderr: options.queryError };
      }
      return present
        ? ok('{}')
        : {
            status: 1,
            stdout: '',
            stderr:
              options.missingMessage ??
              `ERROR: ${repository}:${version}: not found\n`,
          };
    }
    if (args[0] === 'manifest') {
      assert.deepEqual(args, [
        'manifest',
        'inspect',
        '--verbose',
        `${repository}:${version}`,
      ]);
      assert.ok(present, 'Members are inspected only for an existing tag');
      if (options.memberError) {
        return { status: 1, stdout: '', stderr: options.memberError };
      }
      return ok(
        options.manifestOutput ??
          JSON.stringify(options.manifest ?? manifestDescriptor()),
      );
    }
    if (args[0] === 'image') {
      assert.equal(args[1], 'inspect');
      assert.ok(args[2] === builtImage || args[2] === pinned);
      return ok(JSON.stringify([args[2] === builtImage ? local : remote]));
    }
    if (args[0] === 'pull') {
      assert.deepEqual(args, ['pull', '--platform', 'linux/amd64', pinned]);
      return ok();
    }
    if (args[0] === 'tag' && args[1] === pinned) {
      assert.equal(args[2], builtImage);
      local = remote;
      return ok();
    }
    if (args[0] === 'push') {
      assert.equal(args[1], `${repository}:${version}`);
      present = !options.missingAfterPush;
      remote = local;
      return ok();
    }
    assert.ok(
      args[0] === 'build' || args[0] === 'tag',
      `Unexpected command: docker ${args.join(' ')}`,
    );
    return ok();
  };
  return {
    run,
    calls,
    logs,
    log: (message: string) => logs.push(message),
    setRemote: (value: Metadata) => {
      present = true;
      remote = value;
    },
  };
}

function dockerCalls(
  state: ReturnType<typeof scenario>,
  verb: string,
): string[][] {
  return state.calls
    .filter(call => call.command === 'docker' && call.args[0] === verb)
    .map(call => call.args);
}

function parsedEnvironment(ref: string): NodeJS.ProcessEnv {
  const directory = mkdtempSync(join(tmpdir(), 'dashboard-release-version-'));
  try {
    const environmentFile = join(directory, 'github-env');
    const result = spawnSync(
      process.platform === 'win32' ? 'python' : 'python3',
      [join(root, '.github', 'scripts', 'get_release_version.py')],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_REF: ref, GITHUB_ENV: environmentFile },
      },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(
      readFileSync(environmentFile, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map(line => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1),
        ]),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const entry of [
  {
    name: 'RC',
    ref: 'refs/tags/v0.60.0-rc.1',
    version: '0.60.0-rc.1',
    channel: '0.60.0-rc.1',
    release: true,
  },
  {
    name: 'final',
    ref: 'refs/tags/v0.60.0',
    version: '0.60.0',
    channel: '0.60',
    release: true,
  },
  {
    name: 'patch',
    ref: 'refs/tags/v0.60.1',
    version: '0.60.1',
    channel: '0.60',
    release: true,
  },
  {
    name: 'fork release',
    ref: 'refs/tags/v0.60.0',
    version: '0.60.0',
    channel: '0.60',
    release: false,
  },
  {
    name: 'main edge',
    ref: 'refs/heads/main',
    version: 'edge',
    channel: 'edge',
    release: false,
  },
  {
    name: 'pull request',
    ref: 'refs/pull/123/merge',
    version: 'pr-123',
    channel: 'edge',
    release: false,
  },
]) {
  test(`${entry.name}: actual build receives checkout provenance and only releases stage full-version tags`, () => {
    const parsed = parsedEnvironment(entry.ref);
    assert.equal(parsed.REL_VERSION, entry.version);
    assert.equal(parsed.REL_CHANNEL, entry.channel);
    const env: NodeJS.ProcessEnv = {
      ...releaseEnv(entry.version),
      ...parsed,
      GITHUB_REF: entry.ref,
      CI_PUBLISH_RELEASE: String(entry.release),
    };
    const state = scenario(entry.version);
    runReleaseImage('build', env, state.run, state.log);
    const [build] = dockerCalls(state, 'build');
    assert.deepEqual(build, [
      'build',
      '.',
      '-f',
      join('packages', 'backend', 'Dockerfile'),
      '-t',
      builtImage,
      '--label',
      `${revisionLabel}=${revision}`,
      '--label',
      `${versionLabel}=${entry.version}`,
      ...(entry.release ? ['--platform', 'linux/amd64'] : []),
    ]);
    assert.notEqual(revision, env.GITHUB_SHA);
    if (entry.release) {
      runReleaseImage('stage', env, state.run, state.log);
      assert.deepEqual(dockerCalls(state, 'tag'), [
        ['tag', builtImage, `${repository}:${entry.version}`],
      ]);
      assert.deepEqual(dockerCalls(state, 'push'), [
        ['push', `${repository}:${entry.version}`],
      ]);
      assert.equal(
        dockerCalls(state, 'buildx').length,
        3,
        'Probe before build, before push, and after publication',
      );
      assert.equal(
        dockerCalls(state, 'manifest').length,
        1,
        'Inspect members only after publication creates the tag',
      );
    } else {
      assert.equal(dockerCalls(state, 'buildx').length, 0);
      assert.equal(dockerCalls(state, 'manifest').length, 0);
      assert.throws(
        () => runReleaseImage('stage', env, state.run, state.log),
        /requires CI_PUBLISH_RELEASE=true/,
      );
      assert.equal(dockerCalls(state, 'push').length, 0);
    }
  });
}

test('local builds stamp edge and the checkout revision without querying the registry', () => {
  const state = scenario('edge');
  runReleaseImage('build', {}, state.run, state.log);
  assert.ok(dockerCalls(state, 'build')[0].includes(`${versionLabel}=edge`));
  assert.equal(dockerCalls(state, 'buildx').length, 0);
  assert.equal(dockerCalls(state, 'manifest').length, 0);
});

for (const version of ['0.60.0-rc.1', '0.60.0', '0.60.1']) {
  test(`${version}: reuse matching immutable output by digest, without rebuilding or comparing build IDs`, () => {
    const state = scenario(version, { present: true });
    runReleaseImage('build', releaseEnv(version), state.run, state.log);
    runReleaseImage('stage', releaseEnv(version), state.run, state.log);
    assert.equal(dockerCalls(state, 'build').length, 0);
    assert.equal(dockerCalls(state, 'push').length, 0);
    assert.deepEqual(dockerCalls(state, 'tag'), [['tag', pinned, builtImage]]);
    assert.ok(state.logs.some(message => message.includes('no push needed')));
  });
}

test('a matching single-platform OCI index is reusable', () => {
  const manifest = manifestDescriptor();
  manifest.Descriptor.mediaType = 'application/vnd.oci.image.manifest.v1+json';
  const state = scenario('0.60.0', { present: true, manifest: [manifest] });
  runReleaseImage('build', releaseEnv(), state.run, state.log);
  assert.equal(dockerCalls(state, 'build').length, 0);
});

test('reuse an attestation-bearing index without pushing or replacing the original index', () => {
  const state = scenario('0.60.0', {
    present: true,
    manifest: [attestationDescriptor(), manifestDescriptor()],
  });
  runReleaseImage('build', releaseEnv(), state.run, state.log);
  runReleaseImage('stage', releaseEnv(), state.run, state.log);
  assert.equal(dockerCalls(state, 'build').length, 0);
  assert.equal(dockerCalls(state, 'push').length, 0);
  assert.deepEqual(dockerCalls(state, 'tag'), [['tag', pinned, builtImage]]);
  assert.deepEqual(dockerCalls(state, 'pull'), [
    ['pull', '--platform', 'linux/amd64', pinned],
    ['pull', '--platform', 'linux/amd64', pinned],
  ]);
});

test('post-push verification accepts an attestation-bearing index without a second push', () => {
  const state = scenario('0.60.0', {
    manifest: [manifestDescriptor(), attestationDescriptor()],
  });
  runReleaseImage('build', releaseEnv(), state.run, state.log);
  runReleaseImage('stage', releaseEnv(), state.run, state.log);
  assert.deepEqual(dockerCalls(state, 'push'), [
    ['push', `${repository}:0.60.0`],
  ]);
  assert.deepEqual(dockerCalls(state, 'tag'), [
    ['tag', builtImage, `${repository}:0.60.0`],
  ]);
});

for (const entry of [
  { name: 'attestation-only', manifest: [attestationDescriptor()] },
  {
    name: 'extra runnable platform',
    manifest: [
      manifestDescriptor(),
      attestationDescriptor(),
      {
        Descriptor: {
          ...manifestDescriptor().Descriptor,
          platform: { os: 'linux', architecture: 'arm64' },
        },
      },
    ],
  },
  { name: 'missing descriptor', manifest: [manifestDescriptor(), {}] },
  {
    name: 'missing attestation architecture',
    manifest: [
      manifestDescriptor(),
      {
        Descriptor: {
          ...attestationDescriptor().Descriptor,
          platform: { os: 'unknown' },
        },
      },
    ],
  },
  {
    name: 'partially unknown platform',
    manifest: [
      manifestDescriptor(),
      {
        Descriptor: {
          ...attestationDescriptor().Descriptor,
          platform: { os: 'unknown', architecture: 'amd64' },
        },
      },
    ],
  },
  {
    name: 'unexpected attestation variant',
    manifest: [
      manifestDescriptor(),
      {
        Descriptor: {
          ...attestationDescriptor().Descriptor,
          platform: { os: 'unknown', architecture: 'unknown', variant: 'v2' },
        },
      },
    ],
  },
  {
    name: 'malformed attestation digest',
    manifest: [
      manifestDescriptor(),
      {
        Descriptor: {
          ...attestationDescriptor().Descriptor,
          digest: 'not-a-digest',
        },
      },
    ],
  },
  {
    name: 'unsupported attestation media type',
    manifest: [
      manifestDescriptor(),
      {
        Descriptor: {
          ...attestationDescriptor().Descriptor,
          mediaType: 'application/octet-stream',
        },
      },
    ],
  },
]) {
  test(`reject malformed or incompatible attestation indexes: ${entry.name}`, () => {
    const state = scenario('0.60.0', {
      present: true,
      manifest: entry.manifest,
    });
    assert.throws(
      () => runReleaseImage('build', releaseEnv(), state.run, state.log),
      /expected|invalid|missing/,
    );
    assert.equal(dockerCalls(state, 'build').length, 0);
    assert.equal(dockerCalls(state, 'pull').length, 0);
    assert.equal(dockerCalls(state, 'tag').length, 0);
    assert.equal(dockerCalls(state, 'push').length, 0);
  });
}

for (const label of [revisionLabel, versionLabel]) {
  for (const missing of [false, true]) {
    test(`existing tag with ${missing ? 'missing' : 'conflicting'} ${label} fails without overwriting`, () => {
      const remote = metadata('0.60.0');
      if (missing) {
        delete remote.Config.Labels[label];
      } else {
        remote.Config.Labels[label] = 'conflict';
      }
      const state = scenario('0.60.0', { present: true, remote });
      assert.throws(
        () => runReleaseImage('build', releaseEnv(), state.run, state.log),
        /Image metadata is missing|refusing to replace/,
      );
      assert.equal(dockerCalls(state, 'build').length, 0);
      assert.equal(dockerCalls(state, 'tag').length, 0);
      assert.equal(dockerCalls(state, 'push').length, 0);
    });
  }

  test(`the built image must actually contain ${label}`, () => {
    const local = metadata('0.60.0');
    delete local.Config.Labels[label];
    const state = scenario('0.60.0', { local });
    assert.throws(
      () => runReleaseImage('build', releaseEnv(), state.run, state.log),
      /Image metadata is missing/,
    );
    assert.equal(dockerCalls(state, 'push').length, 0);
  });
}

for (const remotePlatform of [
  { Os: 'linux', Architecture: 'arm64' },
  { Os: 'windows', Architecture: 'amd64' },
  { Os: 'linux', Architecture: 'amd64', Variant: 'v2' },
]) {
  test(`reject incompatible image configuration ${JSON.stringify(remotePlatform)}`, () => {
    const remote = { ...metadata('0.60.0'), ...remotePlatform };
    const state = scenario('0.60.0', { present: true, remote });
    assert.throws(
      () => runReleaseImage('build', releaseEnv(), state.run, state.log),
      /platform is .*expected linux\/amd64/,
    );
    assert.equal(dockerCalls(state, 'tag').length, 0);
  });
}

for (const manifest of [
  [],
  [manifestDescriptor(), manifestDescriptor()],
  {
    Descriptor: {
      ...manifestDescriptor().Descriptor,
      platform: { os: 'linux', architecture: 'arm64' },
    },
  },
  {
    Descriptor: { ...manifestDescriptor().Descriptor, digest: 'not-a-digest' },
  },
  {
    Descriptor: {
      ...manifestDescriptor().Descriptor,
      mediaType: 'application/vnd.oci.image.index.v1+json',
    },
  },
  {},
]) {
  test(`reject unsupported or incomplete manifest ${JSON.stringify(manifest)}`, () => {
    const state = scenario('0.60.0', { present: true, manifest });
    assert.throws(
      () => runReleaseImage('build', releaseEnv(), state.run, state.log),
      /expected|invalid/,
    );
    assert.equal(dockerCalls(state, 'pull').length, 0);
    assert.equal(dockerCalls(state, 'build').length, 0);
    assert.equal(dockerCalls(state, 'push').length, 0);
  });
}

for (const queryError of [
  'unauthorized: authentication required',
  'denied: access forbidden',
  'TLS handshake timeout',
  'connection refused',
  '429 Too Many Requests',
  'no matching manifest for linux/amd64',
  'unauthorized: manifest unknown',
  'manifest unknown\nTLS handshake timeout',
  'manifest unknown: connection refused',
  'manifest unknown',
  `no such manifest: ${repository}:0.60.0`,
  `ERROR: ${repository}:0.60.1: not found`,
]) {
  test(`registry failure does not authorize a new tag: ${queryError}`, () => {
    const state = scenario('0.60.0', { queryError });
    assert.throws(
      () => runReleaseImage('build', releaseEnv(), state.run, state.log),
      /Cannot query/,
    );
    assert.equal(dockerCalls(state, 'build').length, 0);
    assert.equal(dockerCalls(state, 'push').length, 0);
  });
}

for (const memberError of [
  'manifest unknown',
  `no such manifest: ${repository}:0.60.0`,
]) {
  test(`an existing index with a missing member is never replaced: ${memberError}`, () => {
    const state = scenario('0.60.0', { present: true, memberError });
    assert.throws(
      () => runReleaseImage('build', releaseEnv(), state.run, state.log),
      /docker manifest inspect --verbose .* failed/,
    );
    assert.throws(
      () => runReleaseImage('stage', releaseEnv(), state.run, state.log),
      /docker manifest inspect --verbose .* failed/,
    );
    assert.equal(dockerCalls(state, 'build').length, 0);
    assert.equal(dockerCalls(state, 'tag').length, 0);
    assert.equal(dockerCalls(state, 'push').length, 0);
  });
}

test('only an explicit top-level not-found response permits building a missing release', () => {
  const state = scenario('0.60.0');
  runReleaseImage('build', releaseEnv(), state.run, state.log);
  assert.equal(dockerCalls(state, 'build').length, 1);
  assert.equal(dockerCalls(state, 'manifest').length, 0);
});

test('invalid manifest JSON fails closed', () => {
  const state = scenario('0.60.0', {
    present: true,
    manifestOutput: 'invalid json',
  });
  assert.throws(
    () => runReleaseImage('build', releaseEnv(), state.run, state.log),
    SyntaxError,
  );
  assert.equal(dockerCalls(state, 'push').length, 0);
});

for (const version of [
  'edge',
  '0.60',
  'v0.60.0',
  '0.60.0+build.1',
  '0.60.0-01',
  '00.60.0',
  '0.60.0/other',
]) {
  test(`invalid release version ${version} never reaches Docker`, () => {
    const state = scenario(version);
    assert.throws(
      () => runReleaseImage('build', releaseEnv(version), state.run, state.log),
      /full Docker-compatible REL_VERSION/,
    );
    assert.equal(state.calls.length, 0);
  });
}

test('release version must match the source tag', () => {
  const state = scenario();
  assert.throws(
    () =>
      runReleaseImage(
        'build',
        { ...releaseEnv(), GITHUB_REF: 'refs/tags/v0.60.1' },
        state.run,
        state.log,
      ),
    /matching GITHUB_REF/,
  );
  assert.equal(state.calls.length, 0);
});

test('Git failure cannot fall back to GITHUB_SHA', () => {
  const state = scenario('0.60.0', { gitError: 'not a git repository' });
  assert.throws(
    () => runReleaseImage('build', releaseEnv(), state.run, state.log),
    /not a git repository/,
  );
  assert.equal(dockerCalls(state, 'build').length, 0);
});

test('a conflicting tag appearing after the build is not overwritten at publication', () => {
  const state = scenario();
  runReleaseImage('build', releaseEnv(), state.run, state.log);
  const conflicting = metadata('0.60.0');
  conflicting.Config.Labels[revisionLabel] = 'a'.repeat(40);
  state.setRemote(conflicting);
  assert.throws(
    () => runReleaseImage('stage', releaseEnv(), state.run, state.log),
    /refusing to replace/,
  );
  assert.equal(dockerCalls(state, 'push').length, 0);
});

test('a matching tag appearing after the build is reused despite different build output', () => {
  const state = scenario();
  runReleaseImage('build', releaseEnv(), state.run, state.log);
  state.setRemote(metadata('0.60.0', 'different-existing-image-id'));
  runReleaseImage('stage', releaseEnv(), state.run, state.log);
  assert.equal(dockerCalls(state, 'push').length, 0);
});

test('a missing release after push cannot be reported as successfully staged', () => {
  const state = scenario('0.60.0', { missingAfterPush: true });
  assert.throws(
    () => runReleaseImage('stage', releaseEnv(), state.run, state.log),
    /missing after publication/,
  );
});

test('the CLI rejects unknown commands without attempting a build', () => {
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'release-image.ts'), 'invalid'],
    { encoding: 'utf8' },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Usage: node scripts\/release-image.ts <build\|stage>/,
  );
});

test('the actual build chain, offline CI tests, validation gates, and latest publishing remain wired', () => {
  const rootPackage = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  const backendPackage = JSON.parse(
    readFileSync(join(root, 'packages', 'backend', 'package.json'), 'utf8'),
  );
  assert.equal(
    rootPackage.scripts['build-image'],
    'yarn workspace @internal/backend build-image',
  );
  assert.equal(
    backendPackage.scripts['build-image'],
    'node ../../scripts/release-image.ts build',
  );
  assert.equal(
    rootPackage.scripts['test:release-images'],
    'node --test scripts/release-image.test.ts',
  );
  assert.equal(
    rootPackage.scripts['test:qualification-runners'],
    'node --test scripts/qualify-plugin-host.test.ts',
  );
  assert.match(
    rootPackage.scripts['test:all'],
    /^yarn test:release-images && yarn test:qualification-runners && backstage-cli repo test --coverage$/,
  );

  const workflow = readFileSync(
    join(root, '.github', 'workflows', 'build.yaml'),
    'utf8',
  );
  assert.match(workflow, /run: yarn run test:all/);
  assert.match(workflow, /- name: Build Image\s+run: yarn run build-image/);
  assert.match(workflow, /run: node scripts\/release-image.ts stage/);
  assert.doesNotMatch(workflow, /REL_CHANNEL/);
  assert.match(
    workflow,
    /group: dashboard-container-.*github\.ref \|\| github\.run_id/,
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.ok(
    workflow.indexOf('- name: Login to ghcr.io') <
      workflow.indexOf('- name: Build Image'),
  );
  assert.ok(
    workflow.indexOf('- name: Build Image') <
      workflow.indexOf('- name: Start built container'),
  );
  assert.ok(
    workflow.indexOf('- name: Run E2E Tests Against Built Container') <
      workflow.indexOf('- name: Stage immutable image'),
  );
  assert.ok(
    workflow.indexOf('- name: Analyze Image') <
      workflow.indexOf('- name: Stage immutable image'),
  );
  assert.match(
    workflow,
    /run: docker run -d --rm --name dashboard-e2e -p 7007:7007 "\$\{BUILT_IMAGE\}"/,
  );
  assert.match(
    workflow,
    /PLAYWRIGHT_URL=http:\/\/localhost:7007 PLAYWRIGHT_DISABLE_WEBSERVER=true yarn run test:e2e/,
  );
  assert.match(
    workflow,
    /- name: Push Image to ghcr.io \(push to main\)\s+if: \$\{\{ env.CI_PUBLISH_LATEST == 'true' \}\}\s+run: \|\s+docker push "\$\{BUILT_IMAGE\}"/,
  );
  for (const command of ['test:e2e', 'test:e2e:components', 'test:package']) {
    assert.ok(workflow.includes(`run: yarn run ${command}`));
  }
});
