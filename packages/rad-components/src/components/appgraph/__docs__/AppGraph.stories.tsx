import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import Example from './Example';
import { AppGraphProps } from '../AppGraph';
import empty from '../../../__fixtures__/graph/empty.json';
import singleNode from '../../../__fixtures__/graph/single-node.json';
import containerToDatabase from '../../../__fixtures__/graph/container-to-database.json';
import multiTier from '../../../__fixtures__/graph/multi-tier.json';
import deployStatusMatrix from '../../../__fixtures__/graph/deploy-status-matrix.json';
import bothNamespaces from '../../../__fixtures__/graph/both-namespaces.json';

const meta: Meta<typeof Example> = {
  title: 'AppGraph',
  component: Example,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Example>;

export const Empty: Story = {
  args: {
    graph: empty,
  } as AppGraphProps,
};

export const SingleNode: Story = {
  args: {
    graph: singleNode,
  } as AppGraphProps,
};

export const ContainerToDatabase: Story = {
  args: {
    graph: containerToDatabase,
  } as AppGraphProps,
};

export const MultiTier: Story = {
  args: {
    graph: multiTier,
  } as AppGraphProps,
};

export const Demo = MultiTier;

export const DeployStatusMatrix: Story = {
  args: {
    graph: deployStatusMatrix,
  } as AppGraphProps,
};

export const BothNamespaces: Story = {
  args: {
    graph: bothNamespaces,
  } as AppGraphProps,
};

export const Dark: Story = {
  args: {
    graph: multiTier,
  } as AppGraphProps,
  decorators: [
    StoryComponent => (
      <div
        data-theme="dark"
        style={{ colorScheme: 'dark', background: '#121212', padding: 16 }}
      >
        <StoryComponent />
      </div>
    ),
  ],
};
