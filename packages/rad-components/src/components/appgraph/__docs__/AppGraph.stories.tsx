import type { Meta, StoryObj } from '@storybook/react';
import Example from './Example';
import * as sampledata from '../../../sampledata';
import { AppGraphProps } from '../AppGraph';

const meta: Meta<typeof Example> = {
  title: 'AppGraph',
  component: Example,
};

export default meta;
type Story = StoryObj<typeof Example>;

export const Demo: Story = {
  args: {
    graph: sampledata.DemoApplication,
  } as AppGraphProps,
};
