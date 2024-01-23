import React from 'react';
import { Resource } from '../../resources';
import { ResourceLink } from '../resourcelink';
import { Breadcrumbs } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

export const ResourceBreadcrumbs = (props: { resource: Resource }) => {
  return (
    <Breadcrumbs>
      {props.resource.properties?.environment && (
        <ResourceLink id={props.resource.properties?.environment as string} />
      )}
      {props.resource.properties?.application && (
        <ResourceLink id={props.resource.properties?.application as string} />
      )}
      <Typography>{props.resource.name}</Typography>
    </Breadcrumbs>
  );
};
