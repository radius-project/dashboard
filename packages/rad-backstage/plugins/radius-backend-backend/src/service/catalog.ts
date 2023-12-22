import { UrlReader } from "@backstage/backend-common";
import {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
  CatalogProcessorParser,
  processingResult,
} from "@backstage/plugin-catalog-node";
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  Entity,
} from "@backstage/catalog-model";

import { LocationSpec } from "@backstage/plugin-catalog-common";
import { JsonObject } from "@backstage/config";

export class RadiusProcessor implements CatalogProcessor {
  constructor(private readonly reader: UrlReader) {}

  getProcessorName(): string {
    return "RadiusProcessor";
  }

  async readLocation(
    location: LocationSpec,
    _optional: boolean,
    emit: CatalogProcessorEmit,
    _parser: CatalogProcessorParser,
    _cache: CatalogProcessorCache,
  ): Promise<boolean> {
    // must match the location type.
    if (location.type !== "radius") {
      return false;
    }

    try {
      const response = await this.reader.readUrl(
        location.target +
          "/planes/radius/local/resourceGroups/default/resources\?api-version\=2023-10-01-preview",
      );
      const json = JSON.parse((await response.buffer()).toString());

      const entities = resourcesToEntities(location.target, json);
      for (const entity of entities) {
        emit(processingResult.entity(location, entity));
      }
    } catch (error) {
      const message = `Unable to read ${location.type}, ${error}`;
      emit(processingResult.generalError(location, message));
    }

    return true;
  }

  async preProcessEntity?(entity: Entity, location: LocationSpec, emit: CatalogProcessorEmit, _originLocation: LocationSpec, _cache: CatalogProcessorCache): Promise<Entity> {
    // Must match the location type.
    if (location.type !== "radius") {
      return entity;
    }
    // Must be an entity we created.
    if (entity.kind === 'Location') {
      return entity;
    }

    // Must have an id.
    const id = entity.metadata.annotations?.['radapp.io/id'];
    if (!id) {
      return entity;
    }

    // This will be found during validation.
    if (!entity.spec) {
      return entity; 
    }

    // Skip deployments for now. 
    if (entity.spec?.type === 'Microsoft.Resources/deployments') {
      return entity;
    }

    const uri = location.target + id + "?api-version=2023-10-01-preview";

    try {
      const response = await this.reader.readUrl(uri);
      const resource = JSON.parse((await response.buffer()).toString()) as Resource;

      // Add "resource" based on API data
      entity.spec.resource = resource as object;

      // Add "partOf" based on application and environment
      switch (resource.type) {
        case "Applications.Core/applications":
          entity.spec.system = "system:default/" + extractEnvironmentName(resource);
          break;

        case "Applications.Core/environments":
          break;

        default:
          entity.spec.system = "system:default/" + (extractApplicationName(resource) || extractEnvironmentName(resource));
          break;
      }

      let dependsOn: string[] = [];
      switch (resource.type) {
        case "Applications.Core/containers":
          const connections = extractConnections(resource);
          if (!connections) {
            break;
          }

          dependsOn = Object.entries(connections).map(([_, connection]) => { 
            const name = connection.source.slice(connection.source.lastIndexOf("/") + 1);
            return `resource:default/${name}`;
          });
      }

      const outputResources = extractOutputResources(resource);
      if (outputResources) {
        for (const outputResource of outputResources) {
          const resource = externalResourceToEntity(location.target, entity.spec?.system as string, outputResource.id);
          emit(processingResult.entity(location, resource));
          dependsOn.push!(`resource:default/${resource.metadata.name}`);
        }
      }

      entity.spec.dependsOn = dependsOn
    } catch (error) {
      const message = `Unable to read ${uri}, ${error}`;
      emit(processingResult.generalError(location, message));
    }

    return entity;
  }
}

interface Response {
  value: Resource[];
}

interface Resource {
  id: string;
  name: string;
  type: string;
  properties?: JsonObject;
}

interface Connection {
  source: string;
}

interface OutputResource {
  id: string;
}

function resourcesToEntities(location: string, response: Response): Entity[] {
  const results = [];
  for (const resource of response.value) {
    switch (resource.type) {
      case "Applications.Core/applications":
        results.push(applicationToEntity(location, resource));
        break;

      case "Applications.Core/environments":
        results.push(environmentToEntity(location, resource));
        break;

      case "Applications.Core/containers":
        results.push(containerToEntity(location, resource));
        break;

      default:
        results.push(resourceToEntity(location, resource));
        break;
    }
  }

  return results;
}

function extractApplicationName(resource: Resource): string | null {
  if (!resource.properties) {
    return null;
  }

  const id = resource.properties["application"];
  if (!id || typeof id !== "string" || id.indexOf("/planes") === -1) {
    return null;
  }

  return id.slice(id.lastIndexOf("/") + 1);
}

function extractEnvironmentName(resource: Resource): string | null {
  if (!resource.properties) {
    return null;
  }

  const id = resource.properties["environment"];
  if (!id || typeof id !== "string" || id.indexOf("/planes") === -1) {
    return null;
  }

  return id.slice(id.lastIndexOf("/") + 1);
}

function extractConnections(resource: Resource): Record<string, Connection> | null {
  if (!resource.properties) {
    return null;
  }

  const connections = resource.properties["connections"];
  if (!connections || typeof connections !== "object") {
    return null;
  }

  return connections as unknown as Record<string, Connection>;
}

function extractOutputResources(resource: Resource): OutputResource[] | null {
  if (!resource.properties) {
    return null;
  }

  const status = resource.properties["status"] as JsonObject;
  if (!status || typeof status !== "object") {
    return null;
  }

  const outputResources = status["outputResources"];
  if (!outputResources) {
    return null;
  }

  return outputResources as unknown as OutputResource[];
}

function applicationToEntity(location: string, application: Resource): Entity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "System",
    metadata: {
      name: application.name,
      title: application.name,
      namespace: "default",
      annotations: {
        [ANNOTATION_LOCATION]: `radius:${location}`,
        [ANNOTATION_ORIGIN_LOCATION]: `radius:${location}`,
        ['radapp.io/id']: application.id, 
      },
    },
    spec: {
      type: application.type,
      owner: "radius",
      lifecycle: "experimental",
    },
  };
}

function environmentToEntity(location: string, environment: Resource): Entity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "System",
    metadata: {
      name: environment.name,
      title: environment.name,
      namespace: "default",
      annotations: {
        [ANNOTATION_LOCATION]: `radius:${location}`,
        [ANNOTATION_ORIGIN_LOCATION]: `radius:${location}`,
        ['radapp.io/id']: environment.id, 
      },
    },
    spec: {
      type: environment.type,
      owner: "radius",
      lifecycle: "experimental",
    },
  };
}

function containerToEntity(location: string, container: Resource): Entity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name: container.name,
      title: container.name,
      namespace: "default",
      annotations: {
        [ANNOTATION_LOCATION]: `radius:${location}`,
        [ANNOTATION_ORIGIN_LOCATION]: `radius:${location}`,
        ['radapp.io/id']: container.id, 
      },
    },
    spec: {
      type: container.type,
      owner: "radius",
      lifecycle: "experimental",
    },
  };
}

function resourceToEntity(location: string, resource: Resource): Entity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Resource",
    metadata: {
      name: resource.name,
      title: resource.name,
      namespace: "default",
      annotations: {
        [ANNOTATION_LOCATION]: `radius:${location}`,
        [ANNOTATION_ORIGIN_LOCATION]: `radius:${location}`,
        ['radapp.io/id']: resource.id, 
      },
    },
    spec: {
      type: resource.type,
      owner: "radius",
      lifecycle: "experimental",
    },
  };
}

function externalResourceToEntity(location: string, system: string | undefined, id: string): Entity {
  const name = id.slice(id.lastIndexOf("/") + 1);
  const type = id.slice(id.indexOf("/providers/") + "/providers/".length, id.lastIndexOf("/"));
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Resource",
    metadata: {
      name: name,
      title: name,
      namespace: "default",
      annotations: {
        [ANNOTATION_LOCATION]: `radius:${location}`,
        [ANNOTATION_ORIGIN_LOCATION]: `radius:${location}`,
      },
    },
    spec: {
      type: type,
      owner: "radius",
      lifecycle: "experimental",
      system: system,
      resourceId: id,
    },
  };
}