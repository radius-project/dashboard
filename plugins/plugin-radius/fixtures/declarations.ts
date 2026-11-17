import {
  ApplicationListPage,
  radiusPlugin,
  radiusApiRef,
  applicationListPageRouteRef,
  type RadiusApi,
} from '@internal/plugin-radius';
import nativeRadius from '@internal/plugin-radius/alpha';
import { AppGraph } from '@radapp.io/rad-components';

declare const api: RadiusApi;
void api.listApplications();
void ApplicationListPage;
void radiusPlugin.getId();
void radiusApiRef;
void applicationListPageRouteRef;
const nativeId: string = nativeRadius.pluginId;
void nativeId;
void AppGraph;
