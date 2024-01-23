import React from 'react';
import { InfoCard, StructuredMetadataTable } from '@backstage/core-components';
import { Box } from '@material-ui/core';
import { Resource, parseResourceId } from '../../resources';
import { ResourceLink } from '../resourcelink/ResourceLink';
import { ResourceBreadcrumbs } from '../resourcebreadcrumbs';

export const OverviewTab = (props: { resource: Resource }) => {
  const metadata: { [key: string]: unknown } = {
    name: props.resource.name,
    type: props.resource.type,
    group: parseResourceId(props.resource.id)?.group,
  };

  if (props.resource.properties?.environment as string) {
    metadata.environment = (
      <ResourceLink id={props.resource.properties?.environment as string} />
    );
  }
  if (props.resource.properties?.application as string) {
    metadata.application = (
      <ResourceLink id={props.resource.properties?.application as string} />
    );
  }

  return (
    <>
      <Box mb={3}>
        <ResourceBreadcrumbs resource={props.resource} />
      </Box>
      <InfoCard title="Resource Overview">
        <StructuredMetadataTable metadata={metadata} />
      </InfoCard>
    </>
  );
};
