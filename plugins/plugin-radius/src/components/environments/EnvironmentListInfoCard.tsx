import {
  InfoCard,
  LinkButton,
  Progress,
  ResponseErrorPanel,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import React from 'react';
import useAsync from 'react-use/lib/useAsync';
import { radiusApiRef } from '../../api/ref';
import { EnvironmentProperties, Resource } from '../../resources';
import { ResourceLink } from '../resourcelink';
import { environmentPageRouteRef } from '../../routes';
import { parseLegacyResourceId as parseResourceId } from '@radius-project/core/domain';
import { ResourceQueryResult } from '../queryresult/ResourceQueryResult';

const EnvironmentListInfoContent = () => {
  const route = useRouteRef(environmentPageRouteRef);

  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(async () => {
    return radiusApi.listEnvironments<EnvironmentProperties>();
  }, [radiusApi]);

  if (loading) {
    return <Progress data-testid="progress" />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

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
    <ResourceQueryResult result={value}>
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
