import type { ConfigApi } from '@backstage/core-plugin-api';
import type { RadiusQueryContext } from '@radius-project/core/domain';

export type RadiusConnection = RadiusQueryContext;

export const connectionKey = (context: RadiusConnection) =>
  JSON.stringify([
    context.connectionId,
    context.plane.type,
    context.plane.name,
  ]);

export interface RadiusConnectionState {
  readonly connections: readonly RadiusConnection[];
  readonly selected?: RadiusConnection;
  readonly selectionKey?: string;
  readonly loaded: boolean;
  readonly error?: Error;
}

export interface RadiusConnections {
  getSnapshot(): RadiusConnectionState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  select(key: string): void;
}

export function configuredConnections(
  config: ConfigApi,
): RadiusConnection[] | undefined {
  return config.getOptionalConfigArray('radius.connections')?.map(item => ({
    connectionId: item.getString('clusterName'),
    plane: {
      type: item.getString('plane.type'),
      name: item.getString('plane.name'),
    },
  }));
}

export class RadiusConnectionStore implements RadiusConnections {
  private state: RadiusConnectionState = { connections: [], loaded: false };
  private readonly listeners = new Set<() => void>();
  private pending?: Promise<void>;

  constructor(
    private readonly discover: () => Promise<readonly RadiusConnection[]>,
    private readonly invalidate: () => void,
  ) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(state: RadiusConnectionState) {
    if (
      JSON.stringify(this.state.selected) !== JSON.stringify(state.selected) ||
      this.state.error?.message !== state.error?.message
    ) {
      this.invalidate();
    }
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  select = (selectionKey: string) => {
    const selected = this.state.connections.find(
      c => connectionKey(c) === selectionKey,
    );
    this.update({
      ...this.state,
      selectionKey,
      selected,
      error: selected
        ? undefined
        : new Error(
            'The selected Radius connection is not available. Select another connection or ask your administrator to restore it.',
          ),
    });
  };

  refresh = (): Promise<void> => {
    if (!this.pending) {
      this.pending = this.discover()
        .then(
          connections => {
            const selectionKey = this.state.selectionKey;
            let selected =
              connections.length === 1 ? connections[0] : undefined;
            if (selectionKey) {
              selected = connections.find(
                c => connectionKey(c) === selectionKey,
              );
            }
            let error: Error | undefined;
            if (!connections.length) {
              error = new Error(
                'No Radius connections are available. Ask your administrator to configure a Kubernetes cluster and Radius plane, then refresh connections.',
              );
            } else if (selectionKey && !selected) {
              error = new Error(
                'The selected Radius connection was removed. Select another connection or ask your administrator to restore it.',
              );
            }
            this.update({
              loaded: true,
              connections,
              selected,
              selectionKey: selected ? connectionKey(selected) : selectionKey,
              error,
            });
          },
          error => {
            this.update({
              ...this.state,
              loaded: true,
              selected: undefined,
              error: new Error(
                `Could not load Radius connections. Refresh connections or check your host access. ${error instanceof Error ? error.message : String(error)}`,
              ),
            });
          },
        )
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  };
}
