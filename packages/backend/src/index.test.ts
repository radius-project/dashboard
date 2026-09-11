/**
 * `packages/backend/src/index.ts` is the host backend entry point. It had no
 * test and 0% coverage, and was the one workspace carrying a coverage-policy
 * exemption (PU-23) for exactly that reason.
 *
 * It is an entry point with no exports: importing it builds a backend and
 * starts it. So the test replaces `createBackend` with a recorder and asserts
 * on what the module does at import time -- which backend modules it installs
 * and that it starts the backend afterwards. The six `backend.add` arguments
 * are dynamic imports, so each is awaited before it is identified.
 *
 * This matters beyond coverage: dropping a `backend.add` line still compiles,
 * still starts, and produces a dashboard whose Kubernetes proxy silently does
 * not exist. Nothing else in the repository notices.
 */
const add = jest.fn();
const start = jest.fn();

jest.mock('@backstage/backend-defaults', () => ({
  createBackend: jest.fn(() => ({ add, start })),
}));

// Each installed module is replaced with an identifiable stub so that importing
// the entry point does not boot six real Backstage backend plugins.
jest.mock('@backstage/plugin-app-backend', () => ({ __stub: 'app' }), {
  virtual: true,
});
jest.mock('@backstage/plugin-proxy-backend', () => ({ __stub: 'proxy' }), {
  virtual: true,
});
jest.mock('@backstage/plugin-auth-backend', () => ({ __stub: 'auth' }), {
  virtual: true,
});
jest.mock(
  '@backstage/plugin-auth-backend-module-guest-provider',
  () => ({ __stub: 'auth-guest' }),
  { virtual: true },
);
jest.mock('@backstage/plugin-catalog-backend', () => ({ __stub: 'catalog' }), {
  virtual: true,
});
jest.mock(
  '@backstage/plugin-kubernetes-backend',
  () => ({ __stub: 'kubernetes' }),
  { virtual: true },
);

const installedModules = async (): Promise<string[]> => {
  const resolved = await Promise.all(
    add.mock.calls.map(([value]) => Promise.resolve(value)),
  );
  return resolved.map(module => (module as { __stub: string }).__stub);
};

describe('backend entry point', () => {
  beforeAll(async () => {
    // `await import` rather than `require`: the suite runs as CommonJS under
    // Jest. The workspace's `jest.transform` override drops the CLI's default
    // SWC `module.ignoreDynamic`, so both this import and the entry point's own
    // `import()` calls are lowered to `require` -- without that override a
    // native dynamic import needs --experimental-vm-modules and throws.
    // `installedModules` still awaits each recorded argument, because the entry
    // point passes the import expression itself to `backend.add`.
    await import('./index');
  });

  it('BK-01: creates a backend and starts it', async () => {
    const { createBackend } = jest.requireMock(
      '@backstage/backend-defaults',
    ) as { createBackend: jest.Mock };

    expect(createBackend).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('BK-02: installs exactly six backend modules', async () => {
    expect(add).toHaveBeenCalledTimes(6);
  });

  it('BK-03: serves the frontend bundle and the catalog', async () => {
    const modules = await installedModules();

    expect(modules).toEqual(expect.arrayContaining(['app', 'catalog']));
  });

  it('BK-04: installs the proxy the dashboard reaches Radius through', async () => {
    // The plugin talks to the Radius control plane through the Kubernetes
    // proxy, so these two are the load-bearing entries in the list.
    const modules = await installedModules();

    expect(modules).toEqual(expect.arrayContaining(['proxy', 'kubernetes']));
  });

  it('BK-05: installs auth together with the guest provider it depends on', async () => {
    const modules = await installedModules();

    expect(modules).toEqual(expect.arrayContaining(['auth', 'auth-guest']));
  });

  it('BK-06: starts the backend only after every module is installed', async () => {
    const startOrder = start.mock.invocationCallOrder[0];
    const lastAddOrder = Math.max(...add.mock.invocationCallOrder);

    expect(startOrder).toBeGreaterThan(lastAddOrder);
  });
});
