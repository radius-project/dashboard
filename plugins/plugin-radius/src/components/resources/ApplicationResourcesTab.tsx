import React from 'react';
import { Box } from '@material-ui/core';
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
      <Box mb={3}>
        <ResourceBreadcrumbs resource={resource} />
      </Box>
      <ResourceTable
        title="Application Resources"
        filters={{ application: resource.id }}
      />
    </>
  );
};
