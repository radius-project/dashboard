import React from 'react';
import { useNavigate } from 'react-router-dom';
import { parseResourceId } from '@radapp.io/rad-components';
import type { LiveGraph } from '@radius-project/core/graph';
import { RadiusGraph } from '@radius-project/graph-react';
import '@radius-project/graph-react/styles.css';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { makeStyles, useTheme } from '@material-ui/core';
import { radiusApiRef } from '../../api/ref';
import { useResourceRoute } from '../resourcelink/useResourceRoute';
import { AppGraphData, legacyGraphToLive } from './legacyGraph';

export type {
  AppGraphData,
  Connection,
  Direction,
  ResourceData,
} from './legacyGraph';

const graphOptions = { showLegend: true, enablePopup: true };

// The API returns icons for Radius.Core applications from 2025-08-01 onward.
const supportsIcons = (type: string | undefined, apiVersion: string) =>
  type?.toLowerCase() === 'radius.core/applications' &&
  /^\d{4}-\d{2}-\d{2}(-preview)?$/.test(apiVersion) &&
  apiVersion.slice(0, 10) >= '2025-08-01';

const useStyles = makeStyles({
  container: {
    height: '500px',
    width: '100%',
  },
});

export const ApplicationTab = ({ application }: { application: string }) => {
  const styles = useStyles();
  const theme = useTheme();
  const navigate = useNavigate();
  const resourceRoute = useResourceRoute();
  const kubernetesApi = useApi(kubernetesApiRef);
  const radiusApi = useApi(radiusApiRef);
  const errorApi = useApi(errorApiRef);

  // Extract the resource type from the application id so we can pick the
  // correct api-version for the getGraph call.
  const parsedId = parseResourceId(application);
  const parsedType = parsedId?.type;
  const [namespace, typeName] = parsedType?.split('/') ?? [
    'unknown',
    'unknown',
  ];

  const {
    value: graph,
    loading,
    error,
  } = useAsync(async (): Promise<LiveGraph> => {
    let first = '';
    const clusters = await kubernetesApi.getClusters();
    for (const cluster of clusters) {
      first = cluster.name;
    }

    // Resolve the supported api-version dynamically; fall back to the
    // legacy hardcoded value if the lookup fails.
    let apiVersionString = '2023-10-01-preview';
    if (namespace && typeName) {
      try {
        const typeInfo = await radiusApi.getResourceType({
          namespace,
          typeName,
        });
        if (typeInfo.APIVersionList && typeInfo.APIVersionList.length > 0) {
          apiVersionString = typeInfo.APIVersionList[0];
        }
      } catch {
        // Fall back to the default api-version on lookup failure.
      }
    }

    // Use an AbortController with a timeout so the request fails
    // gracefully instead of spinning indefinitely when the backend does
    // not support getGraph for this resource type.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await kubernetesApi.proxy({
        clusterName: first,
        path: `/apis/api.ucp.dev/v1alpha3/${application}/getGraph?api-version=${apiVersionString}`,
        init: {
          referrerPolicy: 'no-referrer',
          mode: 'cors',
          cache: 'no-cache',
          method: 'POST',
          ...(supportsIcons(parsedType, apiVersionString)
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ includeIcons: true }),
              }
            : {}),
          signal: controller.signal,
        },
      });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error(
          'The application graph request timed out. The backend may not support getGraph for this resource type.',
        );
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}:\n\n${text}`);
    }

    return legacyGraphToLive((await response.json()) as AppGraphData, {
      connectionId: first,
      plane: { type: 'radius', name: parsedId?.plane ?? '' },
      applicationId: application,
    });
  }, [application]);

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  } else if (!graph) {
    return <Progress />;
  }

  return (
    <>
      <InfoCard
        title={`Application Graph: ${parseResourceId(application)?.name}`}
      >
        <div className={styles.container}>
          <RadiusGraph
            graph={graph}
            options={graphOptions}
            theme={{ colorScheme: theme.palette.type }}
            callbacks={{
              onNavigate: node => {
                // The renderer falls back to the name when a resource has no id.
                if (parseResourceId(node.id)) {
                  navigate(`${resourceRoute(node.id)}/overview`);
                } else {
                  errorApi.post(
                    new Error(
                      `Cannot open "${node.id}": not a valid resource id.`,
                    ),
                  );
                }
              },
            }}
          />
        </div>
      </InfoCard>
    </>
  );
};
