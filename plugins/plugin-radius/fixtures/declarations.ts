import {
  ApplicationListPage,
  radiusPlugin,
  radiusApiRef,
  applicationListPageRouteRef,
  type RadiusApi,
} from '@internal/plugin-radius';
import nativeRadius from '@internal/plugin-radius/alpha';
import { AppGraph, type AppGraphData } from '@radapp.io/rad-components';
import { parseResourceId } from '@radapp.io/rad-components/resourceId';

declare const api: RadiusApi;
void api.listApplications();
void ApplicationListPage;
void radiusPlugin.getId();
void radiusApiRef;
void applicationListPageRouteRef;
const nativeId: string = nativeRadius.pluginId;
void nativeId;
void AppGraph;
const graphWithIcons: AppGraphData = {
  name: 'public-metadata',
  icons: { resource: '<svg />' },
  resources: [
    {
      id: '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/app',
      name: 'app',
      type: 'Applications.Core/containers',
      provider: 'radius',
      provisioningState: 'Succeeded',
      icon: '<svg />',
      iconHash: 'resource',
    },
  ],
};
void graphWithIcons;
const resource = parseResourceId(
  '/planes/radius/local/resourceGroups/demo/providers/Radius.Data/neo4jDatabases/neo4j',
);
const plane: string | undefined = resource?.plane;
void plane;
