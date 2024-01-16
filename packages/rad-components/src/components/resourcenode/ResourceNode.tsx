import React from 'react';
import { Resource } from '../../graph';
import { Handle, NodeProps, Position } from 'reactflow';

//  Note: the default style assigned to a node gives it a 150px width
// from style: .react-flow__node-default.

export type ResourceNodeProps = Pick<NodeProps<Resource>, 'data'>;

function ResourceNode(props: ResourceNodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div style={{ padding: '2px', fontSize: '.6rem' }}>
        <h3 style={{ textAlign: 'center' }}>{props.data.name}</h3>
        <hr />
        <h6>{props.data.type}</h6>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export default ResourceNode;
