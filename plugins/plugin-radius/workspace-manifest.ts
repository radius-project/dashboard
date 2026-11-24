import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function withWorkspaceManifest<T>(
  root: string,
  workspace: string,
  run: (before: string, startPack: () => void) => T,
): T {
  const lock = path.join(root, '.radius-plugin-pack.lock');
  const lockFile = fs.openSync(lock, 'wx');
  let manifestRestored = true;
  try {
    fs.writeFileSync(
      lockFile,
      `${JSON.stringify({ pid: process.pid, hostname: os.hostname(), workspace })}\n`,
    );
    const manifestFile = path.join(root, workspace, 'package.json');
    const before = fs.readFileSync(manifestFile, 'utf8');
    const startPack = () => {
      assert.equal(
        fs.readFileSync(manifestFile, 'utf8'),
        before,
        `Manifest changed during build: ${manifestFile}. Edits preserved; packing stopped.`,
      );
      manifestRestored = false;
    };
    let result: { value: T } | { error: unknown };
    try {
      result = { value: run(before, startPack) };
    } catch (error) {
      result = { error };
    }
    if (!manifestRestored) {
      try {
        if (fs.readFileSync(manifestFile, 'utf8') !== before)
          fs.writeFileSync(manifestFile, before);
        assert.equal(fs.readFileSync(manifestFile, 'utf8'), before);
        manifestRestored = true;
      } catch (error) {
        throw new Error(
          `Could not restore ${manifestFile}. Pack lock retained at ${lock}; inspect the manifest before removing the lock.`,
          { cause: error },
        );
      }
    }
    if ('error' in result) throw result.error;
    return result.value;
  } finally {
    fs.closeSync(lockFile);
    if (manifestRestored) fs.unlinkSync(lock);
  }
}
