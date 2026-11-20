import type { Meta, StoryObj } from '@storybook/react';
import React, { useEffect, useState } from 'react';
import Example from './Example';
import { AppGraphProps } from '../AppGraph';
import multiTier from '../../../__fixtures__/graph/multi-tier.json';
import singleNode from '../../../__fixtures__/graph/single-node.json';

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
  render: function StylesheetRemovedStory() {
    const [removed, setRemoved] = useState(false);
    useEffect(() => {
      const sheets = Array.from(document.styleSheets).filter(sheet =>
        Array.from(sheet.cssRules).some(rule =>
          rule.cssText.includes('.react-flow__controls'),
        ),
      );
      const original = sheets.map(sheet => sheet.disabled);
      sheets.forEach(sheet => {
        sheet.disabled = true;
      });
      setRemoved(sheets.length > 0);
      return () =>
        sheets.forEach((sheet, index) => {
          sheet.disabled = original[index];
        });
    }, []);
    return (
      <>
        <output>
          {removed ? 'Graph stylesheet disabled' : 'Graph stylesheet not found'}
        </output>
        <Example graph={multiTier as AppGraphProps['graph']} />
      </>
    );
  },
};

export const ReplacementHarness: Story = {
  render: function ReplacementHarnessStory() {
    const [replaced, setReplaced] = useState(false);
    const [first] = useState(() => {
      const graph = JSON.parse(
        JSON.stringify(multiTier),
      ) as AppGraphProps['graph'];
      graph.resources.forEach(resource =>
        resource.connections?.forEach(Object.freeze),
      );
      return graph;
    });
    return (
      <>
        <button type="button" onClick={() => setReplaced(true)}>
          Replace graph
        </button>
        <Example graph={replaced ? singleNode : first} />
      </>
    );
  },
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

export const MixedConnections: Story = {
  render: () => {
    const owner = {
      id: '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/containers/owner',
      name: 'owner',
      type: 'Applications.Core/containers',
      provider: 'radius',
      provisioningState: 'Succeeded',
    };
    const storage = {
      id: '/subscriptions/sub/resourceGroups/demo/providers/Microsoft.Storage/storageAccounts/storage',
      name: 'storage',
      type: 'Microsoft.Storage/storageAccounts',
      provider: 'azure',
      provisioningState: 'Succeeded',
    };
    const graph = JSON.parse(
      JSON.stringify({
        name: 'mixed-connections',
        resources: [
          {
            ...owner,
            connections: [null, { ...storage, direction: 'Inbound' }],
          },
          storage,
        ],
      }),
    );
    return <Example graph={graph} />;
  },
};
