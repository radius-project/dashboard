import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'ghcr.io/radius-project/dashboard';
const revisionLabel = 'org.opencontainers.image.revision';
const versionLabel = 'org.opencontainers.image.version';
const releasePlatform = 'linux/amd64';
const manifestTypes = new Set([
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
]);

export type CommandResult = { status: number; stdout: string; stderr: string };
export type CommandRunner = (
  command: string,
  args: string[],
  stream?: boolean,
) => CommandResult;

const runCommand: CommandRunner = (command, args, stream = false) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: stream ? 'inherit' : 'pipe',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status === null) {
    throw new Error(
      `${command} terminated without an exit code (${result.signal})`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

function checked(
  run: CommandRunner,
  command: string,
  args: string[],
  stream = false,
): string {
  const result = run(command, args, stream);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(object: unknown, key: string): string {
  if (!record(object) || typeof object[key] !== 'string' || !object[key]) {
    throw new Error(`Image metadata is missing ${key}`);
  }
  return object[key];
}

function platform(metadata: unknown): string {
  const os = requiredString(metadata, 'os');
  const architecture = requiredString(metadata, 'architecture');
  if (
    record(metadata) &&
    metadata.variant !== undefined &&
    metadata.variant !== ''
  ) {
    return `${os}/${architecture}/${requiredString(metadata, 'variant')}`;
  }
  return `${os}/${architecture}`;
}

type Provenance = { revision: string; version: string };

function verifyImage(
  run: CommandRunner,
  image: string,
  expected: Provenance,
  release: boolean,
): void {
  const inspected: unknown = JSON.parse(
    checked(run, 'docker', ['image', 'inspect', image]),
  );
  if (
    !Array.isArray(inspected) ||
    inspected.length !== 1 ||
    !record(inspected[0])
  ) {
    throw new Error(`Expected one image when inspecting ${image}`);
  }
  const metadata = inspected[0];
  const labels = record(metadata.Config) ? metadata.Config.Labels : undefined;
  for (const [label, value] of [
    [revisionLabel, expected.revision],
    [versionLabel, expected.version],
  ]) {
    const actual = requiredString(labels, label);
    if (actual !== value) {
      throw new Error(
        `${image}: ${label} is ${actual}, expected ${value}; refusing to replace release output`,
      );
    }
  }
  const actualPlatform = platform({
    os: metadata.Os,
    architecture: metadata.Architecture,
    variant: metadata.Variant,
  });
  if (release && actualPlatform !== releasePlatform) {
    throw new Error(
      `${image}: platform is ${actualPlatform}, expected ${releasePlatform}`,
    );
  }
}

function releaseReference(version: string, ref: string | undefined): string {
  const match =
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version,
    );
  const invalidPrerelease = match?.[4]
    ?.split('.')
    .some(identifier => /^0[0-9]+$/.test(identifier));
  if (
    !match ||
    invalidPrerelease ||
    version.length > 128 ||
    ref !== `refs/tags/v${version}`
  ) {
    throw new Error(
      `Release staging requires a full Docker-compatible REL_VERSION matching GITHUB_REF, got ${version} / ${ref}`,
    );
  }
  return `${repository}:${version}`;
}

// `docker manifest inspect` also fetches index members, and reports a missing
// member or an authorization failure as a missing tag. Resolve only the
// top-level tag, and treat nothing but its explicit 404 as absence.
function releaseExists(run: CommandRunner, reference: string): boolean {
  const result = run('docker', [
    'buildx',
    'imagetools',
    'inspect',
    '--raw',
    reference,
  ]);
  if (result.status === 0) {
    return true;
  }
  if (result.stderr.trim() === `ERROR: ${reference}: not found`) {
    return false;
  }
  throw new Error(
    `Cannot query ${reference}: ${result.stderr || result.stdout}`,
  );
}

function existingRelease(
  run: CommandRunner,
  reference: string,
  expected: Provenance,
): string | undefined {
  if (!releaseExists(run, reference)) {
    return undefined;
  }
  // The tag exists, so any failure to read its members must fail closed.
  const manifest: unknown = JSON.parse(
    checked(run, 'docker', ['manifest', 'inspect', '--verbose', reference]),
  );
  const entries = Array.isArray(manifest) ? manifest : [manifest];
  const runnableDigests: string[] = [];
  for (const entry of entries) {
    if (!record(entry) || !record(entry.Descriptor)) {
      throw new Error(`${reference}: invalid image manifest descriptor`);
    }
    const descriptor = entry.Descriptor;
    const mediaType = requiredString(descriptor, 'mediaType');
    const digest = requiredString(descriptor, 'digest');
    if (
      !manifestTypes.has(mediaType) ||
      !/^sha256:[0-9a-f]{64}$/.test(digest)
    ) {
      throw new Error(`${reference}: invalid image manifest descriptor`);
    }
    const declaredPlatform =
      Array.isArray(manifest) || descriptor.platform !== undefined
        ? platform(descriptor.platform)
        : undefined;
    // BuildKit attestation manifests are not runnable platforms. Validate their
    // descriptors before filtering; reuse never rewrites the original index.
    if (Array.isArray(manifest) && declaredPlatform === 'unknown/unknown') {
      continue;
    }
    if (
      declaredPlatform !== undefined &&
      declaredPlatform !== releasePlatform
    ) {
      throw new Error(`${reference}: expected platform ${releasePlatform}`);
    }
    runnableDigests.push(digest);
  }
  if (runnableDigests.length !== 1) {
    throw new Error(`${reference}: expected a single ${releasePlatform} image`);
  }

  const pinned = `${repository}@${runnableDigests[0]}`;
  checked(run, 'docker', ['pull', '--platform', releasePlatform, pinned], true);
  verifyImage(run, pinned, expected, true);
  return pinned;
}

export function runReleaseImage(
  action: 'build' | 'stage',
  env: NodeJS.ProcessEnv = process.env,
  run: CommandRunner = runCommand,
  log: (message: string) => void = console.log,
): void {
  const release = env.CI_PUBLISH_RELEASE === 'true';
  const version = env.REL_VERSION ?? 'edge';
  const builtImage = env.BUILT_IMAGE ?? `${repository}:latest`;
  if (!version || version.trim() !== version) {
    throw new Error(
      'REL_VERSION must be nonempty and have no surrounding whitespace',
    );
  }
  const reference = release
    ? releaseReference(version, env.GITHUB_REF)
    : undefined;
  if (action === 'stage' && !reference) {
    throw new Error('Release staging requires CI_PUBLISH_RELEASE=true');
  }

  // GITHUB_SHA can differ from the checked-out merge commit or selected ref.
  const revision = checked(run, 'git', ['rev-parse', '--verify', 'HEAD']);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision)) {
    throw new Error(`Invalid checked-out Git revision: ${revision}`);
  }
  const expected = { revision, version };
  const registrySecret = env.IMAGE_NPM_REGISTRY_SERVER
    ? ['--secret', 'id=npm_registry,env=IMAGE_NPM_REGISTRY_SERVER']
    : [];
  if (release && registrySecret.length) {
    throw new Error('Release images must use the default package registry');
  }

  if (action === 'build') {
    const existing = reference
      ? existingRelease(run, reference, expected)
      : undefined;
    if (existing) {
      checked(run, 'docker', ['tag', existing, builtImage]);
      log(`Reusing ${reference} (${existing}) for image validation`);
      return;
    }
    checked(
      run,
      'docker',
      [
        'build',
        '.',
        '-f',
        join('packages', 'backend', 'Dockerfile'),
        '-t',
        builtImage,
        '--label',
        `${revisionLabel}=${revision}`,
        '--label',
        `${versionLabel}=${version}`,
        ...(release ? ['--platform', releasePlatform] : []),
        ...registrySecret,
      ],
      true,
    );
    verifyImage(run, builtImage, expected, release);
    return;
  }

  if (reference) {
    verifyImage(run, builtImage, expected, true);
    const existing = existingRelease(run, reference, expected);
    if (existing) {
      log(
        `Keeping immutable release ${reference} (${existing}); no push needed`,
      );
      return;
    }
    checked(run, 'docker', ['tag', builtImage, reference]);
    checked(run, 'docker', ['push', reference], true);
    const published = existingRelease(run, reference, expected);
    if (!published) {
      throw new Error(`${reference} is missing after publication`);
    }
    log(
      `Staged immutable release ${reference} (${published}); channel promotion is deferred`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const action = process.argv[2];
    if (
      process.argv.length !== 3 ||
      (action !== 'build' && action !== 'stage')
    ) {
      throw new Error('Usage: node scripts/release-image.ts <build|stage>');
    }
    runReleaseImage(action);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
