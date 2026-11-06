import React from 'react';
import { Resource } from '../../graph';
import { Handle, NodeProps, Position } from 'reactflow';

//  Note: the default style assigned to a node gives it a 150px width
// from style: .react-flow__node-default.

export interface ResourceNodeData extends Resource {
  icon?: string | null;
}

export type ResourceNodeProps = Pick<NodeProps<ResourceNodeData>, 'data'>;

export interface ResourceNodeSemantics {
  label: string;
  type: string;
  icon: string | null;
  statusBadge: {
    kind: string;
    accessibleName: string;
  } | null;
}

/**
 * Internal seam for graph records. Icons use the API hash when SVG bytes are
 * available; status badges remain unpopulated (#89).
 */
export const getResourceNodeSemantics = (
  resource: ResourceNodeData,
): ResourceNodeSemantics => ({
  label: resource.name,
  type: resource.type,
  icon: resource.icon ? (resource.iconHash ?? null) : null,
  statusBadge: null,
});

function ResourceNode(props: ResourceNodeProps) {
  const semantics = getResourceNodeSemantics(props.data);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '2px', fontSize: '.6rem' }}>
        {props.data.icon && (
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(props.data.icon)}`}
            alt=""
            width={32}
            height={32}
            style={{ display: 'block', margin: '0 auto' }}
          />
        )}
        <h3 style={{ textAlign: 'center' }}>{semantics.label}</h3>
        <hr />
        <h6>{semantics.type}</h6>
        {semantics.statusBadge && (
          <span aria-label={semantics.statusBadge.accessibleName}>
            {semantics.statusBadge.kind}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export default ResourceNode;
