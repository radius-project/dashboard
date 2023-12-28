import { parseResourceId } from './resourceId';

describe('parseResourceId', () => {
  it('should parse a valid environment resource ID', () => {
    const resourceId =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/test-environment';
    const parsed = parseResourceId(resourceId);
    expect(parsed).toEqual({
      plane: 'local',
      group: 'test-group',
      type: 'Applications.Core/environments',
      name: 'test-environment',
    });
  });

  it('should return undefined for an invalid resource ID', () => {
    const resourceId =
      '/planes/radius/local/resourceGroups/test-group/providers/Applications.Cor12323231e-----/environments';
    const parsed = parseResourceId(resourceId);
    expect(parsed).toBeUndefined();
  });
});
