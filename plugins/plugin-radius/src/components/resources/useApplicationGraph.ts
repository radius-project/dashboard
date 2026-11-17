import { useEffect, useState } from 'react';
import { parseResourceId } from '@radius-project/core/domain';
import { graphContextKey } from '@radius-project/core/graph';
import { RadiusApi, RadiusApplicationGraph } from '../../api';

interface GraphRequestState {
  api: RadiusApi;
  application: string;
  loading: boolean;
  value?: RadiusApplicationGraph;
  error?: Error;
}

export function useApplicationGraph(
  api: RadiusApi,
  application: string,
): GraphRequestState {
  const [state, setState] = useState<GraphRequestState>({
    api,
    application,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      finish({
        loading: false,
        error: new Error(
          'The application graph request timed out. The backend may not support getGraph for this resource type.',
        ),
      });
      controller.abort();
    }, 10000);

    function finish(
      result: Pick<GraphRequestState, 'loading' | 'value' | 'error'>,
    ) {
      if (!active) {
        return;
      }
      active = false;
      clearTimeout(timeout);
      setState({ api, application, ...result });
    }

    setState({ api, application, loading: true });

    async function load() {
      try {
        if (!api.getApplicationGraph) {
          throw new Error(
            'This Radius API does not support application graphs. The host must provide getApplicationGraph.',
          );
        }
        const plane = parseResourceId(application)?.plane;
        if (!plane) {
          throw new Error(
            'The application graph requires a valid UCP application ID.',
          );
        }
        const result = await api.getApplicationGraph({
          applicationId: application,
          signal: controller.signal,
        });
        if (!active) {
          return;
        }
        const context = {
          connectionId: result.context.connectionId,
          plane: { ...result.context.plane },
          applicationId: result.context.applicationId,
        };
        if (
          graphContextKey(context) !==
          graphContextKey({ ...context, plane, applicationId: application })
        ) {
          throw new Error(
            'The application graph response does not match the requested application and plane.',
          );
        }
        finish({ loading: false, value: { graph: result.graph, context } });
      } catch (error) {
        finish({
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
    void load();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [api, application]);

  // Hide old data on the render that precedes the replacement request's effect.
  return state.api === api && state.application === application
    ? state
    : { api, application, loading: true };
}
