import React from 'react';
import { Resource, parseResourceId } from '../../resources';
import { InfoCard, StructuredMetadataTable } from '@backstage/core-components';
import { OptionalResourceLink } from '../resourcelink/ResourceLink';

export const OverviewTab = (props: { resource: Resource }) => {
  const metadata = {
    name: props.resource.name,
    type: props.resource.type,
    group: parseResourceId(props.resource.id)?.group,
    application: (
      <OptionalResourceLink
        id={props.resource.properties?.application as string}
      />
    ),
    environment: (
      <OptionalResourceLink
        id={props.resource.properties?.environment as string}
      />
    ),
  };
  return (
    <InfoCard title="Resource Overview">
      <StructuredMetadataTable metadata={metadata} />
    </InfoCard>
  );
};
