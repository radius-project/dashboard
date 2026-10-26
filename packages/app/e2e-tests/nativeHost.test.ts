import { test, expect } from '@playwright/test';

test.describe('standalone frontend contracts', () => {
  test('FS-09/11/12: auto guest, cards, sidebar, settings, themes and native catalog pages', async ({
    page,
  }) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    const signIns: number[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/auth/guest/refresh'))
        signIns.push(response.status());
    });
    await page.goto('/');
    await expect(page.getByText('Learn more')).toBeVisible({ timeout: 20_000 });
    if (process.env.STANDALONE_QUALIFICATION) expect(signIns).toContain(200);
    await expect(page.getByText('Join the community')).toBeVisible();
    await expect(page.getByText('Get help with Radius')).toBeVisible();
    await expect(
      page.getByRole('main').getByText('Applications', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByText('Environments', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Get Started/ }),
    ).toHaveAttribute('href', 'https://docs.radapp.io/getting-started/');
    const nav = page.getByRole('navigation', { name: 'sidebar nav' });
    for (const [name, path] of [
      ['Home', '/'],
      ['Resource Types', '/resource-types'],
      ['Applications', '/applications'],
      ['Environments', '/environments'],
      ['Resources', '/resources'],
      ['Recipes', '/recipes'],
    ]) {
      await expect(
        nav.getByRole('link', { name, exact: true }).filter({ hasText: name }),
      ).toHaveCount(1);
      await expect(
        nav.getByRole('link', { name, exact: true }).filter({ hasText: name }),
      ).toHaveAttribute('href', path);
    }
    await page.goto('/settings');
    await expect(page.getByText('Appearance')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-theme-mode',
      'dark',
    );
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute(
      'data-theme-mode',
      'dark',
    );
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-theme-mode',
      'light',
    );
    await page.getByRole('tab', { name: 'Feature Flags' }).click();
    await expect(
      page.getByText('radius-catalog', { exact: true }),
    ).toBeVisible();
    await page.goto('/catalog');
    await expect(
      page.getByRole('heading', { name: /Catalog/, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    await page.goto('/catalog-graph');
    await expect(
      page.getByRole('heading', { name: /Catalog Graph/, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('FS-12: real backend keeps missing authentication distinct from upstream denial', async ({
    request,
  }) => {
    test.skip(
      !process.env.STANDALONE_QUALIFICATION,
      'Requires the controlled real backend',
    );
    const denied = await request.get('/api/kubernetes/proxy/forbidden');
    expect(denied.status()).toBe(401);
    const signIn = await request.get('/api/auth/guest/refresh');
    expect(signIn.status()).toBe(200);
    const { backstageIdentity } = await signIn.json();
    const forbidden = await request.get('/api/kubernetes/proxy/forbidden', {
      headers: {
        authorization: `Bearer ${backstageIdentity.token}`,
        'Backstage-Kubernetes-Cluster': 'standalone-test-cluster',
      },
    });
    expect(forbidden.status()).toBe(403);
  });

  test('FS-11: installed catalog entity page and graph resolve the same entity', async ({
    page,
  }) => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'standalone-component',
        namespace: 'default',
        uid: 'standalone-component',
        description: 'Controlled catalog entity for native host qualification',
      },
      spec: {
        type: 'service',
        lifecycle: 'experimental',
        owner: 'user:default/guest',
      },
      relations: [],
    };
    await page.route(
      '**/api/catalog/entities/by-name/component/default/standalone-component',
      route => route.fulfill({ json: entity }),
    );
    await page.route('**/api/catalog/entities/by-refs', route =>
      route.fulfill({ json: { items: [entity] } }),
    );
    await page.goto('/catalog/default/component/standalone-component');
    await expect(
      page.getByRole('heading', { name: 'standalone-component', exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(entity.metadata.description)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'standalone-component', exact: true }),
    ).toBeVisible();
    await page.goto(
      '/catalog-graph?rootEntityRefs[]=component:default/standalone-component',
    );
    await expect(
      page.getByRole('heading', { name: /Catalog Graph/, level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('svg').getByText('standalone-component', { exact: true }),
    ).toBeVisible();
  });
});
