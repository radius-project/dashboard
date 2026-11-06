export interface AppGraph {
  name?: string;
  resources: Resource[];
  icons?: Record<string, string | null>;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  provider?: string;
  provisioningState: string;
  iconHash?: string | null;
  resources?: Resource[];
  connections?: Connection[];
}

export interface Connection {
  id: string;
  name?: string;
  type?: string;
  provider?: string;
  direction: Direction;
  kind?: ConnectionKind;
}

export type Direction = 'Outbound' | 'Inbound';
export type ConnectionKind = 'Connection' | 'Dependency';
