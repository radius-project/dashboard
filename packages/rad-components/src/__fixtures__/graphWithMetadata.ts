import { AppGraph } from '../graph';

const resourceId = (name: string) =>
  `/planes/radius/local/resourceGroups/demo/providers/Radius.Test/resources/${name}`;

export const graphWithMetadata: AppGraph = {
  icons: {
    container:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#1769aa" d="M2 2h28v28H2z"/></svg>',
    database:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><ellipse fill="#1769aa" cx="16" cy="16" rx="14" ry="10"/></svg>',
  },
  resources: [
    {
      id: resourceId('consumer'),
      name: 'consumer',
      type: 'Radius.Compute/containers',
      provisioningState: 'Succeeded',
      iconHash: 'container',
      connections: [
        { id: resourceId('queue'), direction: 'Outbound', kind: 'Connection' },
        {
          id: resourceId('database'),
          direction: 'Outbound',
          kind: 'Dependency',
        },
      ],
    },
    {
      id: resourceId('queue'),
      name: 'queue',
      type: 'Radius.Messaging/rabbitMQ',
      provisioningState: 'Succeeded',
      connections: [
        {
          id: resourceId('consumer'),
          direction: 'Inbound',
          kind: 'Connection',
        },
      ],
    },
    {
      id: resourceId('database'),
      name: 'database',
      type: 'Radius.Datastores/redisCaches',
      provisioningState: 'Succeeded',
      iconHash: 'database',
      connections: [
        {
          id: resourceId('consumer'),
          direction: 'Inbound',
          kind: 'Dependency',
        },
      ],
    },
  ],
};
