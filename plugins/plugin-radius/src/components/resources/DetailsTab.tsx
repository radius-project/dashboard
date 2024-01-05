import React from 'react';
import { Resource } from '../../resources';
import { InfoCard } from '@backstage/core-components';

export const DetailsTab = (props: { resource: Resource }) => {
  return (
    <InfoCard title="Resource Data">
      <pre>{JSON.stringify(props.resource, null, 2)}</pre>
    </InfoCard>
  );
};
