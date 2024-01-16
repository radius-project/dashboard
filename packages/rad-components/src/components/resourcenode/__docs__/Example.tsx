import React, { FC } from 'react';
import ResourceNode, { ResourceNodeProps } from '../ResourceNode';
import * as sampledata from '../../../sampledata';
import { ReactFlowProvider } from 'reactflow';

const Example: FC<ResourceNodeProps> = ({
  data = sampledata.ContainerResource,
}) => {
  return (
    <ReactFlowProvider>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <ResourceNode data={data} />
      </div>
    </ReactFlowProvider>
  );
};

export default Example;
