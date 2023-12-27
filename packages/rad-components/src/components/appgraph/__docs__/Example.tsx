import React, { FC } from 'react';
import AppGraph, { AppGraphProps } from '../AppGraph';
import * as sampledata from '../../../sampledata';

const Example: FC<AppGraphProps> = ({ graph = sampledata.DemoApplication }) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        height: '100%',
        minHeight: '500px',
      }}
    >
      <AppGraph graph={graph} />
    </div>
  );
};

export default Example;
