import React from 'react';
import { Resource } from '../../resources';
import { InfoCard } from '@backstage/core-components';
import { ResourceBreadcrumbs } from '../resourcebreadcrumbs';

export const DetailsTab = (props: { resource: Resource }) => {
  return (
    <>
      <ResourceBreadcrumbs resource={props.resource} />
      <InfoCard title="Resource Data">
        <pre>{JSON.stringify(props.resource, null, 2)}</pre>
      </InfoCard>
    </>
  );
};
