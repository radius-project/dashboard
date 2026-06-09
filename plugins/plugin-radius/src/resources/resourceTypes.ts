/**
 * Helper functions to identify resource types across both legacy (Applications.Core)
 * and new (Radius.Core) namespaces.
 */

const environmentTypes = [
  'Applications.Core/environments',
  'Radius.Core/environments',
];

const applicationTypes = [
  'Applications.Core/applications',
  'Radius.Core/applications',
];

/**
 * Returns true if the given resource type is an environment type
 * from either the legacy or new namespace.
 */
export function isEnvironmentType(type?: string): boolean {
  return !!type && environmentTypes.includes(type);
}

/**
 * Returns true if the given resource type is an application type
 * from either the legacy or new namespace.
 */
export function isApplicationType(type?: string): boolean {
  return !!type && applicationTypes.includes(type);
}

/**
 * Returns the equivalent resource types across both namespaces.
 * For example, given 'Applications.Core/environments', returns
 * ['Applications.Core/environments', 'Radius.Core/environments'].
 * Returns undefined if no equivalent types exist.
 */
export function getEquivalentTypes(type: string): string[] | undefined {
  if (isEnvironmentType(type)) {
    return environmentTypes;
  }
  if (isApplicationType(type)) {
    return applicationTypes;
  }
  return undefined;
}
