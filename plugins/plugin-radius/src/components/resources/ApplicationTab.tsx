import React from 'react';
import { parseResourceId } from '../../resources';
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
  const { value, loading, error } =
    useAsync(async (): Promise<AppGraphData> => {
      let first = '';
      const clusters = await kubernetesApi.getClusters();
      for (const cluster of clusters) {
        first = cluster.name;
      }

      const response = await kubernetesApi.proxy({
        clusterName: first,
        path: `/apis/api.ucp.dev/v1alpha3/${application}/getGraph?api-version=2023-10-01-preview`,
        init: {
          referrerPolicy: 'no-referrer',
          mode: 'cors',
          cache: 'no-cache',
          method: 'POST',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Request failed: ${response.status}:\n\n ${text}`);
      }

      return (await response.json()) as AppGraphData;
    }, [application]);

  if (loading || !value) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
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
