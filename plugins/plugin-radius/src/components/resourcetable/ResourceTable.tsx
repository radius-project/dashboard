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
  resourceType?: string;
}) => {
  const columns: TableColumn<Resource>[] = [
    {
      title: 'Name',
      render: row => <ResourceLink id={row.id} />,
    },
    { title: 'Resource Group', render: row => parseResourceId(row.id)?.group },
    { title: 'Type', field: 'type' },
  ];

  // Special case some additional fields by hiding them when they would never have a value.
  if (props.resourceType === 'Applications.Core/environments') {
    // Nothing to add
  } else if (props.resourceType === 'Applications.Core/applications') {
    columns.push({
      title: 'Environment',
      field: 'properties.environment',
      render: row => (
        <OptionalResourceLink id={row.properties?.environment as string} />
      ),
    });
  } else {
    columns.push({
      title: 'Application',
      field: 'properties.application',
      render: row => (
        <OptionalResourceLink id={row.properties?.application as string} />
      ),
    });
    columns.push({
      title: 'Environment',
      field: 'properties.environment',
      render: row => (
        <OptionalResourceLink id={row.properties?.environment as string} />
      ),
    });
  }

  columns.push({ title: 'Status', field: 'properties.provisioningState' });

  return (
    <Table
      title={props.title}
      options={{ search: false, paging: false }}
      columns={columns}
      data={props.resources}
    />
  );
};

export const ResourceTable = (props: {
  title: string;
  resourceType?: string;
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
      resourceType={props.resourceType}
    />
  );
};
