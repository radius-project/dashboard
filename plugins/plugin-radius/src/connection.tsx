import React, {
  ComponentType,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useSyncExternalStore,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { radiusApiRef } from './api/ref';
import {
  connectionKey,
  RadiusConnection,
  RadiusConnections,
} from './api/connections';
import { withRadiusTheme } from './appearance';

const parameter = 'radiusConnection';
const ConnectionContext = createContext<RadiusConnection | undefined>(
  undefined,
);

export const useRadiusConnection = () => useContext(ConnectionContext);

export function scopeConnectionLink(
  path: string,
  connection?: RadiusConnection,
): string {
  if (!connection) return path;
  const hashIndex = path.indexOf('#');
  const hash = hashIndex < 0 ? '' : path.slice(hashIndex);
  const withoutHash = hashIndex < 0 ? path : path.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  const pathname =
    queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex);
  const search = queryIndex < 0 ? '' : withoutHash.slice(queryIndex + 1);
  const query = new URLSearchParams(search);
  query.set(parameter, connectionKey(connection));
  return `${pathname}?${query}${hash}`;
}

export function useConnectionLink() {
  const connection = useRadiusConnection();
  return (path: string) => scopeConnectionLink(path, connection);
}

function SelectedConnection({
  connections,
  children,
}: React.PropsWithChildren<{ connections: RadiusConnections }>) {
  const subscribe = useCallback(
    (listener: () => void) => connections.subscribe(listener),
    [connections],
  );
  const getSnapshot = useCallback(
    () => connections.getSnapshot(),
    [connections],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const location = useLocation();
  const labelId = useId();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get(parameter);
  const selectedKey = state.selected && connectionKey(state.selected);

  useEffect(() => {
    if (requested && requested !== connections.getSnapshot().selectionKey) {
      connections.select(requested);
    }
    void connections.refresh();
    const refresh = () => {
      void connections.refresh();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [connections, requested]);

  useEffect(() => {
    if (!requested && state.selected) {
      navigate(
        scopeConnectionLink(
          `${location.pathname}${location.search}${location.hash}`,
          state.selected,
        ),
        { replace: true },
      );
    }
  }, [requested, state.selected, location, navigate]);

  const select = (key: string) => {
    const query = new URLSearchParams(location.search);
    query.set(parameter, key);
    connections.select(key);
    navigate({ ...location, search: `?${query}` });
  };

  const ready =
    state.loaded && state.selected && (!requested || requested === selectedKey);
  return (
    <>
      <Box p={2}>
        <FormControl fullWidth>
          <InputLabel id={labelId}>Radius connection</InputLabel>
          <Select
            labelId={labelId}
            value={selectedKey ?? ''}
            onChange={event => select(event.target.value as string)}
          >
            {state.connections.map(connection => (
              <MenuItem
                key={connectionKey(connection)}
                value={connectionKey(connection)}
              >
                {connection.connectionId} / {connection.plane.type}/
                {connection.plane.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          onClick={() => {
            void connections.refresh();
          }}
        >
          Refresh connections
        </Button>
        {state.loaded && state.error && (
          <ResponseErrorPanel error={state.error} />
        )}
        {state.loaded && !state.error && !state.selected && (
          <Typography role="status">
            Select a Radius connection to load resources.
          </Typography>
        )}
      </Box>
      {!state.loaded && <Progress />}
      {ready && (
        <ConnectionContext.Provider value={state.selected}>
          <React.Fragment key={selectedKey}>{children}</React.Fragment>
        </ConnectionContext.Provider>
      )}
    </>
  );
}

export const withRadiusConnection = (Component: ComponentType) => {
  return function RadiusConnectedView() {
    const api = useApi(radiusApiRef);
    return api.connections ? (
      <SelectedConnection connections={api.connections}>
        <Component />
      </SelectedConnection>
    ) : (
      <Component />
    );
  };
};

export const withRadiusPage = (Component: ComponentType) =>
  withRadiusTheme(withRadiusConnection(Component));
