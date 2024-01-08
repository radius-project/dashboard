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
import { radiusApiRef } from '../../plugin';
import {
  ApplicationProperties,
  Resource,
  ResourceList,
  parseResourceId,
} from '../../resources';
import { ResourceLink } from '../resourcelink';
import { resourcePageRouteRef } from '../../routes';

const ApplicationListInfoContent = () => {
  const route = useRouteRef(resourcePageRouteRef);

  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(
    async (): Promise<ResourceList<ApplicationProperties>> => {
      return radiusApi.listApplications<ApplicationProperties>();
    },
  );

  if (loading) {
    return <Progress data-testid="progress" />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const columns: TableColumn<Resource<ApplicationProperties>>[] = [
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
            <LinkButton to={`${base}/application`}>App Graph</LinkButton>
            <LinkButton to={`${base}/resources`}>Resources</LinkButton>
          </>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      components={{ Toolbar: _row => null }}
      options={{ search: false, paging: false, padding: 'dense', pageSize: 5 }}
      data={value?.value || []}
    />
  );
};

export const ApplicationListInfoCard = () => {
  return (
    <InfoCard title="Applications">
      <ApplicationListInfoContent />
    </InfoCard>
  );
};
