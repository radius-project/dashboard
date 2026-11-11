import { expect, Page, Route, test } from '@playwright/test';
import { createHash } from 'node:crypto';
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

const radiusTypes: [RegExp, string][] = [
  [/Applications\.Core\/containers/g, 'Radius.Compute/containers'],
  [/Applications\.Core\/gateways/g, 'Radius.Compute/routes'],
  [/Applications\.Datastores\/redisCaches/g, 'Radius.Data/redisCaches'],
];

const graphTypes = (namespace: string) =>
  namespace === 'Radius.Core'
    ? {
        container: 'Radius.Compute/containers',
        gateway: 'Radius.Compute/routes',
      }
    : {
        container: 'Applications.Core/containers',
        gateway: 'Applications.Core/gateways',
      };

const edge = (page: Page, source: string, target: string) =>
  page.locator(
    `.react-flow__edge[data-id=${JSON.stringify(JSON.stringify([source, target]))}]`,
  );

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
    const graph = url.includes('/Radius.Core/')
      ? radiusTypes.reduce(
          (body, [legacy, current]) => body.replace(legacy, current),
          JSON.stringify(multiTier),
        )
      : JSON.stringify(multiTier);
    await route.fulfill({ body: graph, contentType: 'application/json' });
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
        page.getByRole('group', {
          name: 'frontend',
          exact: true,
        }),
      ).toBeVisible();
      const { container, gateway } = graphTypes(item.type.split('/')[0]);
      const providers = '/planes/radius/local/resourceGroups/demo/providers';
      await expect(
        edge(
          page,
          `${providers}/${container}/backend`,
          `${providers}/${container}/frontend`,
        ),
      ).toBeVisible();
      await expect(
        edge(
          page,
          `${providers}/${gateway}/edge`,
          `${providers}/${container}/frontend`,
        ),
      ).toBeVisible();
      await expect(
        edge(
          page,
          `${providers}/${container}/frontend`,
          `${providers}/${gateway}/edge`,
        ),
      ).toHaveCount(0);

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
      page.getByRole('group', {
        name: 'frontend',
        exact: true,
      }),
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole('group', {
        name: 'frontend',
        exact: true,
      }),
    ).toBeVisible();
  });

  test('renders a registered resource-type SVG and retains nodes with missing or invalid icons', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const definition = {
      name: 'widgets',
      properties: {
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#2874a6" d="M4 4h24v24H4z"/><circle fill="#f1c40f" cx="16" cy="16" r="8"/></svg>',
      },
    };
    const hash = (svg: string) =>
      createHash('sha256').update(svg).digest('hex');
    const registeredHash = hash(definition.properties.icon);
    const invalidSvg = '<svg not-valid-image';
    const invalidHash = hash(invalidSvg);
    const iconHashes = {
      registered: registeredHash,
      missing: hash('missing'),
      invalid: invalidHash,
    };
    await page.route(/\/resourceTypes\/applications\?/, route =>
      route.fulfill({
        json: {
          ...resourceType('Radius.Core'),
          APIVersions: { '2025-08-01-preview': {} },
          APIVersionList: ['2025-08-01-preview'],
        },
      }),
    );
    await page.route(
      /\/api\/kubernetes\/proxy\/.*\/getGraph\?/,
      async route => {
        expect(route.request().postDataJSON()).toEqual({ includeIcons: true });
        await route.fulfill({
          json: {
            resources: Object.entries(iconHashes).map(([name, iconHash]) => ({
              id: `/planes/radius/local/resourceGroups/demo/providers/Radius.Test/widgets/${name}`,
              name,
              type: 'Radius.Test/widgets',
              iconHash,
              connections: [],
            })),
            icons: {
              [registeredHash]: definition.properties.icon,
              [invalidHash]: invalidSvg,
            },
          },
        });
      },
    );
    await enterDashboard(page);
    await page.goto(
      '/resources/demo/Radius.Core/applications/radius-app/application',
    );
    const registered = page.getByRole('group', {
      name: 'registered',
      exact: true,
    });
    const image = registered.locator('img');
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const source = await image.getAttribute('src');
    expect(source).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(source!.slice(source!.indexOf(',') + 1))).toBe(
      definition.properties.icon,
    );
    for (const name of ['missing', 'invalid']) {
      const node = page.getByRole('group', { name, exact: true });
      await expect(node).toBeVisible();
      await expect(node).toContainText('widgets');
      const fallback = node.locator('img[data-radius-part="icon"]');
      await expect(fallback).toBeVisible();
      await expect
        .poll(() =>
          fallback.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    const missingIcon = page
      .getByRole('group', { name: 'missing', exact: true })
      .locator('img[data-radius-part="icon"]');
    const invalidIcon = page
      .getByRole('group', { name: 'invalid', exact: true })
      .locator('img[data-radius-part="icon"]');
    expect(await invalidIcon.getAttribute('src')).toBe(
      await missingIcon.getAttribute('src'),
    );
    await expect(registered.locator('svg')).toHaveCount(0);
    const graphScreenshot = testInfo.outputPath('resource-type-icons.png');
    const nodeScreenshot = testInfo.outputPath('registered-resource-type.png');
    await page.locator('.react-flow').screenshot({ path: graphScreenshot });
    await registered.screenshot({ path: nodeScreenshot });
    await testInfo.attach('Resource-type icon API fixture', {
      path: graphScreenshot,
      contentType: 'image/png',
    });
    await testInfo.attach('Registered resource-type SVG', {
      path: nodeScreenshot,
      contentType: 'image/png',
    });
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
