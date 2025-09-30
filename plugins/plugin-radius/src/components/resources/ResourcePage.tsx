import React from 'react';
import { ResourceLayout } from './ResourceLayout';
import {
  Progress,
  ResponseErrorPanel,
  TabbedLayout,
} from '@backstage/core-components';
import { OverviewTab } from './OverviewTab';
import { DetailsTab } from './DetailsTab';
import { Resource } from '../../resources';
import useAsync from 'react-use/lib/useAsync';
import { useApi, useRouteRefParams } from '@backstage/core-plugin-api';
import { resourcePageRouteRef } from '../../routes';
import { ApplicationTab } from './ApplicationTab';
import { ApplicationResourcesTab } from './ApplicationResourcesTab';
import { radiusApiRef } from '../../plugin';

export const ResourcePage = () => {
  const radiusApi = useApi(radiusApiRef);
  const params = useRouteRefParams(resourcePageRouteRef);
  const id = `/planes/radius/local/resourceGroups/${params.group}/providers/${params.namespace}/${params.type}/${params.name}`;

  const { value, loading, error } = useAsync(async (): Promise<Resource> => {
    return radiusApi.getResourceById({ id });
  }, [id]);

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  } else if (!value) {
    throw new Error('This should not happen.');
  }

  const hasApplication = value?.properties?.application || false;
  const isApplication = value?.type === 'Applications.Core/applications';
  let application: string | undefined = undefined;
  if (hasApplication) {
    application = value.properties.application as string;
  } else if (isApplication) {
    application = value.id;
  }

  return (
    <ResourceLayout resource={value}>
      <TabbedLayout>
        <TabbedLayout.Route path="overview" title="Overview">
          <OverviewTab resource={value} />
        </TabbedLayout.Route>
        <TabbedLayout.Route path="details" title="Details">
          <DetailsTab resource={value} />
        </TabbedLayout.Route>
        {application && (
          <TabbedLayout.Route path="application" title="App Graph">
            <ApplicationTab application={application} />
          </TabbedLayout.Route>
        )}
        {isApplication && (
          <TabbedLayout.Route path="resources" title="Resources">
            <ApplicationResourcesTab resource={value} />
          </TabbedLayout.Route>
        )}
      </TabbedLayout>
    </ResourceLayout>
  );
};
