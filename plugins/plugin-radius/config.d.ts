export interface Config {
  /**
   * Radius plugin configuration
   */
  radius: {
    /**
     * Configuration for the connection to Radius.
     */
    connection: {
      /**
       * Kind of connection to Radius. Use `direct` for direct connection to Radius server, or `kubernetes` for connection to Radius server running in Kubernetes.
       * @visibility frontend
       */
      kind: "direct" | "kubernetes";
    };
  };
}
