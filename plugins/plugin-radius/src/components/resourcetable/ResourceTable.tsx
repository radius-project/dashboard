import React from 'react';
import { Resource, ResourceList, parseResourceId } from '../../resources';
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

const DataTable = (props: {
  resources: Resource[];
  title: string;
  filters?: { environment?: string; application?: string };
  resourceType?: string;
}) => {
  const columns: TableColumn<Resource>[] = [
    {
      title: 'Name',
      type: 'string',
      render: row => <ResourceLink id={row.id} />,
    },
    {
      title: 'Resource Group',
      type: 'string',
      render: row => parseResourceId(row.id)?.group,
    },
    { title: 'Type', field: 'type', type: 'string' },
  ];

  // Special case some additional fields by hiding them when they would never have a value.
  if (props.resourceType === 'Applications.Core/environments') {
    // Nothing to add
  } else if (props.resourceType === 'Applications.Core/applications') {
    columns.push({
      title: 'Environment',
      field: 'properties.environment',
      type: 'string',
      render: row => (
        <OptionalResourceLink id={row.properties?.environment as string} />
      ),
    });
  } else {
    columns.push({
      title: 'Application',
      field: 'properties.application',
      type: 'string',
      render: row => (
        <OptionalResourceLink id={row.properties?.application as string} />
      ),
    });
    columns.push({
      title: 'Environment',
      field: 'properties.environment',
      type: 'string',
      render: row => (
        <OptionalResourceLink id={row.properties?.environment as string} />
      ),
    });
  }

  columns.push({ title: 'Status', field: 'properties.provisioningState' });

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

    return true;
  });

  return (
    <Table
      title={props.title}
      options={{ search: false, paging: false }}
      columns={columns}
      data={data}
    />
  );
};

export const ResourceTable = (props: {
  title: string;
  resourceType?: string;
  filters?: { environment?: string; application?: string };
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
    />
  );
};
