import {
  ApplicationListPage,
  radiusPlugin,
  radiusApiRef,
  applicationListPageRouteRef,
  type RadiusApi,
} from '@internal/plugin-radius';
import nativeRadius from '@internal/plugin-radius/alpha';
import { AppGraph } from '@radapp.io/rad-components';
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
const resource = parseResourceId(
  '/planes/radius/local/resourceGroups/demo/providers/Radius.Data/neo4jDatabases/neo4j',
);
const plane: string | undefined = resource?.plane;
void plane;
