import React from 'react';
import { EnvironmentLayout } from './EnvironmentLayout';
import {
  Progress,
  ResponseErrorPanel,
  TabbedLayout,
} from '@backstage/core-components';
import { EnvironmentOverviewTab } from './EnvironmentOverviewTab';
import { EnvironmentDetailsTab } from './EnvironmentDetailsTab';
import { Resource, EnvironmentProperties } from '../../resources';
import useAsync from 'react-use/lib/useAsync';
import { useApi, useRouteRefParams } from '@backstage/core-plugin-api';
import { environmentPageRouteRef } from '../../routes';
import { radiusApiRef } from '../../plugin';
import { EnvironmentResourcesTab } from './EnvironmentResourcesTab';

export const EnvironmentPage = () => {
  const radiusApi = useApi(radiusApiRef);
  const params = useRouteRefParams(environmentPageRouteRef);
  const id = `/planes/radius/local/resourceGroups/${params.group}/providers/${params.namespace}/${params.type}/${params.name}`;

  const { value, loading, error } = useAsync(async (): Promise<Resource<EnvironmentProperties>> => {
    return radiusApi.getResourceById<EnvironmentProperties>({ id });
  }, [id]);

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  } else if (!value) {
    throw new Error('This should not happen.');
  }

  return (
    <EnvironmentLayout environment={value}>
      <TabbedLayout>
        <TabbedLayout.Route path="overview" title="Overview">
          <EnvironmentOverviewTab environment={value} />
        </TabbedLayout.Route>
        <TabbedLayout.Route path="resources" title="Resources">
          <EnvironmentResourcesTab environment={value} />
        </TabbedLayout.Route>
        <TabbedLayout.Route path="details" title="Details">
          <EnvironmentDetailsTab environment={value} />
        </TabbedLayout.Route>
      </TabbedLayout>
    </EnvironmentLayout>
  );
};