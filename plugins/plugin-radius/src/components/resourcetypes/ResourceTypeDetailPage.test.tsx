import React from 'react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceTypeDetailPage } from './ResourceTypeDetailPage';

jest.mock('react-router-dom', () => {
  return {
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({
      namespace: 'Applications.Core',
      typeName: 'containers',
    }),
  };
});

type ResourceTypeDetail = Awaited<ReturnType<RadiusApi['getResourceType']>>;

/**
 * The page reads only four fields off the fetched resource type, so every case
 * below varies `APIVersions` and keeps the rest constant.
 */
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

const renderPage = async (
  resourceType: ResourceTypeDetail,
  route: string = '/overview',
) => {
  const api: Pick<RadiusApi, 'getResourceType'> = {
    getResourceType: async () => resourceType,
  };

  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, api]]}>
      <ResourceTypeDetailPage />
    </TestApiProvider>,
    { routeEntries: [route] },
  );

  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: 'containers' }),
    ).toBeInTheDocument();
  });
};

/**
 * Reads the rendered property table as `name -> { type, required }`. The table
 * is assembled inline in the page's JSX rather than by a shared component, so
 * asserting on the parsed rows keeps these tests describing the schema
 * interpretation rather than the markup that happens to express it.
 */
const readPropertyRows = () => {
  const rows: Record<string, { type: string; required: string }> = {};

  for (const row of screen.getAllByRole('row')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;

    const name = cells[0].textContent?.trim() ?? '';
    if (!name) continue;

    rows[name] = {
      type: cells[1].textContent?.trim() ?? '',
      required: cells[2].textContent?.trim() ?? '',
    };
  }

  return rows;
};

describe('ResourceTypeDetailPage', () => {
  describe('load states', () => {
    it('RT-01: shows progress until the resource type resolves', async () => {
      const deferred: ((value: ResourceTypeDetail) => void)[] = [];
      const api: Pick<RadiusApi, 'getResourceType'> = {
        getResourceType: async () =>
          new Promise<ResourceTypeDetail>(resolve => {
            deferred.push(resolve);
          }),
      };

      await renderInTestApp(
        <TestApiProvider apis={[[radiusApiRef, api]]}>
          <ResourceTypeDetailPage />
        </TestApiProvider>,
      );

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
      const api: Pick<RadiusApi, 'getResourceType'> = {
        getResourceType: async () => Promise.reject(new Error('Oh noes!')),
      };

      await renderInTestApp(
        <TestApiProvider apis={[[radiusApiRef, api]]}>
          <ResourceTypeDetailPage />
        </TestApiProvider>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Oh noes!');
    });

    it('RT-03: reports a resolved-but-absent resource type as an error', async () => {
      const api: Pick<RadiusApi, 'getResourceType'> = {
        getResourceType: async () => undefined as unknown as ResourceTypeDetail,
      };

      await renderInTestApp(
        <TestApiProvider apis={[[radiusApiRef, api]]}>
          <ResourceTypeDetailPage />
        </TestApiProvider>,
      );

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

      expect(readPropertyRows()).toHaveProperty('image');
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

      expect(readPropertyRows()).toHaveProperty('image');
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

      expect(readPropertyRows()).toHaveProperty('image');
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

      expect(readPropertyRows().conn.type).toBe('ConnectionSpec');
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

      expect(readPropertyRows().args.type).toBe('string[]');
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

      expect(readPropertyRows().ports.type).toBe('PortSpec[]');
    });

    it('RT-16: falls back to a bare array when the element type is unknown', async () => {
      await renderPage(
        makeResourceType(withProperties({ tags: { type: 'array' } })),
        '/properties',
      );

      expect(readPropertyRows().tags.type).toBe('array');
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

      expect(readPropertyRows().env.type).toBe('map');
    });

    it('RT-18: defaults an untyped property to object', async () => {
      await renderPage(
        makeResourceType(withProperties({ mystery: { description: 'hm' } })),
        '/properties',
      );

      expect(readPropertyRows().mystery.type).toBe('object');
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
      expect(rows.image.required).toBe('Yes');
      expect(rows.restartPolicy.required).toBe('No');
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
      expect(rows).toHaveProperty('image');
      expect(rows).not.toHaveProperty('provisioningState');
    });

    it('RT-21: treats a false readOnly as writable rather than as read-only', async () => {
      await renderPage(
        makeResourceType(
          withProperties({ image: { type: 'string', readOnly: false } }),
        ),
        '/properties',
      );

      expect(readPropertyRows()).toHaveProperty('image');
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
      expect(rows).toHaveProperty('provisioningState');
      expect(rows).not.toHaveProperty('image');
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
      expect(rows).toHaveProperty('status');

      // But its read-only child is filtered out by the writable-property
      // predicate, so `phase` is reachable from neither tab: the properties tab
      // drops the parent, and the output tab drops the child.
      expect(rows).not.toHaveProperty('phase');

      // And the writable child is shown here, in the tab that exists to show
      // only read-only values.
      expect(rows).toHaveProperty('note');
    });
  });
});
