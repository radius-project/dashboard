import React from 'react';
import { Resource } from '../../resources';
import { ResourceTable } from '../resourcetable';

export const ApplicationResourcesTab = ({
  resource,
}: {
  resource: Resource;
}) => {
  return (
    <ResourceTable
      title="Application Resources"
      filters={{ application: resource.id }}
    />
  );
};
