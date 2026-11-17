import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import Example from './Example';
import { AppGraphProps } from '../AppGraph';
import multiTier from '../../../__fixtures__/graph/multi-tier.json';

/**
 * Test-only stories. These exist so the browser suite can reach states the
 * product never renders — a stubbed renderer, a graph with its stylesheet
 * suppressed, and a mount/unmount harness. They are excluded from generated
 * documentation because they describe the tests, not the component.
 */
const meta: Meta<typeof Example> = {
  title: 'AppGraph/Harness',
  component: Example,
  tags: ['!autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Example>;

export const StubbedRenderer: Story = {
  render: () => <div>Graph placeholder</div>,
};

export const StylesheetRemoved: Story = {
  args: {
    graph: multiTier,
  } as AppGraphProps,
  decorators: [
    StoryComponent => (
      <>
        <style>
          {
            '.react-flow__node,.react-flow__edge,.react-flow__controls{display:none!important}'
          }
        </style>
        <StoryComponent />
      </>
    ),
  ],
};

export const RemountHarness: Story = {
  render: function RemountHarnessStory() {
    const [mounted, setMounted] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setMounted(value => !value)}>
          {mounted ? 'Unmount graph' : 'Mount graph'}
        </button>
        {mounted && <Example graph={multiTier} />}
      </>
    );
  },
};
