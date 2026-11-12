import {
  ApplicationListPage,
  radiusPlugin,
  radiusApiRef,
  applicationListPageRouteRef,
  type RadiusApi,
} from '@internal/plugin-radius';
import nativeRadius from '@internal/plugin-radius/alpha';
import { AppGraph } from '@radapp.io/rad-components';
import { normalizeLegacyLiveGraph } from '@radius-project/core/graph';
import { RadiusGraph } from '@radius-project/graph-react';

declare const api: RadiusApi;
void api.listApplications();
void api.getApplicationGraph?.({ applicationId: 'type-check-only' });
void ApplicationListPage;
void radiusPlugin.getId();
void radiusApiRef;
void applicationListPageRouteRef;
const nativeId: string = nativeRadius.pluginId;
void nativeId;
void AppGraph;
void normalizeLegacyLiveGraph;
void RadiusGraph;
