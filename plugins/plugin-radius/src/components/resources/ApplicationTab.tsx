import React from 'react';
import { parseResourceId } from '@radapp.io/rad-components';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { AppGraph } from '@radapp.io/rad-components';
import { makeStyles } from '@material-ui/core';
import { radiusApiRef } from '../../plugin';

export interface AppGraphData {
  name: string;
  resources: ResourceData[];
}

export interface ResourceData {
  id: string;
  name: string;
  type: string;
  provider: string;
  provisioningState: string;
  resources?: ResourceData[];
  connections?: Connection[];
}

export interface Connection {
  id: string;
  name: string;
  type: string;
  provider: string;
  direction: Direction;
}

export type Direction = 'Outbound' | 'Inbound';

const useStyles = makeStyles({
  container: {
    height: '500px',
    width: '100%',
  },
});

export const ApplicationTab = ({ application }: { application: string }) => {
  const styles = useStyles();
  const kubernetesApi = useApi(kubernetesApiRef);
  const radiusApi = useApi(radiusApiRef);

  // Extract the resource type from the application id so we can pick the
  // correct api-version for the getGraph call.
  const parsedType = parseResourceId(application)?.type;
  const [namespace, typeName] = parsedType?.split('/') ?? [
    'unknown',
    'unknown',
  ];

  const { value, loading, error } = useAsync(async (): Promise<
    AppGraphData | undefined
  > => {
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

    const response = await kubernetesApi.proxy({
      clusterName: first,
      path: `/apis/api.ucp.dev/v1alpha3/${application}/getGraph?api-version=${apiVersionString}`,
      init: {
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-cache',
        method: 'POST',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status}:\n\n${text}`);
    }

    return (await response.json()) as AppGraphData;
  }, [application]);

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  } else if (!value) {
    return <Progress />;
  }

  return (
    <>
      <InfoCard
        title={`Application Graph: ${parseResourceId(application)?.name}`}
      >
        <div className={styles.container}>
          <AppGraph graph={value!} />
        </div>
      </InfoCard>
    </>
  );
};
