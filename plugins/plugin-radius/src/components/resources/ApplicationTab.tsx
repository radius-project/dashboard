import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseResourceId } from '@radapp.io/rad-components/resourceId';
import type { LiveGraph } from '@radius-project/core/graph';
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
import { useResourceRoute } from '../resourcelink/useResourceRoute';
import { legacyGraphToLive } from './legacyGraph';
import { useApplicationGraph } from './useApplicationGraph';

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
  const [failedIcons, setFailedIcons] = useState<Record<string, string>>({});
  const normalized = useMemo(() => {
    if (!value) {
      return {};
    }
    try {
      return { graph: legacyGraphToLive(value.graph, value.context) };
    } catch (failure) {
      return {
        error: failure instanceof Error ? failure : new Error(String(failure)),
      };
    }
  }, [value]);
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (const resource of normalized.graph?.resources ?? []) {
      const { icon } = resource;
      if (!icon) {
        continue;
      }
      const image = new Image();
      image.onerror = () => {
        setFailedIcons(previous => ({ ...previous, [resource.id]: icon }));
      };
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`;
      images.push(image);
    }
    return () => {
      for (const image of images) {
        image.onerror = null;
        image.removeAttribute('src');
      }
    };
  }, [normalized.graph]);
  const graph = useMemo<LiveGraph | undefined>(() => {
    if (!normalized.graph) {
      return undefined;
    }
    const failed = normalized.graph.resources.filter(
      resource => resource.icon && failedIcons[resource.id] === resource.icon,
    );
    if (!failed.length) {
      return normalized.graph;
    }
    const failedIds = new Set(failed.map(resource => resource.id));
    return {
      ...normalized.graph,
      resources: normalized.graph.resources.map(resource => {
        if (!failedIds.has(resource.id)) {
          return resource;
        }
        const { icon: _icon, ...fallback } = resource;
        return fallback;
      }),
      warnings: [
        ...normalized.graph.warnings,
        ...failed.map(resource => ({
          code: 'invalid-icon' as const,
          severity: 'warning' as const,
          resourceId: resource.id,
          message: `Unreadable resource icon ignored: ${resource.id}`,
        })),
      ],
    };
  }, [normalized.graph, failedIcons]);
  const failure = error ?? normalized.error;

  if (loading) {
    return <Progress />;
  } else if (failure) {
    return <ResponseErrorPanel error={failure} />;
  } else if (!graph) {
    return <Progress />;
  }

  return (
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
  );
};
