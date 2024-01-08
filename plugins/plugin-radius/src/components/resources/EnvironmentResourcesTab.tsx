import React from 'react';
import { Resource } from '../../resources';
import { ResourceTable } from '../resourcetable';

export const EnvironmentResourcesTab = ({
  resource,
}: {
  resource: Resource;
}) => {
  return (
    <ResourceTable
      title="Environment Resources"
      filters={{ environment: resource.id }}
    />
  );
};
