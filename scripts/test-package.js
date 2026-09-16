#!/usr/bin/env node
/*
 * Runs the package qualification suite on its own.
 *
 * It performs a real `yarn build` and `yarn pack`, and Backstage's `prepack`
 * rewrites workspace manifests on disk while it does, so it must not share a
 * Jest run with tests that read those manifests. Keeping it here rather than in
 * a `cross-env` one-liner avoids depending on a package we do not declare, and
 * sets the environment identically on Windows and POSIX.
 */
const { spawn } = require('child_process');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

const child = spawn(
  process.execPath,
  [
    path.join(
      repoRoot,
      'node_modules',
      '@backstage',
      'cli',
      'bin',
      'backstage-cli',
    ),
    'repo',
    'test',
    '--watchAll=false',
    '--coverage=false',
    '--runInBand',
    'plugins/plugin-radius/src/packagingArtifact.test.ts',
  ],
  {
    cwd: repoRoot,
    env: { ...process.env, PACKAGE_QUALIFICATION: 'true', CI: 'true' },
    stdio: 'inherit',
  },
);

child.on('exit', code => process.exit(code ?? 1));
