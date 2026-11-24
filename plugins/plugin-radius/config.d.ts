export interface Config {
  radius?: {
    /** Approved cluster and plane pairs. An absent list uses each host cluster's radius/local plane. */
    connections?: Array<{
      /** @visibility frontend */
      clusterName: string;
      plane: {
        /** @visibility frontend */
        type: string;
        /** @visibility frontend */
        name: string;
      };
    }>;
  };
}
