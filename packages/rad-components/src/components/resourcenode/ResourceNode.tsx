import React from 'react';
import { Resource } from '../../graph';
import { Handle, NodeProps, Position, NodeToolbar } from 'reactflow';
import { parseResourceId } from '@radapp.io/rad-components';

//  Note: the default style assigned to a node gives it a 150px width
// from style: .react-flow__node-default.

export type ResourceNodeProps = Pick<NodeProps<Resource>, 'data'>;

function ResourceNode(props: ResourceNodeProps) {
  const group = parseResourceId(props.data.id)?.group;

  return (
    <>
      <NodeToolbar position={Position.Left} align={'center'}>
        <div
          style={{ padding: '4px', backgroundColor: 'grey', fontSize: '.6rem' }}
        >
          <p style={{ textAlign: 'left' }}>Name: {props.data.name}</p>
          <p style={{ textAlign: 'left' }}>Type: {props.data.type}</p>
          <p style={{ textAlign: 'left' }}>Group: {group}</p>
        </div>
      </NodeToolbar>

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

export default React.memo(ResourceNode);
