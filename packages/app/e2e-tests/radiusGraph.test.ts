import { expect, Page, Route, test } from '@playwright/test';
import multiTier from './fixtures/multi-tier.json';

const applicationId = (
  namespace: 'Applications.Core' | 'Radius.Core',
  name: string,
) =>
  `/planes/radius/local/resourceGroups/demo/providers/${namespace}/applications/${name}`;

const application = (
  namespace: 'Applications.Core' | 'Radius.Core',
  name: string,
) => ({
  id: applicationId(namespace, name),
  name,
  type: `${namespace}/applications`,
  location: 'global',
  properties: {
    environment:
      '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/environments/demo',
  },
});

const applications = [
  application('Applications.Core', 'legacy-app'),
  application('Radius.Core', 'radius-app'),
];

const environment = {
  id: '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/environments/demo',
  name: 'demo',
  type: 'Applications.Core/environments',
  location: 'global',
  properties: {},
};

const resourceType = (namespace: string) => ({
  Name: 'applications',
  Description: 'Application resource type',
  ResourceProviderNamespace: namespace,
  APIVersions: { '2025-01-01': {} },
  APIVersionList: ['2025-01-01'],
});

async function fulfillRadiusRequest(route: Route) {
  const url = decodeURIComponent(route.request().url());

  if (url.endsWith('/api/kubernetes/clusters')) {
    await route.fulfill({
      json: {
        items: [{ name: 'e2e-cluster', authProvider: 'serviceAccount' }],
      },
    });
    return;
  }

  if (!url.includes('/api/kubernetes/proxy/')) {
    await route.continue();
    return;
  }

  if (url.includes('/getGraph?')) {
    await route.fulfill({ json: multiTier });
    return;
  }

  const namespace = url.includes('/Radius.Core/')
    ? 'Radius.Core'
    : 'Applications.Core';
  if (url.includes('/resourceTypes/applications?')) {
    await route.fulfill({ json: resourceType(namespace) });
    return;
  }

  const matchingApplication = applications.find(item => url.includes(item.id));
  if (matchingApplication) {
    await route.fulfill({ json: matchingApplication });
    return;
  }

  if (url.includes(environment.id)) {
    await route.fulfill({ json: environment });
    return;
  }

  if (url.includes('/applications?')) {
    await route.fulfill({
      json: {
        value: applications.filter(item => item.type.startsWith(namespace)),
      },
    });
    return;
  }

  if (url.includes('/environments?')) {
    await route.fulfill({ json: { value: [environment] } });
    return;
  }

  await route.fulfill({ json: { value: [] } });
}

async function enterDashboard(page: Page) {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/applications');

  const enter = page.getByRole('button', { name: 'Enter' });
  if (await enter.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await enter.click();
  }
  await expect(
    page.getByRole('heading', { name: 'Applications', level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('Radius application graph journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/kubernetes/**', fulfillRadiusRequest);
  });

  test('PU-28: resolves every lazy plugin extension through its host route', async ({
    page,
  }) => {
    await enterDashboard(page);

    const routes = [
      ['/applications', 'Applications'],
      ['/environments', 'Environments'],
      ['/recipes', 'Recipes'],
      ['/resource-types', 'Resource Types'],
      ['/resources', 'Resources'],
      ['/resource-types/Radius.Core/applications', 'applications'],
      [
        '/resources/demo/Applications.Core/applications/legacy-app/overview',
        'Resource',
      ],
      [
        '/environments/demo/Applications.Core/environments/demo/overview',
        'Environment',
      ],
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(
        page.getByRole('heading', { name: heading, level: 1 }),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test('E2E-03 / GU-12 / GU-13: navigates from both application namespaces to the real graph', async ({
    page,
  }) => {
    await enterDashboard(page);

    for (const item of applications) {
      const applicationLink = page.getByRole('link', { name: item.name });
      await expect(applicationLink).toBeVisible();
      await applicationLink.click();
      await page.getByRole('tab', { name: 'App Graph' }).click();

      await expect(
        page.getByRole('button', {
          name: /^frontend/,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: /^Edge from .*backend.* to .*frontend/,
        }),
      ).toBeVisible();

      await page.goto('/applications');
    }
  });

  test('E2E-10: direct-link refresh preserves the rendered application graph', async ({
    page,
  }) => {
    await enterDashboard(page);
    await page.goto(
      '/resources/demo/Applications.Core/applications/legacy-app/application',
    );
    await expect(
      page.getByRole('button', {
        name: /^frontend/,
      }),
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole('button', {
        name: /^frontend/,
      }),
    ).toBeVisible();
  });

  // KNOWN-DEFECT (#370): the visible error needs an accessible retry action.
  test('GU-16 / ER-10: KNOWN-DEFECT an unavailable graph request renders an error without retry', async ({
    page,
  }) => {
    await page.route(/\/api\/kubernetes\/proxy\/.*\/getGraph\?/, route =>
      route.fulfill({ status: 503, body: 'Service Unavailable' }),
    );
    await enterDashboard(page);
    await page.goto(
      '/resources/demo/Applications.Core/applications/legacy-app/application',
    );

    await expect(page.getByRole('alert')).toContainText('Request failed: 503');
    await expect(page.locator('.react-flow')).toHaveCount(0);
  });

  test('ER-09: a graph request timeout renders its distinct timeout error', async ({
    page,
  }) => {
    await page.route(/\/api\/kubernetes\/proxy\/.*\/getGraph\?/, () => {});
    await enterDashboard(page);
    await page.goto(
      '/resources/demo/Applications.Core/applications/legacy-app/application',
    );

    await expect(page.getByRole('alert')).toContainText('timed out', {
      timeout: 15_000,
    });
    await expect(page.locator('.react-flow')).toHaveCount(0);
  });
});
