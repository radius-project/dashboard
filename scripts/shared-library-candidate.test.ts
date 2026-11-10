import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  verifySharedLibraryCandidate,
  type SharedLibraryCandidate,
} from './shared-library-candidate.ts';

const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

test('candidate verification checks archive, CSS, installed bytes and transitive resolution', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'radius-shared-candidate-'),
  );
  const consumer = path.join(root, 'consumer');
  const coreRoot = path.join(
    consumer,
    'node_modules',
    '@radius-project',
    'core',
  );
  const graphRoot = path.join(
    consumer,
    'node_modules',
    '@radius-project',
    'graph-react',
  );
  const styles = '.radius-graph { position: relative; }';
  const base = '.radius-graph__controls { position: absolute; }';
  const entry = (file: string) => ({
    types: `${file}.d.ts`,
    import: `${file}.js`,
    default: `${file}.js`,
  });
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const archive = (
    name: string,
    manifest: object,
    files: Record<string, string>,
    destination: string,
  ) => {
    const staging = path.join(root, name);
    write(
      path.join(staging, 'package', 'package.json'),
      JSON.stringify(manifest),
    );
    for (const [file, content] of Object.entries(files)) {
      write(path.join(staging, 'package', file), content);
    }
    const output = path.join(root, `${name}.tgz`);
    execFileSync('tar', ['-czf', output, '-C', staging, 'package']);
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(path.join(staging, 'package'), destination, { recursive: true });
    return { path: output, sha256: sha256(fs.readFileSync(output)) };
  };

  try {
    write(path.join(consumer, 'package.json'), '{}');
    for (const name of ['react', 'react-dom']) {
      write(
        path.join(consumer, 'node_modules', name, 'index.js'),
        'module.exports = {};',
      );
    }
    const rendererRoot = path.join(
      consumer,
      'node_modules',
      '@xyflow',
      'react',
    );
    write(path.join(rendererRoot, 'index.js'), 'module.exports = {};');
    const core = archive(
      'core',
      {
        name: '@radius-project/core',
        version: '0.1.0',
        exports: {
          './domain': entry('./dist/domain/index'),
          './graph': entry('./dist/graph/index'),
          './package.json': './package.json',
        },
      },
      {
        'dist/domain/index.js': 'export {};',
        'dist/domain/index.d.ts': 'export {};',
        'dist/graph/index.js': 'export {};',
        'dist/graph/index.d.ts': 'export {};',
      },
      coreRoot,
    );
    const graph = archive(
      'graph',
      {
        name: '@radius-project/graph-react',
        version: '0.1.0',
        exports: {
          '.': entry('./dist/index'),
          './styles.css': './dist/styles.css',
          './base.css': './dist/base.css',
          './package.json': './package.json',
        },
        dependencies: {
          '@radius-project/core': '0.1.0',
          '@xyflow/react': '12.12.0',
        },
        peerDependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
      },
      {
        'dist/index.js': 'export {};',
        'dist/index.d.ts': 'export {};',
        'dist/styles.css': styles,
        'dist/base.css': base,
      },
      graphRoot,
    );
    const candidate: SharedLibraryCandidate = {
      sourceRevision: 'a'.repeat(40),
      core,
      graphReact: {
        ...graph,
        stylesSha256: sha256(styles),
        baseSha256: sha256(base),
      },
    };

    assert.equal(
      verifySharedLibraryCandidate(candidate, root).stage,
      'archive-bytes',
    );
    const installed = verifySharedLibraryCandidate(candidate, root, consumer);
    assert.equal(installed.stage, 'installed-bytes');
    assert.equal(installed.hostQualified, false);
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          { ...candidate, sourceRevision: 'main' },
          root,
        ),
      /immutable source commit/,
    );
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          { ...candidate, core: { ...core, sha256: '0'.repeat(64) } },
          root,
        ),
      /SHA-256/,
    );
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          {
            ...candidate,
            graphReact: {
              ...candidate.graphReact,
              stylesSha256: sha256('wrong CSS'),
            },
          },
          root,
        ),
      /Graph stylesheet/,
    );
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          {
            ...candidate,
            graphReact: {
              ...candidate.graphReact,
              baseSha256: sha256('wrong base CSS'),
            },
          },
          root,
        ),
      /Graph base stylesheet/,
    );

    const coreManifest = JSON.parse(
      fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'),
    );
    const wrongVersion = archive(
      'wrong-version',
      {
        ...coreManifest,
        version: '0.2.0',
      },
      {
        'dist/domain/index.js': 'export {};',
        'dist/domain/index.d.ts': 'export {};',
        'dist/graph/index.js': 'export {};',
        'dist/graph/index.d.ts': 'export {};',
      },
      path.join(root, 'wrong-version-install'),
    );
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          { ...candidate, core: wrongVersion },
          root,
        ),
      /exact candidate core version/,
    );
    const missingDeclarations = archive(
      'missing-declarations',
      coreManifest,
      {
        'dist/domain/index.js': 'export {};',
        'dist/graph/index.js': 'export {};',
        'dist/graph/index.d.ts': 'export {};',
      },
      path.join(root, 'missing-declarations-install'),
    );
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          { ...candidate, core: missingDeclarations },
          root,
        ),
      /missing compiled public types/,
    );

    write(
      path.join(coreRoot, 'dist', 'domain', 'index.js'),
      'export const stale = true;',
    );
    assert.throws(
      () => verifySharedLibraryCandidate(candidate, root, consumer),
      /installed dist\/domain\/index.js differs/,
    );
    write(path.join(coreRoot, 'dist', 'domain', 'index.js'), 'export {};');
    fs.rmSync(path.join(graphRoot, 'dist', 'styles.css'));
    assert.throws(
      () => verifySharedLibraryCandidate(candidate, root, consumer),
      /ENOENT/,
    );
    write(path.join(graphRoot, 'dist', 'styles.css'), styles);

    const receipt = path.join(root, 'candidate.json');
    write(receipt, JSON.stringify(candidate));
    const verifyFreshConsumer = () =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL('./shared-library-candidate.ts', import.meta.url),
          ),
          receipt,
          consumer,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    for (const peer of ['react', 'react-dom']) {
      const peerCopy = path.join(rendererRoot, 'node_modules', peer);
      write(path.join(peerCopy, 'index.js'), 'module.exports = {};');
      assert.throws(
        verifyFreshConsumer,
        new RegExp(`@xyflow/react resolves a second ${peer} instance`),
      );
      fs.rmSync(peerCopy, { recursive: true });
    }
    const reactCopy = path.join(graphRoot, 'node_modules', 'react');
    write(path.join(reactCopy, 'index.js'), 'module.exports = {};');
    assert.throws(
      verifyFreshConsumer,
      /Graph resolves a second react instance/,
    );

    const nodeCopy = path.join(
      graphRoot,
      'node_modules',
      '@radius-project',
      'core',
    );
    fs.mkdirSync(path.dirname(nodeCopy), { recursive: true });
    fs.cpSync(coreRoot, nodeCopy, { recursive: true });
    assert.throws(verifyFreshConsumer, /Direct and graph-transitive core/);
    fs.rmSync(nodeCopy, { recursive: true });
    fs.rmSync(reactCopy, { recursive: true });

    const graphManifest = JSON.parse(
      fs.readFileSync(path.join(graphRoot, 'package.json'), 'utf8'),
    );
    const compatibilityManifest = {
      ...graphManifest,
      exports: {
        ...graphManifest.exports,
        './compat': entry('./dist/compat/index'),
        './compat/reactflow11': entry('./dist/compat/reactflow11/index'),
      },
      peerDependencies: {
        ...graphManifest.peerDependencies,
        reactflow: '^11.11.4',
      },
      peerDependenciesMeta: { reactflow: { optional: true } },
    };
    const compatibilityFiles = {
      'dist/index.js': 'export {};',
      'dist/index.d.ts': 'export {};',
      'dist/compat/index.js': 'export {};',
      'dist/compat/index.d.ts': 'export {};',
      'dist/compat/reactflow11/index.js': 'export {};',
      'dist/compat/reactflow11/index.d.ts': 'export {};',
      'dist/styles.css': styles,
      'dist/base.css': base,
    };
    const compatibilityGraph = archive(
      'graph-compat',
      compatibilityManifest,
      compatibilityFiles,
      graphRoot,
    );
    const compatibilityCandidate = {
      ...candidate,
      graphReact: { ...candidate.graphReact, ...compatibilityGraph },
    };
    write(receipt, JSON.stringify(compatibilityCandidate));
    const legacyRendererRoot = path.join(consumer, 'node_modules', 'reactflow');
    write(path.join(legacyRendererRoot, 'index.js'), 'module.exports = {};');
    assert.match(
      verifyFreshConsumer().toString(),
      /"stage": "installed-bytes"/,
    );
    for (const peer of ['react', 'react-dom']) {
      const peerCopy = path.join(legacyRendererRoot, 'node_modules', peer);
      write(path.join(peerCopy, 'index.js'), 'module.exports = {};');
      assert.throws(
        verifyFreshConsumer,
        new RegExp(`reactflow resolves a second ${peer} instance`),
      );
      fs.rmSync(peerCopy, { recursive: true });
    }
    const legacyEntryRoot = path.join(
      graphRoot,
      'dist',
      'compat',
      'reactflow11',
    );
    const nestedLegacy = path.join(
      legacyEntryRoot,
      'node_modules',
      'reactflow',
    );
    write(path.join(nestedLegacy, 'index.js'), 'module.exports = {};');
    assert.throws(verifyFreshConsumer, /second Flow11 provider instance/);
    fs.rmSync(nestedLegacy, { recursive: true });
    const compatibilityCore = path.join(
      graphRoot,
      'dist',
      'compat',
      'node_modules',
      '@radius-project',
      'core',
    );
    fs.mkdirSync(path.dirname(compatibilityCore), { recursive: true });
    fs.cpSync(coreRoot, compatibilityCore, { recursive: true });
    assert.throws(
      verifyFreshConsumer,
      /Graph\/compat resolves a different core candidate/,
    );
    fs.rmSync(compatibilityCore, { recursive: true });

    const requiredLegacy = archive(
      'required-legacy-peer',
      {
        ...compatibilityManifest,
        peerDependenciesMeta: { reactflow: { optional: false } },
      },
      compatibilityFiles,
      path.join(root, 'required-legacy-install'),
    );
    assert.throws(
      () =>
        verifySharedLibraryCandidate(
          {
            ...candidate,
            graphReact: { ...candidate.graphReact, ...requiredLegacy },
          },
          root,
        ),
      /isolated optional peer/,
    );
    const linkedCore = path.join(root, 'workspace-core');
    fs.renameSync(coreRoot, linkedCore);
    fs.symlinkSync(linkedCore, coreRoot, 'junction');
    assert.throws(
      verifyFreshConsumer,
      /candidate must not be a workspace link/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
