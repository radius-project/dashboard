import type { Meta, StoryObj } from '@storybook/react';
import Example from './Example';
import * as sampledata from '../../../sampledata';

const meta: Meta<typeof Example> = {
  title: 'ResourceNode',
  component: Example,
};

export default meta;
type Story = StoryObj<typeof Example>;

export const Container: Story = {
  args: {
    data: sampledata.ContainerResource,
  },
};
