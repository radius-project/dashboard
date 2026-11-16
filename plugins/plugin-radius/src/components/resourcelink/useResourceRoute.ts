import { useCallback } from 'react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { parseLegacyResourceId } from '@radius-project/core/domain';
import { environmentPageRouteRef, resourcePageRouteRef } from '../../routes';
import { isEnvironmentType } from '../../resources';
import { scopeConnectionLink, useRadiusConnection } from '../../connection';

export const useResourceRoute = () => {
  const resourceRoute = useRouteRef(resourcePageRouteRef);
  const environmentRoute = useRouteRef(environmentPageRouteRef);
  const connection = useRadiusConnection();

  return useCallback(
    (id: string, tab?: string) => {
      const parsed = parseLegacyResourceId(id);
      if (!parsed) {
        throw new Error(`Invalid resource id ${id}`);
      }
      const route = isEnvironmentType(parsed.type)
        ? environmentRoute
        : resourceRoute;
      return scopeConnectionLink(
        `${route({
          group: parsed.group,
          namespace: parsed.type.split('/')[0],
          type: parsed.type.split('/')[1],
          name: parsed.name,
        })}${tab ? `/${tab}` : ''}`,
        connection,
      );
    },
    [resourceRoute, environmentRoute, connection],
  );
};
