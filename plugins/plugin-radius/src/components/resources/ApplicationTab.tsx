import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseLegacyResourceId } from '@radius-project/core/domain';
import { normalizeLegacyLiveGraph } from '@radius-project/core/graph';
import { RadiusGraph } from '@radius-project/graph-react';
import '@radius-project/graph-react/styles.css';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles, useTheme } from '@material-ui/core';
import { radiusApiRef } from '../../api/ref';
import { useApplicationGraph } from './useApplicationGraph';
import { useResourceRoute } from '../resourcelink/useResourceRoute';

const graphOptions = { showLegend: true, enablePopup: true };

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
  const radiusApi = useApi(radiusApiRef);
  const errorApi = useApi(errorApiRef);
  const { value, loading, error } = useApplicationGraph(radiusApi, application);
  const normalized = useMemo(() => {
    if (!value) {
      return {};
    }
    try {
      return {
        graph: normalizeLegacyLiveGraph(value.graph, value.context),
      };
    } catch (failure) {
      return {
        error: failure instanceof Error ? failure : new Error(String(failure)),
      };
    }
  }, [value]);
  const failure = error ?? normalized.error;

  if (loading) {
    return <Progress />;
  } else if (failure) {
    return <ResponseErrorPanel error={failure} />;
  } else if (!normalized.graph) {
    return <Progress />;
  }

  return (
    <>
      <InfoCard
        title={`Application Graph: ${parseLegacyResourceId(application)?.name}`}
      >
        <div className={styles.container}>
          <RadiusGraph
            graph={normalized.graph}
            options={graphOptions}
            theme={{ colorScheme: theme.palette.type }}
            callbacks={{
              onNavigate: node => {
                // The renderer falls back to the name when a resource has no id.
                if (parseLegacyResourceId(node.id)) {
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
