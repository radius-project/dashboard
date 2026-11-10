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
    required: string | null;
    description: string;
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
        required:
          cells.length === 4 ? (cells[2].textContent?.trim() ?? '') : null,
        description: cells[cells.length - 1].textContent?.trim() ?? '',
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

  describe('nested read-only filtering', () => {
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

    it('RT-27: shows read-only children and hides writable children in the output tab', async () => {
      await renderPage(makeResourceType(nestedSchema), '/output-properties');

      const rows = readPropertyRows();

      expect(rows).toContainEqual(expect.objectContaining({ path: 'status' }));
      expect(rows).toContainEqual(
        expect.objectContaining({ path: 'status.phase' }),
      );
      expect(rows).not.toContainEqual(
        expect.objectContaining({ path: 'status.note' }),
      );
    });
  });

  describe.each([
    { tab: '/properties', readOnly: false },
    { tab: '/output-properties', readOnly: true },
  ])('$tab schema cases', ({ tab, readOnly }) => {
    const version = '2023-10-01-preview';
    const row = (
      path: string,
      type: string,
      required = false,
      description = 'No description available',
    ) => {
      const requiredText = required ? 'Yes' : 'No';
      return {
        version,
        path,
        type,
        required: readOnly ? null : requiredText,
        description,
      };
    };

    it('RT-38: formats top-level types and filters fields on both tabs', async () => {
      await renderPage(
        makeResourceType(
          withProperties(
            {
              connection: { $ref: '#/definitions/Connection', readOnly },
              tags: { type: 'array', items: { type: 'string' }, readOnly },
              ports: {
                type: 'array',
                items: { $ref: '#/definitions/Port' },
                readOnly,
              },
              unknownItems: { type: 'array', readOnly },
              metadata: {
                type: 'object',
                additionalProperties: { type: 'string' },
                readOnly,
              },
              untyped: { readOnly },
              implicitWritable: { type: 'boolean' },
              explicitWritable: { type: 'integer', readOnly: false },
              excluded: { type: 'string', readOnly: !readOnly },
            },
            ['connection'],
          ),
        ),
        tab,
      );

      expect(readPropertyRows()).toEqual([
        row('connection', 'Connection', true),
        row('tags', 'string[]'),
        row('ports', 'Port[]'),
        row('unknownItems', 'array'),
        row('metadata', 'map'),
        row('untyped', 'object'),
        ...(!readOnly
          ? [
              row('implicitWritable', 'boolean'),
              row('explicitWritable', 'integer'),
            ]
          : []),
      ]);
    });

    it.each([
      'Schema',
      'schema',
      'nested Schema',
      'definitions',
      'resource',
      'resourceType',
    ])('RT-39: discovers fields under %s', async location => {
      const schema = {
        properties: {
          value: {
            type: 'string',
            readOnly,
            description: 'Discovered field.',
          },
        },
        required: ['value'],
      };
      const locations: Record<
        string,
        ResourceTypeDetail['APIVersions'][string]
      > = {
        Schema: { Schema: schema },
        schema: { schema } as ResourceTypeDetail['APIVersions'][string],
        'nested Schema': { Schema: { Schema: schema } },
        definitions: {
          Schema: { definitions: { Empty: {}, Resource: schema } },
        },
        resource: { Schema: { resource: schema } },
        resourceType: { Schema: { resourceType: schema } },
      };

      await renderPage(
        makeResourceType({ APIVersions: { [version]: locations[location] } }),
        tab,
      );

      expect(readPropertyRows()).toEqual([
        row('value', 'string', true, 'Discovered field.'),
      ]);
    });

    it('RT-40: does not create nested tables when every child is filtered out', async () => {
      await renderPage(
        makeResourceType(
          withProperties({
            settings: {
              type: 'object',
              readOnly,
              properties: {
                excluded: { type: 'string', readOnly: !readOnly },
              },
            },
          }),
        ),
        tab,
      );

      expect(readPropertyRows()).toEqual([row('settings', 'object')]);
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.queryByRole('link', { name: 'settings' })).toBeNull();
    });

    it.each([
      { kind: 'object', type: 'object' },
      { kind: 'inferred object', type: 'object' },
      { kind: 'array of objects', type: 'object[]' },
      { kind: 'map of objects', type: 'map' },
    ])(
      'RT-35: renders complete rows for an $kind, including deeply nested fields',
      async ({ kind, type }) => {
        const properties = {
          title: {
            type: 'string',
            readOnly,
            description: '(Required) Display **title**.',
          },
          connection: { $ref: '#/definitions/Connection', readOnly },
          tags: { type: 'array', items: { type: 'string' }, readOnly },
          ports: {
            type: 'array',
            items: { $ref: '#/definitions/Port' },
            readOnly,
          },
          unknownItems: { type: 'array', readOnly },
          metadata: {
            type: 'object',
            additionalProperties: { type: 'string' },
            readOnly,
          },
          untyped: { readOnly },
          implicitWritable: { type: 'boolean' },
          explicitWritable: { type: 'integer', readOnly: false },
          excluded: { type: 'string', readOnly: !readOnly },
          details: {
            type: 'object',
            readOnly,
            description: '(Optional) Detail fields.',
            properties: {
              endpoint: {
                readOnly,
                properties: {
                  host: {
                    type: 'string',
                    readOnly,
                    description: '(Read-only) Endpoint host.',
                  },
                  excluded: { type: 'string', readOnly: !readOnly },
                },
                required: ['host'],
              },
              excluded: { type: 'string', readOnly: !readOnly },
            },
            required: ['endpoint'],
          },
        };
        const objectSchema = {
          type: 'object',
          properties,
          required: ['title', 'connection', 'excluded'],
        };
        const containers: Record<string, Record<string, unknown>> = {
          object: objectSchema,
          'inferred object': {
            properties,
            required: objectSchema.required,
          },
          'array of objects': { type: 'array', items: objectSchema },
          'map of objects': {
            type: 'object',
            additionalProperties: objectSchema,
          },
        };

        await renderPage(
          makeResourceType(
            withProperties(
              {
                settings: {
                  ...containers[kind],
                  readOnly,
                  description: 'Settings description.',
                },
                excluded: { type: 'string', readOnly: !readOnly },
              },
              ['settings'],
            ),
          ),
          tab,
        );

        const expected = [
          row('settings', type, true, 'Settings description.'),
          row('settings.title', 'string', true, 'Display title.'),
          row('settings.connection', 'Connection', true),
          row('settings.tags', 'string[]'),
          row('settings.ports', 'Port[]'),
          row('settings.unknownItems', 'array'),
          row('settings.metadata', 'map'),
          row('settings.untyped', 'object'),
          row('settings.details', 'object', false, 'Detail fields.'),
          row('settings.details.endpoint', 'object', true),
          row(
            'settings.details.endpoint.host',
            'string',
            true,
            'Endpoint host.',
          ),
        ];
        if (!readOnly) {
          expected.push(
            row('settings.implicitWritable', 'boolean'),
            row('settings.explicitWritable', 'integer'),
          );
        }
        if (kind === 'map of objects') {
          expected.push(
            row('settings.name', 'string', true, 'Settings description.'),
          );
        }
        const byPath = (a: { path: string }, b: { path: string }) =>
          a.path.localeCompare(b.path);

        expect(readPropertyRows().sort(byPath)).toEqual(expected.sort(byPath));
      },
    );

    it.each(['sibling', 'embedded'])(
      'RT-36: renders fixed fields and %s additionalProperties without a duplicate row',
      async location => {
        const additionalProperties = {
          type: 'object',
          description: '(Optional) Dynamic settings.',
          properties: {
            value: {
              type: 'string',
              readOnly,
              description: 'Dynamic value.',
            },
            excluded: { type: 'string', readOnly: !readOnly },
          },
          required: ['value'],
        };
        const fixedProperties = {
          enabled: {
            type: 'boolean',
            readOnly,
            description: 'Enable the setting.',
          },
          excluded: { type: 'string', readOnly: !readOnly },
        };
        const schema =
          location === 'sibling'
            ? {
                properties: fixedProperties,
                additionalProperties,
              }
            : {
                properties: { ...fixedProperties, additionalProperties },
              };

        await renderPage(
          makeResourceType(
            withProperties({
              settings: {
                type: 'object',
                readOnly,
                required: ['enabled'],
                ...schema,
              },
            }),
          ),
          tab,
        );

        expect(readPropertyRows()).toEqual([
          row('settings', location === 'sibling' ? 'map' : 'object'),
          row('settings.enabled', 'boolean', true, 'Enable the setting.'),
          row('settings.Map of key/values', 'map', false, 'Dynamic settings.'),
          row(
            'settings.Map of key/values.value',
            'string',
            true,
            'Dynamic value.',
          ),
        ]);
      },
    );

    it('RT-37: keeps API versions and parent paths distinct for output and input fields', async () => {
      const schema = (type: string) => ({
        Schema: {
          properties: {
            source: {
              type: 'object',
              readOnly,
              properties: {
                name: { type, readOnly, description: 'Source name.' },
              },
              required: ['name'],
            },
            target: {
              type: 'object',
              readOnly,
              properties: {
                name: { type: 'boolean', readOnly },
              },
            },
          },
          required: ['source'],
        },
      });

      await renderPage(
        makeResourceType({
          APIVersions: {
            '2023-10-01-preview': schema('string'),
            '2025-08-01-preview': schema('integer'),
          },
        }),
        tab,
      );

      expect(readPropertyRows()).toEqual(
        [
          { version: '2025-08-01-preview', type: 'integer' },
          { version, type: 'string' },
        ].flatMap(apiVersion =>
          [
            row('source', 'object', true),
            row('target', 'object'),
            row('source.name', apiVersion.type, true, 'Source name.'),
            row('target.name', 'boolean'),
          ].map(property => ({ ...property, version: apiVersion.version })),
        ),
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
        description: 'No description available',
      },
      {
        version: '2025-08-01-preview',
        path: 'source',
        type: 'object',
        required: 'No',
        description: 'No description available',
      },
      {
        version: '2025-08-01-preview',
        path: 'target',
        type: 'object',
        required: 'No',
        description: 'No description available',
      },
      {
        version: '2025-08-01-preview',
        path: 'source.name',
        type: 'integer',
        required: 'Yes',
        description: 'No description available',
      },
      {
        version: '2025-08-01-preview',
        path: 'target.name',
        type: 'boolean',
        required: 'No',
        description: 'No description available',
      },
      {
        version: '2023-10-01-preview',
        path: 'name',
        type: 'number',
        required: 'No',
        description: 'No description available',
      },
      {
        version: '2023-10-01-preview',
        path: 'source',
        type: 'object',
        required: 'No',
        description: 'No description available',
      },
      {
        version: '2023-10-01-preview',
        path: 'source.name',
        type: 'string',
        required: 'No',
        description: 'No description available',
      },
    ]);
  });

  /**
   * Regression coverage for radius-project/dashboard#340: code samples used to
   * be painted with fixed light-mode colors, so in dark mode they rendered the
   * theme's near-white text on a near-white background.
   */
  describe('theme-aware colors', () => {
    /**
     * Supplies the requested palette type and, when requested, distinctive
     * semantic tokens that make accidental hard-coded colors easy to detect.
     */
    const WithTheme = ({
      type,
      useCustomTokens = false,
      children,
    }: {
      type: 'light' | 'dark';
      useCustomTokens?: boolean;
      children: React.ReactNode;
    }) => {
      const theme = useTheme();
      const palette = useCustomTokens
        ? {
            ...theme.palette,
            type,
            background: {
              ...theme.palette.background,
              paper: '#102030',
            },
            text: {
              ...theme.palette.text,
              primary: '#f5f5f5',
              secondary: '#d6dde3',
            },
            action: {
              ...theme.palette.action,
              hover: '#203040',
            },
            divider: '#6f8294',
            link: '#9fd3ff',
            linkHover: '#c2e4ff',
          }
        : { ...theme.palette, type };

      return (
        <ThemeProvider theme={{ ...theme, palette }}>{children}</ThemeProvider>
      );
    };

    const renderThemedPage = async (
      type: 'light' | 'dark',
      resourceType: ResourceTypeDetail,
      tab = '/overview',
      useCustomTokens = false,
    ) => {
      const params = {
        namespace: resourceType.ResourceProviderNamespace,
        typeName: resourceType.Name,
      };
      const getResourceType = requestStub(async () => resourceType, params);

      return await renderInTestApp(
        <TestApiProvider apis={[[radiusApiRef, { getResourceType }]]}>
          <WithTheme type={type} useCustomTokens={useCustomTokens}>
            <FlatRoutes>
              <Route
                path="/resource-types/:namespace/:typeName"
                element={<ResourceTypeDetailPage />}
              />
            </FlatRoutes>
          </WithTheme>
        </TestApiProvider>,
        { routeEntries: [resourceTypePath(params, tab)] },
      );
    };

    const renderOverviewCodeBlock = async (type: 'light' | 'dark') => {
      await renderThemedPage(
        type,
        makeResourceType({ Description: '```yaml\nimage: nginx\n```' }),
      );

      const code = await screen.findByText(/image: nginx/);
      return {
        pre: code.closest('pre'),
        copyButton: screen.getByRole('button', {
          name: 'Copy to clipboard',
        }),
      };
    };

    it('RT-31: paints code blocks light-on-dark in dark mode', async () => {
      const { pre, copyButton } = await renderOverviewCodeBlock('dark');

      expect(pre).toHaveStyle({
        backgroundColor: '#161b22',
        color: '#e6edf3',
      });
      expect(copyButton).toHaveStyle({
        backgroundColor: 'rgba(22, 27, 34, 0.95)',
        border: '1px solid rgba(240, 246, 252, 0.1)',
      });
    });

    it('RT-32: paints code blocks dark-on-light in light mode', async () => {
      const { pre, copyButton } = await renderOverviewCodeBlock('light');

      expect(pre).toHaveStyle({
        backgroundColor: '#f6f8fa',
        color: '#24292f',
      });
      expect(copyButton).toHaveStyle({
        backgroundColor: 'rgba(246, 248, 250, 0.95)',
        border: '1px solid rgba(31, 35, 40, 0.15)',
      });
    });

    it('RT-33: themes code blocks inside property descriptions', async () => {
      const { container } = await renderThemedPage(
        'dark',
        makeResourceType(
          withProperties({
            image: {
              type: 'string',
              description: '```yaml\nimage: nginx\n```',
            },
          }),
        ),
        '/properties',
      );

      const pre = container.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(window.getComputedStyle(pre!)).toMatchObject({
        backgroundColor: 'rgb(22, 27, 34)',
        color: 'rgb(230, 237, 243)',
      });
    });

    it('RT-34: derives surrounding page colors from Backstage theme tokens', async () => {
      await renderThemedPage(
        'dark',
        makeResourceType({
          APIVersions: {
            '2025-08-01-preview': {
              Schema: {
                properties: {
                  image: { type: 'string' },
                  port: { type: 'number' },
                },
                required: ['image'],
              },
            },
            '2023-10-01-preview': { Schema: { properties: {} } },
          },
          APIVersionList: ['2025-08-01-preview', '2023-10-01-preview'],
        }),
        '/properties',
        true,
      );

      const navigationTitle = await screen.findByText('API Versions');
      expect(navigationTitle).toHaveStyle({ color: '#f5f5f5' });
      expect(navigationTitle.parentElement).toHaveStyle({
        backgroundColor: '#203040',
        border: '1px solid #6f8294',
      });

      expect(
        screen.getByRole('link', { name: '2025-08-01-preview' }),
      ).toHaveStyle({
        backgroundColor: '#102030',
        border: '1px solid #6f8294',
        color: '#9fd3ff',
      });

      expect(screen.getByText('Yes')).toHaveStyle({ color: '#f5f5f5' });
      expect(screen.getAllByText('No')[0]).toHaveStyle({ color: '#d6dde3' });
    });
  });
});
