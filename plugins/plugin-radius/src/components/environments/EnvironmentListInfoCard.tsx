import {
  InfoCard,
  LinkButton,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import React, { useCallback } from 'react';
import { radiusApiRef } from '../../api/ref';
import { EnvironmentProperties, Resource } from '../../resources';
import { ResourceLink } from '../resourcelink';
import { environmentPageRouteRef } from '../../routes';
import { parseResourceId } from '@radapp.io/rad-components/resourceId';
import { ResourceQueryResult } from '../queryresult/ResourceQueryResult';
import { useInventoryQuery } from '../queryresult/useInventoryQuery';

const EnvironmentListInfoContent = () => {
  const route = useRouteRef(environmentPageRouteRef);

  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error, retry } = useInventoryQuery(
    useCallback(async () => {
      return radiusApi.listEnvironments<EnvironmentProperties>();
    }, [radiusApi]),
  );

  const columns: TableColumn<Resource<EnvironmentProperties>>[] = [
    {
      title: 'Name',
      type: 'string',
      width: '30%',
      highlight: true,
      render: row => <ResourceLink id={row.id} />,
    },
    {
      title: 'Actions',
      align: 'right',
      render: row => {
        const parsed = parseResourceId(row.id);
        if (!parsed) {
          return null;
        }

        const base = route({
          group: parsed.group,
          namespace: parsed.type.split('/')[0],
          type: parsed.type.split('/')[1],
          name: parsed.name,
        });
        return (
          <>
            <LinkButton to={`${base}/overview`}>Overview</LinkButton>
            <LinkButton to={`${base}/resources`}>Resources</LinkButton>
          </>
        );
      },
    },
  ];

  return (
    <ResourceQueryResult
      result={value}
      loading={loading}
      error={error}
      retry={retry}
    >
      <Table
        columns={columns}
        components={{ Toolbar: _row => null }}
        options={{
          search: false,
          paging: false,
          padding: 'dense',
          pageSize: 5,
        }}
        data={value?.value || []}
      />
    </ResourceQueryResult>
  );
};

export const EnvironmentListInfoCard = () => {
  return (
    <InfoCard title="Environments">
      <EnvironmentListInfoContent />
    </InfoCard>
  );
};
