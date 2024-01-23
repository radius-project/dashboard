import React from 'react';
import { Resource } from '../../resources';
import { ResourceLink } from '../resourcelink';
import { Breadcrumbs } from '@backstage/core-components';
import { Typography } from '@material-ui/core';

export const ResourceBreadcrumbs = (props: { resource: Resource }) => {
  const breadcrumbs = [];

  if (props.resource.properties?.environment as string) {
    breadcrumbs.push(
      <ResourceLink id={props.resource.properties?.environment as string} />,
    );
  }
  if (props.resource.properties?.application as string) {
    breadcrumbs.push(
      <ResourceLink id={props.resource.properties?.application as string} />,
    );
  }

  return (
    <Breadcrumbs>
      {breadcrumbs.map((breadcrumb, index) => (
        <div key={index}>{breadcrumb}</div>
      ))}
      <Typography>{props.resource.name}</Typography>
    </Breadcrumbs>
  );
};
