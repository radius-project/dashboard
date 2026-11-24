import React, { PropsWithChildren } from 'react';
import { Link } from '@backstage/core-components';
import { parseResourceId } from '@radapp.io/rad-components/resourceId';
import { useResourceRoute } from './useResourceRoute';

export const ResourceLink = (props: PropsWithChildren<{ id: string }>) => {
  const route = useResourceRoute();
  const parsed = parseResourceId(props.id);
  if (!parsed) {
    return (
      <span
        role="note"
        aria-label={`Invalid resource ID; link unavailable: ${props.id || '(empty)'}`}
      >
        {props.children ?? (props.id || 'Invalid resource ID')}
      </span>
    );
  }

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
