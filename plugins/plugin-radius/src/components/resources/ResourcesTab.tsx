import React from 'react';
import { Resource } from '../../resources';
import { InfoCard } from '@backstage/core-components';

export const ResourcesTab = (props: { resource: Resource }) => {
  return (
    <InfoCard title="Application Resources">
      <pre>{JSON.stringify(props.resource, null, 2)}</pre>
    </InfoCard>
  );
};
