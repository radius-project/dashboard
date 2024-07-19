import { Connection, KubernetesConnection, RadiusApiImpl } from "./api";

describe("KubernetesConnection", () => {
  it("selectCluster returns first cluster", async () => {
    const connection = new KubernetesConnection({
        getClusters: async () => [
          { name: "test-cluster1", authProvider: "test" },
          {
            name: "test-cluster2",
            authProvider: "test",
          },
        ],
        proxy: async () => {
          throw new Error("not implemented");
        },
      });
    expect(await connection.selectCluster()).toEqual("test-cluster1");
  });
})

describe("RadiusApi", () => {
  const makeApi = (
    mocks?: {
      connection?: Connection;
    },
  ) => {
    return new RadiusApiImpl(
      mocks?.connection ?? {
        send() {
          throw new Error(`Not implemented`);
        },
      },
    );
  };

  describe("makePath", () => {
    const api = makeApi();

    it("makes path for scopes", () => {
      const path = api.makePath({
        scopes: [{ type: "radius", value: "local" }],
      });
      expect(path).toEqual(api.makePathForId("/planes/radius/local"));
    });
    it("makes path for multiple scopes", () => {
      const path = api.makePath({
        scopes: [
          { type: "radius", value: "local" },
          {
            type: "resourceGroups",
            value: "test-group",
          },
        ],
      });
      expect(path).toEqual(
        api.makePathForId("/planes/radius/local/resourceGroups/test-group"),
      );
    });
    it("makes path for scope list", () => {
      const path = api.makePath({
        scopes: [
          { type: "radius", value: "local" },
          {
            type: "resourceGroups",
          },
        ],
      });
      expect(path).toEqual(
        api.makePathForId("/planes/radius/local/resourceGroups"),
      );
    });
    it("makes path for scope action", () => {
      const path = api.makePath({
        scopes: [{ type: "radius", value: "local" }],
        action: "action",
      });
      expect(path).toEqual(api.makePathForId("/planes/radius/local/action"));
    });
    it("makes path for resource type without name", () => {
      const path = api.makePath({
        scopes: [{ type: "radius", value: "local" }],
        type: "Applications.Core/applications",
      });
      expect(path).toEqual(
        api.makePathForId(
          "/planes/radius/local/providers/Applications.Core/applications",
        ),
      );
    });
    it("makes path for resource type with name", () => {
      const path = api.makePath({
        scopes: [{ type: "radius", value: "local" }],
        type: "Applications.Core/applications",
        name: "test-app",
      });
      expect(path).toEqual(
        api.makePathForId(
          "/planes/radius/local/providers/Applications.Core/applications/test-app",
        ),
      );
    });
    it("makes path for resource type with name and action", () => {
      const path = api.makePath({
        scopes: [{ type: "radius", value: "local" }],
        type: "Applications.Core/applications",
        name: "test-app",
        action: "restart",
      });
      expect(path).toEqual(
        api.makePathForId(
          "/planes/radius/local/providers/Applications.Core/applications/test-app/restart",
        ),
      );
    });
  });

  it("makeRequest handles errors", async () => {
    const api = makeApi({
      connection: {
        send: async () =>
          Promise.resolve(new Response("test", { status: 404 })),
      },
    });
    // eslint-disable-next-line dot-notation
    await expect(api["makeRequest"]("path")).rejects.toThrow(
      "Request failed: 404:\n\ntest",
    );
  });
  it("makeRequest expects JSON", async () => {
    const api = makeApi({
      connection: {
        send: async () => Promise.resolve(new Response("test")),
      },
    });
    // eslint-disable-next-line dot-notation
    await expect(api["makeRequest"]("path")).rejects.toThrow(
      "Request was not json: 200:\n\ntest",
    );
  });
  it("makeRequest parses JSON", async () => {
    const api = makeApi({
      connection: {
        send: async () =>
          Promise.resolve(new Response('{ "message": "test" }')),
      },
    });
    // eslint-disable-next-line dot-notation
    await expect(api["makeRequest"]("path")).resolves.toEqual({
      message: "test",
    });
  });
});
