import React, { PropsWithChildren } from 'react';
import { Link } from '@backstage/core-components';
import { parseLegacyResourceId as parseResourceId } from '@radius-project/core/domain';
import { useResourceRoute } from './useResourceRoute';

export const ResourceLink = (props: PropsWithChildren<{ id: string }>) => {
  const parsed = parseResourceId(props.id);
  if (!parsed) {
    throw new Error(`Invalid resource id ${props.id}`);
  }

  const route = useResourceRoute();

  return <Link to={route(props.id)}>{props.children ?? parsed.name}</Link>;
};

export const OptionalResourceLink = (
  props: PropsWithChildren<{ id?: string }>,
) => {
  if (!props.id) {
    return null;
  }

  return <ResourceLink id={props.id}>{props.children}</ResourceLink>;
};
