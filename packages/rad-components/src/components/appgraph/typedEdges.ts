import { Edge, MarkerType } from 'reactflow';
import { AppGraph, ConnectionKind } from '../../graph';

export function getTypedEdges(graph: AppGraph): Edge[] {
  const relationships = new Map<
    string,
    { source: string; target: string; kind: ConnectionKind }
  >();

  for (const resource of graph.resources) {
    for (const connection of resource.connections ?? []) {
      if (!connection.kind) {
        continue;
      }

      // Keep the existing dependency-to-dependent layout. The API reports
      // each relationship on both endpoints; these entries describe one edge.
      const source =
        connection.direction === 'Outbound' ? connection.id : resource.id;
      const target =
        connection.direction === 'Outbound' ? resource.id : connection.id;
      const key = JSON.stringify([source, target]);
      if (relationships.get(key)?.kind !== 'Connection') {
        relationships.set(key, { source, target, kind: connection.kind });
      }
    }
  }

  return [...relationships.entries()].map(([id, relationship]) => ({
    id,
    source: relationship.source,
    target: relationship.target,
    label: relationship.kind,
    ariaLabel: `${relationship.kind}: ${relationship.source} to ${relationship.target}`,
    data: { kind: relationship.kind },
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed },
    style:
      relationship.kind === 'Dependency'
        ? { strokeDasharray: '5 5' }
        : undefined,
  }));
}
