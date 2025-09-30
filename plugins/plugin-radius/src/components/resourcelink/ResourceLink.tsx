import React, { PropsWithChildren } from 'react';
import { Link } from '@backstage/core-components';
import { parseResourceId } from '@radapp.io/rad-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { resourcePageRouteRef, environmentPageRouteRef } from '../../routes';

export const ResourceLink = (props: PropsWithChildren<{ id: string }>) => {
  const parsed = parseResourceId(props.id);
  if (!parsed) {
    throw new Error(`Invalid resource id ${props.id}`);
  }

  const resourceRoute = useRouteRef(resourcePageRouteRef);
  const environmentRoute = useRouteRef(environmentPageRouteRef);
  
  // Route environments to environment page, everything else to resource page
  const isEnvironment = parsed.type === 'Applications.Core/environments';
  const route = isEnvironment ? environmentRoute : resourceRoute;

  return (
    <Link
      to={route({
        group: parsed.group,
        namespace: parsed.type.split('/')[0],
        type: parsed.type.split('/')[1],
        name: parsed.name,
      })}
    >
      {props.children ?? parsed.name}
    </Link>
  );
};

export const OptionalResourceLink = (
  props: PropsWithChildren<{ id?: string }>,
) => {
  if (!props.id) {
    return null;
  }

  return <ResourceLink id={props.id}>{props.children}</ResourceLink>;
};
