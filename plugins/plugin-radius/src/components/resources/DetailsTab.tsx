import React from 'react';
import { Box } from '@material-ui/core';
import { InfoCard } from '@backstage/core-components';
import { Resource } from '../../resources';
import { ResourceBreadcrumbs } from '../resourcebreadcrumbs';

export const DetailsTab = (props: { resource: Resource }) => {
  return (
    <>
      <Box mb={3}>
        <ResourceBreadcrumbs resource={props.resource} />
      </Box>
      <InfoCard title="Resource Data">
        <pre>{JSON.stringify(props.resource, null, 2)}</pre>
      </InfoCard>
    </>
  );
};
