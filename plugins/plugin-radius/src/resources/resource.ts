export interface Resource<T = { [key: string]: unknown }> {
  id: string;
  type: string;
  name: string;
  tags?: Record<string, string>;
  systemData: Record<string, never>;
  properties: T;
}

export interface ResourceList<T = { [key: string]: unknown }> {
  value: Resource<T>[];
}

export interface ApplicationProperties {
  provisioningState: string;
  environment: string;
}

export interface EnvironmentProperties {
  provisioningState: string;
}
