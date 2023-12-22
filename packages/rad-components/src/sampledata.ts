import { AppGraph, Resource } from "./graph";

export const DemoApplication: AppGraph = {
  name: 'demo',
  resources: [
    {
      id: "/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/containers/webapp",
      name: "webapp",
      type: "Applications.Core/container",
      provider: "radius",
      provisioningState: "Succeeded",
      connections: [{
        id: "/planes/radius/local/resourceGroups/test-group/providers/Applications.Datastores/redisCaches/db",
        name: "db",
        type: "Applications.Datastores/redisCaches",
        provider: "radius",
        direction: "Outbound",
      }]
    },
    {
      id: "/planes/radius/local/resourceGroups/test-group/providers/Applications.Datastores/redisCaches/db",
      name: "db",
      type: "Applications.Datastores/redisCaches",
      provider: "radius",
      provisioningState: "Succeeded",
    }
  ]
}

export const ContainerResource: Resource = {
  id: "/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/containers/test-container",
  name: "test-container",
  type: "Applications.Core/container",
  provider: "radius",
  provisioningState: "Succeeded",
}