export interface AppGraph {
  name: string;
  resources: Resource[];
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  provider: string;
  provisioningState: string;
  resources?: Resource[];
  connections?: Connection[];
}

export interface Connection {
  id: string;
  name: string;
  type: string;
  provider: string;
  direction: Direction;
}

export type Direction = 'Outbound' | 'Inbound';