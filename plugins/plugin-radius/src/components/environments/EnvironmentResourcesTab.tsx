import React from 'react';
import { Resource, EnvironmentProperties } from '../../resources';
import { ResourceTable } from '../resourcetable';

export const EnvironmentResourcesTab = ({
  environment,
}: {
  environment: Resource<EnvironmentProperties>;
}) => {
  return (
    <ResourceTable
      title="Environment Resources"
      filters={{ environment: environment.id }}
    />
  );
};
