import React from 'react';
import { Resource, ResourceList } from '../../resources';
import {
  Progress,
  ResponseErrorPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  OptionalResourceLink,
  ResourceLink,
} from '../resourcelink/ResourceLink';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { radiusApiRef } from '../../plugin';
import { parseResourceId } from '@radapp.io/rad-components';
import { isEnvironmentType, isApplicationType } from '../../resources';

/**
 * Sorts and filters a column by the text its cell shows. Several columns show
 * a value derived from the row (a name parsed from a resource ID, a computed
 * kind) rather than a plain field, so the table's default field-based sorting
 * and filtering would do nothing or act on the full resource ID.
 */
const byDisplayedText = (
  text: (row: Resource) => string | undefined,
): Pick<TableColumn<Resource>, 'customSort' | 'customFilterAndSearch'> => ({
  customSort: (a, b) => (text(a) ?? '').localeCompare(text(b) ?? ''),
  customFilterAndSearch: (filter, row) =>
    (text(row) ?? '').toLowerCase().includes(String(filter).toLowerCase()),
});

/** The name shown for an optional resource ID reference, as rendered by `OptionalResourceLink`. */
const referencedName = (id: unknown): string | undefined =>
  typeof id === 'string' ? parseResourceId(id)?.name : undefined;

const DataTable = (props: {
  resources: Resource[];
  title: string;
  filters?: { environment?: string; application?: string };
  resourceType?: string;
  resourceGroupFilter?: string;
}) => {
  const columns: TableColumn<Resource>[] = [
    {
      title: 'Name',
      type: 'string',
      render: row => <ResourceLink id={row.id} />,
      ...byDisplayedText(row => parseResourceId(row.id)?.name),
    },
    {
      title: 'Resource Group',
      type: 'string',
      render: row => parseResourceId(row.id)?.group,
      ...byDisplayedText(row => parseResourceId(row.id)?.group),
    },
  ];

  // Helper function to determine environment kind
  const getEnvironmentKind = (resource: Resource): string => {
    const providers = resource.properties?.providers as
      | {
          azure?: Record<string, unknown>;
          aws?: Record<string, unknown>;
        }
      | undefined;

    if (!providers) {
      return 'Kubernetes';
    }

    if (providers.azure) {
      return 'Azure';
    }

    if (providers.aws) {
      return 'AWS';
    }

    return 'Kubernetes';
  };

  // Add Kind column for environment resources, Type column for others
  if (isEnvironmentType(props.resourceType)) {
    columns.push({
      title: 'Kind',
      type: 'string',
      render: row => getEnvironmentKind(row),
      ...byDisplayedText(getEnvironmentKind),
    });
  } else {
    columns.push({ title: 'Type', field: 'type', type: 'string' });
  }

  // Special case some additional fields by hiding them when they would never have a value.
  if (isEnvironmentType(props.resourceType)) {
    // Nothing to add
  } else if (isApplicationType(props.resourceType)) {
    columns.push({
      title: 'Environment',
      field: 'properties.environment',
      type: 'string',
      render: row => (
        <OptionalResourceLink id={row.properties?.environment as string} />
      ),
      ...byDisplayedText(row => referencedName(row.properties?.environment)),
    });
  } else {
    columns.push({
      title: 'Application',
      field: 'properties.application',
      type: 'string',
      render: row => (
        <OptionalResourceLink id={row.properties?.application as string} />
      ),
      ...byDisplayedText(row => referencedName(row.properties?.application)),
    });
    columns.push({
      title: 'Environment',
      field: 'properties.environment',
      type: 'string',
      render: row => (
        <OptionalResourceLink id={row.properties?.environment as string} />
      ),
      ...byDisplayedText(row => referencedName(row.properties?.environment)),
    });
  }

  // Add Status column for non-environment resources
  if (!isEnvironmentType(props.resourceType)) {
    columns.push({ title: 'Status', field: 'properties.provisioningState' });
  }

  const data = props.resources.filter(resource => {
    // If the id equals the filter, then exclude it. 'resource.id' will always be a string.
    if (
      props.filters?.environment?.toLowerCase() === resource.id.toLowerCase()
    ) {
      return false;
    } else if (
      props.filters?.application?.toLowerCase() === resource.id.toLowerCase()
    ) {
      return false;
    }

    const application = resource.properties?.application as string;
    const environment = resource.properties?.environment as string;
    if (
      props.filters?.environment &&
      environment?.toLowerCase() !== props.filters.environment.toLowerCase()
    ) {
      return false;
    }
    if (
      props.filters?.application &&
      application?.toLowerCase() !== props.filters.application.toLowerCase()
    ) {
      return false;
    }

    // Filter by resource group if specified
    if (props.resourceGroupFilter) {
      const resourceGroup = parseResourceId(resource.id)?.group;
      if (resourceGroup !== props.resourceGroupFilter) {
        return false;
      }
    }

    return true;
  });

  // Sort environments by resource group (ascending) then by name (ascending)
  const sortedData = isEnvironmentType(props.resourceType)
    ? [...data].sort((a, b) => {
        const groupA = parseResourceId(a.id)?.group || '';
        const groupB = parseResourceId(b.id)?.group || '';
        const nameA = a.name || '';
        const nameB = b.name || '';

        // First sort by resource group (ascending)
        if (groupA !== groupB) {
          return groupA.localeCompare(groupB);
        }

        // Then sort by name (ascending)
        return nameA.localeCompare(nameB);
      })
    : data;

  return (
    <Table
      title={props.title}
      options={{
        search: false,
        paging: false,
        sorting: true,
        filtering: true,
      }}
      columns={columns}
      data={sortedData}
    />
  );
};

export const ResourceTable = (props: {
  title: string;
  resourceType?: string;
  filters?: { environment?: string; application?: string };
  resourceGroupFilter?: string;
}) => {
  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(
    async (): Promise<ResourceList<{ [key: string]: unknown }>> => {
      return radiusApi.listResources<{ [key: string]: unknown }>({
        resourceType: props.resourceType,
      });
    },
  );

  if (loading) {
    return <Progress data-testid="progress" />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  return (
    <DataTable
      resources={value?.value || []}
      title={props.title}
      filters={props.filters}
      resourceType={props.resourceType}
      resourceGroupFilter={props.resourceGroupFilter}
    />
  );
};
