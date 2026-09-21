import React from 'react';
import { Link, Route } from 'react-router-dom';
import { ThemeProvider, useTheme } from '@material-ui/core/styles';
import { FlatRoutes } from '@backstage/core-app-api';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceTypeDetailPage } from './ResourceTypeDetailPage';

type ResourceTypeDetail = Awaited<ReturnType<RadiusApi['getResourceType']>>;

const makeResourceType = (
  overrides: Partial<ResourceTypeDetail> = {},
): ResourceTypeDetail => ({
  Name: 'containers',
  Description: 'Container resources',
  ResourceProviderNamespace: 'Applications.Core',
  APIVersions: {
    '2023-10-01-preview': { Schema: { properties: {}, required: [] } },
  },
  APIVersionList: ['2023-10-01-preview'],
  ...overrides,
});

/** A single API version whose schema is the given set of properties. */
const withProperties = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Partial<ResourceTypeDetail> => ({
  APIVersions: {
    '2023-10-01-preview': { Schema: { properties, required } },
  },
  APIVersionList: ['2023-10-01-preview'],
});

const defaultParams = {
  namespace: 'Applications.Core',
  typeName: 'containers',
};

const resourceTypePath = (
  { namespace, typeName } = defaultParams,
  tab = '/overview',
) => `/resource-types/${namespace}/${typeName}${tab}`;

const requestStub = (
  response: RadiusApi['getResourceType'],
  expectedParams = defaultParams,
) =>
  jest.fn<
    ReturnType<RadiusApi['getResourceType']>,
    Parameters<RadiusApi['getResourceType']>
  >(async params => {
    expect(params).toEqual(expectedParams);
    return response(params);
  });

const renderWithApi = (
  getResourceType: RadiusApi['getResourceType'],
  route = resourceTypePath(),
  navigation?: React.ReactNode,
) =>
  renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, { getResourceType }]]}>
      {navigation}
      <FlatRoutes>
        <Route
          path="/resource-types/:namespace/:typeName"
          element={<ResourceTypeDetailPage />}
        />
      </FlatRoutes>
    </TestApiProvider>,
    { routeEntries: [route] },
  );

const renderPage = async (
  resourceType: ResourceTypeDetail,
  tab: string = '/overview',
) => {
  const params = {
    namespace: resourceType.ResourceProviderNamespace,
    typeName: resourceType.Name,
  };
  const getResourceType = requestStub(async () => resourceType, params);
  await renderWithApi(getResourceType, resourceTypePath(params, tab));

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: resourceType.Name }),
    ).toBeInTheDocument();
  });
  expect(getResourceType).toHaveBeenCalledTimes(1);
  expect(getResourceType).toHaveBeenCalledWith(params);
};

/**
 * Keep every row, scoped by API version and the containing object's path.
 * The page's section anchors encode these identities for nested tables.
 */
const readPropertyRows = () => {
  const rows: Array<{
    version: string;
    path: string;
    type: string;
    required: string;
  }> = [];

  for (const table of screen.getAllByRole('table')) {
    const section = table.closest('[id]');
    const versionSection = table.closest(
      '[id^="version-"], [id^="output-version-"]',
    );
    expect(section).not.toBeNull();
    expect(versionSection).not.toBeNull();
    const version = versionSection!.id.replace(/^(output-)?version-/, '');
    const parentPath =
      section === versionSection
        ? ''
        : section!.id.replace(new RegExp(`^(output-)?${version}-`), '');

    for (const row of within(table).getAllByRole('row')) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) continue;

      const name = cells[0].textContent?.trim() ?? '';
      if (!name) continue;

      rows.push({
        version,
        path: parentPath ? `${parentPath}.${name}` : name,
        type: cells[1].textContent?.trim() ?? '',
        required: cells[2].textContent?.trim() ?? '',
      });
    }
  }

  return rows;
};

describe('ResourceTypeDetailPage', () => {
  describe('load states', () => {
    it('RT-01: shows progress until the resource type resolves', async () => {
      const deferred: ((value: ResourceTypeDetail) => void)[] = [];
      const getResourceType = requestStub(
        async () =>
          new Promise<ResourceTypeDetail>(resolve => deferred.push(resolve)),
      );

      await renderWithApi(getResourceType);
      expect(getResourceType).toHaveBeenCalledWith(defaultParams);
      await waitFor(() => {
        expect(screen.getByTestId('progress')).toBeInTheDocument();
      });

      deferred[0](makeResourceType());

      await waitFor(() => {
        expect(screen.queryByTestId('progress')).toBeNull();
      });

      expect(
        screen.getByRole('heading', { name: 'containers' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Resource Type in Applications.Core'),
      ).toBeInTheDocument();
    });

    it('RT-02: surfaces a failed fetch as an error panel', async () => {
      const getResourceType = requestStub(async () =>
        Promise.reject(new Error('Oh noes!')),
      );

      await renderWithApi(getResourceType);
      expect(getResourceType).toHaveBeenCalledWith(defaultParams);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Oh noes!');
    });

    it('RT-03: reports a resolved-but-absent resource type as an error', async () => {
      const getResourceType = requestStub(
        async () => undefined as unknown as ResourceTypeDetail,
      );

      await renderWithApi(getResourceType);
      expect(getResourceType).toHaveBeenCalledWith(defaultParams);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Resource type not found',
        );
      });
    });

    it('RT-04: titles the page from the type and its namespace', async () => {
      await renderPage(makeResourceType());

      expect(
        screen.getByRole('heading', { name: 'containers' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Resource Type in Applications.Core'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('breadcrumb')).toHaveTextContent(
        'Home/Resource Types/containers',
      );
    });
  });

  describe('overview tab', () => {
    it('RT-05: renders the description supplied by the API', async () => {
      await renderPage(
        makeResourceType({ Description: 'A database for storing things' }),
      );

      expect(
        screen.getByText('A database for storing things'),
      ).toBeInTheDocument();
    });

    it('RT-06: strips the requiredness markers the API embeds in prose', async () => {
      await renderPage(
        makeResourceType({
          Description: '(Required) The image. (Read-only) The status.',
        }),
      );

      expect(screen.getByText('The image. The status.')).toBeInTheDocument();
    });

    /**
     * KNOWN-DEFECT, tracked by radius-project/dashboard#361.
     *
     * When a resource type has no description the page substitutes a block of
     * developer placeholder prose describing `Applications.Core/containers`,
     * complete with worked YAML and JSON examples. It is presented exactly like
     * real documentation, so for any undescribed type the user is shown
     * confident, specific, and wrong content.
     *
     * `RadiusApiImpl.getResourceType` currently defaults the description to a
     * non-empty string, which hides this behind the real API. It is reachable
     * for any host that supplies its own `radiusApiRef` — which is precisely
     * what the plugin rearchitecture invites — so this records the behavior
     * rather than treating it as unreachable.
     */
    it('RT-07: KNOWN-DEFECT substitutes placeholder container docs when the description is empty', async () => {
      await renderPage(makeResourceType({ Description: '' }));

      expect(screen.getByText('Resource Type Description')).toBeInTheDocument();
      expect(
        screen.getByText(/This should test whether copy buttons appear/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/apiVersion: radapp\.io\/v1alpha3/),
      ).toBeInTheDocument();
    });

    it('RT-08: renders fenced code blocks with a copy control', async () => {
      await renderPage(
        makeResourceType({
          Description: 'Intro text\n\n```yaml\nimage: nginx\n```',
        }),
      );

      expect(screen.getByText(/image: nginx/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Copy to clipboard' }),
      ).toBeInTheDocument();
    });
  });

  describe('properties tab: schema location', () => {
    it('RT-09: reads properties from an upper-case Schema', async () => {
      await renderPage(
        makeResourceType(
          withProperties({ image: { type: 'string' } }, ['image']),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'image' }),
      );
    });

    it('RT-10: reads properties from a lower-case schema', async () => {
      await renderPage(
        makeResourceType({
          APIVersions: {
            '2023-10-01-preview': {
              schema: { properties: { image: { type: 'string' } } },
            } as unknown as { Schema?: unknown },
          },
          APIVersionList: ['2023-10-01-preview'],
        }),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'image' }),
      );
    });

    it('RT-11: finds properties nested under definitions when the top level has none', async () => {
      await renderPage(
        makeResourceType({
          APIVersions: {
            '2023-10-01-preview': {
              Schema: {
                definitions: {
                  ContainerProperties: {
                    properties: { image: { type: 'string' } },
                    required: ['image'],
                  },
                },
              },
            },
          },
          APIVersionList: ['2023-10-01-preview'],
        }),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'image' }),
      );
    });

    it('RT-12: reports an empty schema rather than an empty table', async () => {
      await renderPage(makeResourceType(withProperties({})), '/properties');

      expect(
        screen.getByText(/No properties available for this API version/),
      ).toBeInTheDocument();
    });
  });

  describe('properties tab: type formatting', () => {
    it('RT-13: derives a type name from the last segment of a $ref', async () => {
      await renderPage(
        makeResourceType(
          withProperties({ conn: { $ref: '#/definitions/ConnectionSpec' } }),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'conn', type: 'ConnectionSpec' }),
      );
    });

    it('RT-14: renders an array of primitives as an element-typed array', async () => {
      await renderPage(
        makeResourceType(
          withProperties({
            args: { type: 'array', items: { type: 'string' } },
          }),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'args', type: 'string[]' }),
      );
    });

    it('RT-15: renders an array of referenced types as an element-typed array', async () => {
      await renderPage(
        makeResourceType(
          withProperties({
            ports: { type: 'array', items: { $ref: '#/definitions/PortSpec' } },
          }),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'ports', type: 'PortSpec[]' }),
      );
    });

    it('RT-16: falls back to a bare array when the element type is unknown', async () => {
      await renderPage(
        makeResourceType(withProperties({ tags: { type: 'array' } })),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'tags', type: 'array' }),
      );
    });

    it('RT-17: renders a schema with additionalProperties as a map', async () => {
      await renderPage(
        makeResourceType(
          withProperties({
            env: { type: 'object', additionalProperties: { type: 'string' } },
          }),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'env', type: 'map' }),
      );
    });

    it('RT-18: defaults an untyped property to object', async () => {
      await renderPage(
        makeResourceType(withProperties({ mystery: { description: 'hm' } })),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'mystery', type: 'object' }),
      );
    });
  });

  describe('properties tab: requiredness and filtering', () => {
    it('RT-19: marks requiredness from the schema required list', async () => {
      await renderPage(
        makeResourceType(
          withProperties(
            { image: { type: 'string' }, restartPolicy: { type: 'string' } },
            ['image'],
          ),
        ),
        '/properties',
      );

      const rows = readPropertyRows();
      expect(rows).toContainEqual(
        expect.objectContaining({ path: 'image', required: 'Yes' }),
      );
      expect(rows).toContainEqual(
        expect.objectContaining({ path: 'restartPolicy', required: 'No' }),
      );
    });

    it('RT-20: hides read-only properties, which belong to the output tab', async () => {
      await renderPage(
        makeResourceType(
          withProperties({
            image: { type: 'string' },
            provisioningState: { type: 'string', readOnly: true },
          }),
        ),
        '/properties',
      );

      const rows = readPropertyRows();
      expect(rows).toContainEqual(expect.objectContaining({ path: 'image' }));
      expect(rows).not.toContainEqual(
        expect.objectContaining({ path: 'provisioningState' }),
      );
    });

    it('RT-21: treats a false readOnly as writable rather than as read-only', async () => {
      await renderPage(
        makeResourceType(
          withProperties({ image: { type: 'string', readOnly: false } }),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toContainEqual(
        expect.objectContaining({ path: 'image' }),
      );
    });
  });

  describe('output properties tab', () => {
    it('RT-22: shows only read-only properties', async () => {
      await renderPage(
        makeResourceType(
          withProperties({
            image: { type: 'string' },
            provisioningState: { type: 'string', readOnly: true },
          }),
        ),
        '/output-properties',
      );

      const rows = readPropertyRows();
      expect(rows).toContainEqual(
        expect.objectContaining({ path: 'provisioningState' }),
      );
      expect(rows).not.toContainEqual(
        expect.objectContaining({ path: 'image' }),
      );
    });

    it('RT-23: reports a schema with no read-only properties', async () => {
      await renderPage(
        makeResourceType(withProperties({ image: { type: 'string' } })),
        '/output-properties',
      );

      expect(
        screen.getByText(/No output properties available for this API/),
      ).toBeInTheDocument();
    });
  });

  describe('api version navigation', () => {
    it('RT-24: offers version links only when more than one version exists', async () => {
      await renderPage(
        makeResourceType(withProperties({ image: { type: 'string' } })),
        '/properties',
      );

      expect(screen.queryByText('API Versions')).toBeNull();
    });

    it('RT-25: lists multiple versions newest first', async () => {
      await renderPage(
        makeResourceType({
          APIVersions: {
            '2023-10-01-preview': { Schema: { properties: {} } },
            '2025-08-01-preview': { Schema: { properties: {} } },
            '2024-01-01-preview': { Schema: { properties: {} } },
          },
          APIVersionList: [],
        }),
        '/properties',
      );

      expect(screen.getByText('API Versions')).toBeInTheDocument();

      const links = screen
        .getAllByRole('link')
        .map(link => link.textContent)
        .filter(text => text?.endsWith('-preview'));

      expect(links).toEqual([
        '2025-08-01-preview',
        '2024-01-01-preview',
        '2023-10-01-preview',
      ]);
    });
  });

  describe('details tab', () => {
    it('RT-26: shows the raw resource type payload', async () => {
      await renderPage(makeResourceType(), '/details');

      expect(screen.getByText('Resource Type Data')).toBeInTheDocument();
    });
  });

  /**
   * The properties tab and the output-properties tab are near-duplicate blocks
   * of about eleven hundred lines each that differ by one boolean. The
   * top-level filter was inverted for the output tab, but the nested expansion
   * filters were not, so the output tab reuses the properties tab's predicate
   * for children. This test records the consequence rather than the code shape.
   */
  describe('duplicated tab logic', () => {
    const nestedSchema = withProperties({
      status: {
        type: 'object',
        readOnly: true,
        properties: {
          phase: { type: 'string', readOnly: true },
          note: { type: 'string' },
        },
      },
    });

    it('RT-27: KNOWN-DEFECT hides read-only children inside the read-only tab', async () => {
      await renderPage(makeResourceType(nestedSchema), '/output-properties');

      const rows = readPropertyRows();

      // The parent is correctly selected as an output property.
      expect(rows).toContainEqual(expect.objectContaining({ path: 'status' }));

      // But its read-only child is filtered out by the writable-property
      // predicate, so `phase` is reachable from neither tab: the properties tab
      // drops the parent, and the output tab drops the child.
      expect(rows).not.toContainEqual(
        expect.objectContaining({ path: 'status.phase' }),
      );

      // And the writable child is shown here, in the tab that exists to show
      // only read-only values.
      expect(rows).toContainEqual(
        expect.objectContaining({ path: 'status.note' }),
      );
    });
  });

  describe('route parameters', () => {
    it('RT-28: loads a different namespace and type from the real route', async () => {
      await renderPage(
        makeResourceType({
          Name: 'databases',
          ResourceProviderNamespace: 'Applications.Datastores',
          Description: 'Database resources',
        }),
      );

      expect(
        screen.getByRole('heading', { name: 'databases' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Resource Type in Applications.Datastores'),
      ).toBeInTheDocument();
      expect(screen.getByText('Database resources')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'containers' })).toBeNull();
    });

    it('RT-29: refetches on namespace-only and type-only route changes without remounting', async () => {
      const resources = [
        makeResourceType(),
        makeResourceType({
          ResourceProviderNamespace: 'Custom.Compute',
          Description: 'Custom container resources',
        }),
        makeResourceType({
          Name: 'workers',
          ResourceProviderNamespace: 'Custom.Compute',
          Description: 'Custom worker resources',
        }),
      ];
      const getResourceType = jest.fn<
        ReturnType<RadiusApi['getResourceType']>,
        Parameters<RadiusApi['getResourceType']>
      >(async params => {
        const resource = resources.find(
          candidate =>
            candidate.Name === params.typeName &&
            candidate.ResourceProviderNamespace === params.namespace,
        );
        if (!resource)
          throw new Error(
            `Unexpected resource type request: ${JSON.stringify(params)}`,
          );
        expect(params).toEqual({
          namespace: resource.ResourceProviderNamespace,
          typeName: resource.Name,
        });
        return resource;
      });

      await renderWithApi(
        getResourceType,
        resourceTypePath(),
        <>
          <Link
            to={resourceTypePath({
              namespace: 'Custom.Compute',
              typeName: 'containers',
            })}
          >
            Change namespace
          </Link>
          <Link
            to={resourceTypePath({
              namespace: 'Custom.Compute',
              typeName: 'workers',
            })}
          >
            Change type
          </Link>
        </>,
      );
      expect(
        await screen.findByText('Container resources'),
      ).toBeInTheDocument();
      expect(getResourceType).toHaveBeenNthCalledWith(1, defaultParams);

      fireEvent.click(screen.getByRole('link', { name: 'Change namespace' }));
      expect(
        await screen.findByText('Custom container resources'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Resource Type in Custom.Compute'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Container resources')).toBeNull();
      expect(getResourceType).toHaveBeenNthCalledWith(2, {
        namespace: 'Custom.Compute',
        typeName: 'containers',
      });

      fireEvent.click(screen.getByRole('link', { name: 'Change type' }));
      expect(
        await screen.findByRole('heading', { name: 'workers' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Custom worker resources')).toBeInTheDocument();
      expect(screen.queryByText('Custom container resources')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'containers' })).toBeNull();
      expect(getResourceType).toHaveBeenNthCalledWith(3, {
        namespace: 'Custom.Compute',
        typeName: 'workers',
      });
      expect(getResourceType).toHaveBeenCalledTimes(3);
    });
  });

  it('RT-30: preserves repeated property names across parent paths and API versions', async () => {
    await renderPage(
      makeResourceType({
        APIVersions: {
          '2025-08-01-preview': {
            Schema: {
              properties: {
                name: { type: 'string' },
                source: {
                  type: 'object',
                  properties: { name: { type: 'integer' } },
                  required: ['name'],
                },
                target: {
                  type: 'object',
                  properties: { name: { type: 'boolean' } },
                },
              },
              required: ['name'],
            },
          },
          '2023-10-01-preview': {
            Schema: {
              properties: {
                name: { type: 'number' },
                source: {
                  type: 'object',
                  properties: { name: { type: 'string' } },
                },
              },
            },
          },
        },
        APIVersionList: ['2025-08-01-preview', '2023-10-01-preview'],
      }),
      '/properties',
    );

    expect(readPropertyRows()).toEqual([
      {
        version: '2025-08-01-preview',
        path: 'name',
        type: 'string',
        required: 'Yes',
      },
      {
        version: '2025-08-01-preview',
        path: 'source',
        type: 'object',
        required: 'No',
      },
      {
        version: '2025-08-01-preview',
        path: 'target',
        type: 'object',
        required: 'No',
      },
      {
        version: '2025-08-01-preview',
        path: 'source.name',
        type: 'integer',
        required: 'Yes',
      },
      {
        version: '2025-08-01-preview',
        path: 'target.name',
        type: 'boolean',
        required: 'No',
      },
      {
        version: '2023-10-01-preview',
        path: 'name',
        type: 'number',
        required: 'No',
      },
      {
        version: '2023-10-01-preview',
        path: 'source',
        type: 'object',
        required: 'No',
      },
      {
        version: '2023-10-01-preview',
        path: 'source.name',
        type: 'string',
        required: 'No',
      },
    ]);
  });

  /**
   * Regression coverage for radius-project/dashboard#340: code samples used to
   * be painted with fixed light-mode colors, so in dark mode they rendered the
   * theme's near-white text on a near-white background.
   */
  describe('code block theming', () => {
    /**
     * Flips only `palette.type` on the surrounding Backstage theme so the page
     * sees a dark palette while every other theme value stays intact.
     */
    const WithPaletteType = ({
      type,
      children,
    }: {
      type: 'light' | 'dark';
      children: React.ReactNode;
    }) => {
      const theme = useTheme();
      return (
        <ThemeProvider
          theme={{ ...theme, palette: { ...theme.palette, type } }}
        >
          {children}
        </ThemeProvider>
      );
    };

    const renderCodeBlock = async (type: 'light' | 'dark') => {
      const getResourceType = requestStub(async () =>
        makeResourceType({ Description: '```yaml\nimage: nginx\n```' }),
      );

      await renderInTestApp(
        <TestApiProvider apis={[[radiusApiRef, { getResourceType }]]}>
          <WithPaletteType type={type}>
            <FlatRoutes>
              <Route
                path="/resource-types/:namespace/:typeName"
                element={<ResourceTypeDetailPage />}
              />
            </FlatRoutes>
          </WithPaletteType>
        </TestApiProvider>,
        { routeEntries: [resourceTypePath()] },
      );

      const code = await screen.findByText(/image: nginx/);
      return code.closest('pre');
    };

    it('RT-31: paints code blocks light-on-dark in dark mode', async () => {
      expect(await renderCodeBlock('dark')).toHaveStyle({
        backgroundColor: '#161b22',
        color: '#e6edf3',
      });
    });

    it('RT-32: paints code blocks dark-on-light in light mode', async () => {
      expect(await renderCodeBlock('light')).toHaveStyle({
        backgroundColor: '#f6f8fa',
        color: '#24292f',
      });
    });
  });
});
