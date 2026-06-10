import { AppGraph, Resource } from './graph';

export const DemoApplication: AppGraph = {
  name: 'demo',
  resources: [
    {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/containers/webapp',
      name: 'webapp',
      type: 'Applications.Core/container',
      provider: 'radius',
      provisioningState: 'Succeeded',
      connections: [
        {
          id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Datastores/redisCaches/db',
          name: 'db',
          type: 'Applications.Datastores/redisCaches',
          provider: 'radius',
          direction: 'Outbound',
        },
      ],
    },
    {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Datastores/redisCaches/db',
      name: 'db',
      type: 'Applications.Datastores/redisCaches',
      provider: 'radius',
      provisioningState: 'Succeeded',
    },
  ],
};

// PropertyRefApplication demonstrates resources linked via a property reference
// (e.g. `secretName: dbsecret`) rather than an explicit connection.
export const PropertyRefApplication: AppGraph = {
  name: 'myapp',
  resources: [
    {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Data/postgreSqlDatabases/postgresql',
      name: 'postgresql',
      type: 'Radius.Data/postgreSqlDatabases',
      provider: 'radius',
      provisioningState: 'Succeeded',
      properties: {
        secretName: 'dbsecret',
      },
    },
    {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Radius.Security/secrets/dbsecret',
      name: 'dbsecret',
      type: 'Radius.Security/secrets',
      provider: 'radius',
      provisioningState: 'Succeeded',
    },
  ],
};

export const ContainerResource: Resource = {
  id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/containers/test-container',
  name: 'test-container',
  type: 'Applications.Core/container',
  provider: 'radius',
  provisioningState: 'Succeeded',
};
