import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { Resource, EnvironmentProperties } from '../../resources';

export const EnvironmentDetailsTab = (props: {
  environment: Resource<EnvironmentProperties>;
}) => {
  return (
    <InfoCard title="Environment Data">
      <pre>{JSON.stringify(props.environment, null, 2)}</pre>
    </InfoCard>
  );
};
