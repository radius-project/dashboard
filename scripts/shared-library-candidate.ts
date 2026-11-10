import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface ArchiveIdentity {
  path: string;
  sha256: string;
}

export interface SharedLibraryCandidate {
  sourceRevision: string;
  core: ArchiveIdentity;
  graphReact: ArchiveIdentity & {
    stylesSha256: string;
    baseSha256: string;
  };
}

interface PackageManifest {
  name: string;
  version: string;
  exports: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

interface Archive {
  file: string;
  files: string[];
  manifest: PackageManifest;
}

const digest = (content: Buffer) =>
  createHash('sha256').update(content).digest('hex');

const assertDigest = (content: Buffer, expected: string, label: string) => {
  if (!/^[a-f0-9]{64}$/.test(expected) || digest(content) !== expected) {
    throw new Error(`${label}: SHA-256 does not match the candidate receipt`);
  }
};

const readMember = (archive: string, member: string): Buffer =>
  execFileSync('tar', ['-xOf', archive, member], {
    maxBuffer: 32 * 1024 * 1024,
  });

const readArchive = (
  identity: ArchiveIdentity,
  directory: string,
  name: string,
): Archive => {
  const file = path.resolve(directory, identity.path);
  assertDigest(fs.readFileSync(file), identity.sha256, name);
  const files = execFileSync('tar', ['-tf', file], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(member => member && !member.endsWith('/'));
  if (
    files.length === 0 ||
    new Set(files).size !== files.length ||
    files.some(
      member =>
        !member.startsWith('package/') ||
        member.includes('\\') ||
        member.split('/').some(part => part === '..' || part === '.'),
    )
  ) {
    throw new Error(`${name}: invalid package archive paths`);
  }
  const manifest = JSON.parse(
    readMember(file, 'package/package.json').toString('utf8'),
  ) as PackageManifest;
  if (
    manifest.name !== name ||
    !manifest.version ||
    typeof manifest.exports !== 'object' ||
    manifest.exports === null
  ) {
    throw new Error(`${name}: invalid package identity or public exports`);
  }
  return { file, files, manifest };
};

const publicFile = (
  archive: Archive,
  subpath: string,
  condition?: 'types' | 'import',
) => {
  const entry = archive.manifest.exports[subpath];
  const target =
    condition && entry && typeof entry === 'object'
      ? (entry as Record<string, unknown>)[condition]
      : entry;
  if (
    typeof target !== 'string' ||
    !target.startsWith('./dist/') ||
    target.includes('\\') ||
    target.split('/').includes('..') ||
    !archive.files.includes(`package/${target.slice(2)}`) ||
    (!condition && !target.endsWith('.css')) ||
    (condition === 'types' && !target.endsWith('.d.ts')) ||
    (condition === 'import' && !target.endsWith('.js'))
  ) {
    throw new Error(
      `${archive.manifest.name}${subpath}: missing compiled public ${condition ?? 'file'}`,
    );
  }
  return target.slice(2);
};

const verifyInstalledArchive = (
  archive: Archive,
  packageRoot: string,
  consumerRoot: string,
) => {
  const relativeRoot = path.relative(
    path.join(fs.realpathSync(consumerRoot), 'node_modules'),
    fs.realpathSync(packageRoot),
  );
  if (
    fs.lstatSync(packageRoot).isSymbolicLink() ||
    relativeRoot.startsWith('..') ||
    path.isAbsolute(relativeRoot)
  ) {
    throw new Error(
      `${archive.manifest.name}: candidate must not be a workspace link`,
    );
  }
  for (const member of archive.files) {
    const relative = member.slice('package/'.length);
    const installedPath = path.join(packageRoot, relative);
    if (!fs.lstatSync(installedPath).isFile()) {
      throw new Error(
        `${archive.manifest.name}: installed ${relative} must be a regular file`,
      );
    }
    const relativeFile = path.relative(
      fs.realpathSync(packageRoot),
      fs.realpathSync(installedPath),
    );
    if (relativeFile.startsWith('..') || path.isAbsolute(relativeFile)) {
      throw new Error(
        `${archive.manifest.name}: installed ${relative} resolves outside the package`,
      );
    }
    const installed = fs.readFileSync(installedPath);
    if (!installed.equals(readMember(archive.file, member))) {
      throw new Error(
        `${archive.manifest.name}: installed ${relative} differs from the candidate archive`,
      );
    }
  }
};

export function verifySharedLibraryCandidate(
  candidate: SharedLibraryCandidate,
  directory: string,
  consumerRoot?: string,
) {
  if (!/^[a-f0-9]{40}$/.test(candidate.sourceRevision)) {
    throw new Error(
      'Expected an immutable source commit in the candidate receipt',
    );
  }
  const core = readArchive(candidate.core, directory, '@radius-project/core');
  const graph = readArchive(
    candidate.graphReact,
    directory,
    '@radius-project/graph-react',
  );
  if (Object.hasOwn(core.manifest.exports, '.')) {
    throw new Error(
      'Core must be consumed through browser-safe public subpaths',
    );
  }
  for (const subpath of ['./domain', './graph']) {
    publicFile(core, subpath, 'types');
    publicFile(core, subpath, 'import');
  }
  publicFile(graph, '.', 'types');
  publicFile(graph, '.', 'import');
  const compatibilityEntries = ['./compat', './compat/reactflow11'];
  const hasCompatibility = compatibilityEntries.some(subpath =>
    Object.hasOwn(graph.manifest.exports, subpath),
  );
  if (hasCompatibility) {
    for (const subpath of compatibilityEntries) {
      publicFile(graph, subpath, 'types');
      publicFile(graph, subpath, 'import');
    }
    if (
      graph.manifest.dependencies?.reactflow ||
      !graph.manifest.peerDependencies?.reactflow ||
      graph.manifest.peerDependenciesMeta?.reactflow?.optional !== true
    ) {
      throw new Error(
        'Legacy Flow11 must be an isolated optional peer dependency',
      );
    }
  }
  const styles = publicFile(graph, './styles.css');
  const base = publicFile(graph, './base.css');
  assertDigest(
    readMember(graph.file, `package/${styles}`),
    candidate.graphReact.stylesSha256,
    'Graph stylesheet',
  );
  assertDigest(
    readMember(graph.file, `package/${base}`),
    candidate.graphReact.baseSha256,
    'Graph base stylesheet',
  );
  if (
    graph.manifest.dependencies?.['@radius-project/core'] !==
    core.manifest.version
  ) {
    throw new Error('Graph must depend on the exact candidate core version');
  }
  for (const peer of ['react', 'react-dom']) {
    if (
      graph.manifest.dependencies?.[peer] ||
      !graph.manifest.peerDependencies?.[peer]
    ) {
      throw new Error(`Graph must declare ${peer} only as a peer dependency`);
    }
  }

  if (consumerRoot) {
    const consumerRequire = createRequire(
      path.join(path.resolve(consumerRoot), 'package.json'),
    );
    const coreEntry = consumerRequire.resolve('@radius-project/core/graph');
    const graphEntry = consumerRequire.resolve('@radius-project/graph-react');
    const graphRequire = createRequire(graphEntry);
    if (
      fs.realpathSync(coreEntry) !==
      fs.realpathSync(graphRequire.resolve('@radius-project/core/graph'))
    ) {
      throw new Error(
        'Direct and graph-transitive core resolution must use the same candidate',
      );
    }
    const coreRoot = path.dirname(
      consumerRequire.resolve('@radius-project/core/package.json'),
    );
    const graphRoot = path.dirname(
      consumerRequire.resolve('@radius-project/graph-react/package.json'),
    );
    verifyInstalledArchive(core, coreRoot, consumerRoot);
    verifyInstalledArchive(graph, graphRoot, consumerRoot);
    const rendererDependencies = Object.keys(
      graph.manifest.dependencies ?? {},
    ).filter(name => name !== '@radius-project/core');
    if (rendererDependencies.length === 0) {
      throw new Error('Graph has no declared runtime renderer dependency');
    }
    const compatibilityRequires = hasCompatibility
      ? compatibilityEntries.map(subpath => ({
          name: `Graph${subpath.slice(1)}`,
          require: createRequire(
            consumerRequire.resolve(
              `@radius-project/graph-react${subpath.slice(1)}`,
            ),
          ),
        }))
      : [];
    for (const runtime of compatibilityRequires) {
      if (
        fs.realpathSync(coreEntry) !==
        fs.realpathSync(runtime.require.resolve('@radius-project/core/graph'))
      ) {
        throw new Error(`${runtime.name} resolves a different core candidate`);
      }
    }
    const legacyNode = compatibilityRequires.find(
      runtime => runtime.name === 'Graph/compat/reactflow11',
    );
    const legacyRenderer = legacyNode
      ? legacyNode.require.resolve('reactflow')
      : undefined;
    if (
      legacyRenderer &&
      fs.realpathSync(legacyRenderer) !==
        fs.realpathSync(consumerRequire.resolve('reactflow'))
    ) {
      throw new Error(
        'Legacy ResourceNode resolves a second Flow11 provider instance',
      );
    }
    const runtimeRequires = [
      { name: 'Graph', require: graphRequire },
      ...compatibilityRequires,
      ...rendererDependencies.map(name => ({
        name,
        require: createRequire(graphRequire.resolve(name)),
      })),
      ...(legacyRenderer
        ? [{ name: 'reactflow', require: createRequire(legacyRenderer) }]
        : []),
    ];
    for (const peer of ['react', 'react-dom']) {
      for (const runtime of runtimeRequires) {
        if (
          fs.realpathSync(consumerRequire.resolve(peer)) !==
          fs.realpathSync(runtime.require.resolve(peer))
        ) {
          throw new Error(`${runtime.name} resolves a second ${peer} instance`);
        }
      }
    }
  }

  return {
    stage: consumerRoot ? 'installed-bytes' : 'archive-bytes',
    sourceRevision: candidate.sourceRevision,
    core: { version: core.manifest.version, sha256: candidate.core.sha256 },
    graphReact: {
      version: graph.manifest.version,
      sha256: candidate.graphReact.sha256,
      stylesSha256: candidate.graphReact.stylesSha256,
      baseSha256: candidate.graphReact.baseSha256,
    },
    hostQualified: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const receiptPath = process.argv[2];
  if (!receiptPath) {
    throw new Error(
      'Expected a candidate receipt path and optional installed consumer directory',
    );
  }
  const receipt = JSON.parse(
    fs.readFileSync(receiptPath, 'utf8'),
  ) as SharedLibraryCandidate;
  console.log(
    JSON.stringify(
      verifySharedLibraryCandidate(
        receipt,
        path.dirname(path.resolve(receiptPath)),
        process.argv[3],
      ),
      null,
      2,
    ),
  );
}
