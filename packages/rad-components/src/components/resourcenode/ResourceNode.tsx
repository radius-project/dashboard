import React, { PropsWithChildren } from 'react';
import { Resource } from '../../graph';

export interface ResourceNodeProps {
  data: Resource;
}

function ResourceNode(props: PropsWithChildren<ResourceNodeProps>) {
  return (
    <div
      className="resource-node"
      style={{ border: '1px solid', padding: '5px' }}
    >
      <h3 style={{ textAlign: 'center' }}>{props.data.name}</h3>
      <hr />
      <h5>{props.data.type}</h5>
      <h6>asdsfdsdfafdfdff</h6>
    </div>
  );
}

export default ResourceNode;
