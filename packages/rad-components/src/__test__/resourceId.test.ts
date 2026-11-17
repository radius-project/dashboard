import { parseResourceId } from '../resourceId';

/**
 * This parser is consumed by every table, breadcrumb, link, and graph node in
 * the dashboard, so its behavior is load-bearing. It moves to the shared
 * package during extraction; these cases describe what the replacement must
 * keep doing, including the inputs it currently rejects.
 */
describe('parseResourceId', () => {
  it('RU-01: parses an environment resource ID', () => {
    const parsed = parseResourceId(
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-environment',
    );

    expect(parsed).toEqual({
      plane: 'local',
      group: 'test-group',
      type: 'Applications.Core/environments',
      name: 'test-environment',
    });
  });

  it('RU-01: joins the provider namespace and type into a single type', () => {
    const parsed = parseResourceId(
      '/planes/radius/local/resourceGroups/g/providers/Applications.Datastores/redisCaches/cache',
    );

    expect(parsed?.type).toBe('Applications.Datastores/redisCaches');
  });

  it('RU-01: accepts hyphenated planes, groups, and names', () => {
    const parsed = parseResourceId(
      '/planes/radius/my-plane/resourceGroups/my-group/providers/Applications.Core/containers/my-container',
    );

    expect(parsed).toEqual({
      plane: 'my-plane',
      group: 'my-group',
      type: 'Applications.Core/containers',
      name: 'my-container',
    });
  });

  it('RU-01: is case insensitive on the path segments', () => {
    const parsed = parseResourceId(
      '/Planes/Radius/local/ResourceGroups/g/Providers/Applications.Core/Environments/e',
    );

    expect(parsed?.name).toBe('e');
  });

  it('RU-02: returns undefined for a malformed id', () => {
    expect(
      parseResourceId(
        '/planes/radius/local/resourceGroups/test-group/providers/Applications.Cor12323231e-----/environments',
      ),
    ).toBeUndefined();
  });

  it('RU-02: returns undefined rather than throwing on empty or junk input', () => {
    expect(parseResourceId('')).toBeUndefined();
    expect(parseResourceId('not-an-id')).toBeUndefined();
    expect(parseResourceId('/planes/radius/local')).toBeUndefined();
  });

  it('RU-02: requires the full scope, rejecting an id with no resource group', () => {
    expect(
      parseResourceId(
        '/planes/radius/local/providers/Applications.Core/environments/e',
      ),
    ).toBeUndefined();
  });

  it('RU-02: rejects a trailing child resource segment', () => {
    // A nested id is not a resource id this parser understands, so callers must
    // get `undefined` rather than a truncated parse.
    expect(
      parseResourceId(
        '/planes/radius/local/resourceGroups/g/providers/Applications.Core/environments/e/child/c',
      ),
    ).toBeUndefined();
  });

  it('RU-02 / #352: accepts legal names containing a dot or underscore', () => {
    expect(
      parseResourceId(
        '/planes/radius/local/resourceGroups/g/providers/Applications.Core/environments/my.env',
      ),
    ).toMatchObject({ name: 'my.env' });
    expect(
      parseResourceId(
        '/planes/radius/local/resourceGroups/g/providers/Applications.Core/environments/my_env',
      ),
    ).toMatchObject({ name: 'my_env' });
  });

  it('RU-02 / #352: accepts a resource type containing a digit', () => {
    expect(
      parseResourceId(
        '/planes/radius/local/resourceGroups/g/providers/Applications.Core/gateways2/g',
      ),
    ).toMatchObject({ type: 'Applications.Core/gateways2', name: 'g' });
  });
});
