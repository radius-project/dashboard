import React from 'react';
import { Resource } from '../../resources';
import { ResourceTable } from '../resourcetable';
import { ResourceBreadcrumbs } from '../resourcebreadcrumbs';

export const ApplicationResourcesTab = ({
  resource,
}: {
  resource: Resource;
}) => {
  return (
    <>
      <ResourceBreadcrumbs resource={resource} />
      <ResourceTable
        title="Application Resources"
        filters={{ application: resource.id }}
      />
    </>
  );
};
