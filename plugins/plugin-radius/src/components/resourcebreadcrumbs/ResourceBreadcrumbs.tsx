import React from 'react';
import { Resource } from '../../resources';
import { ResourceLink } from '../resourcelink';
import { Breadcrumbs } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

interface ResourceWithEnvApp {
  environment?: string;
  application?: string;
}

export const ResourceBreadcrumbs = (props: { resource: Resource }) => {
  const properties = props.resource.properties as
    | ResourceWithEnvApp
    | undefined;
  return (
    <Breadcrumbs>
      {properties?.environment && <ResourceLink id={properties.environment} />}
      {properties?.application && <ResourceLink id={properties.application} />}
      <Typography>{props.resource.name}</Typography>
    </Breadcrumbs>
  );
};
