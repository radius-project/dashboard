import { parseResourceId } from '@radapp.io/rad-components/resourceId';
import {
  normalizeLiveGraph,
  type GraphContext,
  type GraphResource,
  type LiveGraph,
  type ResourceConnection,
} from '@radius-project/core/graph';

export type Direction = 'Outbound' | 'Inbound';

export interface Connection {
  id: string;
  name: string;
  type: string;
  provider: string;
  direction: Direction;
}

export interface ResourceData {
  id: string;
  name: string;
  type: string;
  provider: string;
  provisioningState: string;
  iconHash?: string;
  resources?: ResourceData[];
  connections?: Connection[];
}

export interface AppGraphData {
  name: string;
  resources: ResourceData[];
  icons?: Record<string, string>;
}

// Radius.Compute/routes replaces Applications.Core/gateways for ingress.
const GATEWAY_TYPES = new Set([
  'applications.core/gateways',
  'radius.compute/routes',
]);

/**
 * Chooses the direction that the shared live graph expects for one legacy
 * connection. The shared graph reads `Outbound` as owner to target and
 * `Inbound` as target to owner. The legacy payload reports `Inbound` on the
 * resource that owns the arrow, so it maps to `Outbound`. Every other legacy
 * connection maps to `Inbound`. A legacy gateway or route target reports the
 * opposite direction, so it also maps to `Inbound`.
 */
const liveDirection = (connection: ResourceConnection) => {
  if (
    connection.direction !== 'Inbound' &&
    connection.direction !== 'Outbound'
  ) {
    return connection.direction;
  }
  const targetType = connection.id
    ? parseResourceId(connection.id)?.type.toLowerCase()
    : undefined;
  const toGateway = targetType !== undefined && GATEWAY_TYPES.has(targetType);
  return connection.direction === 'Inbound' && !toGateway
    ? 'Outbound'
    : 'Inbound';
};

/**
 * Converts a legacy getGraph payload into a shared live graph.
 *
 * The first resource wins when an id repeats, and a resource without an id or
 * type is skipped. The shared graph then reports unresolved connections, bad
 * icons and unreadable ids as warnings instead of dropping them silently.
 */
export function legacyGraphToLive(
  graph: {
    name?: string;
    resources: readonly (GraphResource & {
      provider?: string;
      iconHash?: string | null;
    })[];
    icons?: Record<string, string | null>;
  },
  context: GraphContext,
): LiveGraph {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const resources = [];
  for (const resource of graph.resources) {
    if (!resource.id || !resource.type) {
      continue;
    }
    if (seen.has(resource.id)) {
      duplicates.add(resource.id);
      continue;
    }
    seen.add(resource.id);
    resources.push({
      id: resource.id,
      name: resource.name || parseResourceId(resource.id)?.name || resource.id,
      type: resource.type,
      provider: resource.provider,
      provisioningState: resource.provisioningState,
      iconHash: resource.iconHash,
      connections: (resource.connections ?? []).map(connection =>
        connection === null
          ? null
          : { id: connection.id, direction: liveDirection(connection) },
      ),
    });
  }
  const normalized = normalizeLiveGraph(
    { resources, icons: graph.icons },
    context,
  );
  return {
    ...normalized,
    warnings: [
      ...normalized.warnings,
      ...Array.from(duplicates, resourceId => ({
        code: 'duplicate-resource' as const,
        severity: 'warning' as const,
        resourceId,
        message: `Duplicate resource ignored; first record retained: ${resourceId}`,
      })),
    ],
  };
}
