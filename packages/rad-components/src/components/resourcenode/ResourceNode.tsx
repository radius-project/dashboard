import React from 'react';
import { Resource } from '../../graph';
import { Handle, NodeProps, Position } from 'reactflow';

//  Note: the default style assigned to a node gives it a 150px width
// from style: .react-flow__node-default.

export type ResourceNodeProps = Pick<NodeProps<Resource>, 'data'>;

export interface ResourceNodeSemantics {
  label: string;
  type: string;
  icon: string | null;
  statusBadge: {
    kind: string;
    accessibleName: string;
  } | null;
}

export const getResourceNodeSemantics = (
  resource: Resource,
): ResourceNodeSemantics => ({
  label: resource.name,
  type: resource.type,
  icon: null,
  statusBadge: null,
});

function ResourceNode(props: ResourceNodeProps) {
  const semantics = getResourceNodeSemantics(props.data);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '2px', fontSize: '.6rem' }}>
        {semantics.icon && <span aria-hidden="true">{semantics.icon}</span>}
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
