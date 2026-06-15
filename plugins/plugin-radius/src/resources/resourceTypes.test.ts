import {
  isEnvironmentType,
  isApplicationType,
  getEquivalentTypes,
} from './resourceTypes';

describe('isEnvironmentType', () => {
  it('returns true for Applications.Core/environments', () => {
    expect(isEnvironmentType('Applications.Core/environments')).toBe(true);
  });

  it('returns true for Radius.Core/environments', () => {
    expect(isEnvironmentType('Radius.Core/environments')).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isEnvironmentType('Applications.Core/applications')).toBe(false);
    expect(isEnvironmentType('Radius.Core/applications')).toBe(false);
    expect(isEnvironmentType('Other/environments')).toBe(false);
    expect(isEnvironmentType(undefined)).toBe(false);
    expect(isEnvironmentType('')).toBe(false);
  });
});

describe('isApplicationType', () => {
  it('returns true for Applications.Core/applications', () => {
    expect(isApplicationType('Applications.Core/applications')).toBe(true);
  });

  it('returns true for Radius.Core/applications', () => {
    expect(isApplicationType('Radius.Core/applications')).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isApplicationType('Applications.Core/environments')).toBe(false);
    expect(isApplicationType('Radius.Core/environments')).toBe(false);
    expect(isApplicationType('Other/applications')).toBe(false);
    expect(isApplicationType(undefined)).toBe(false);
    expect(isApplicationType('')).toBe(false);
  });
});

describe('getEquivalentTypes', () => {
  it('returns both environment types for Applications.Core/environments', () => {
    const result = getEquivalentTypes('Applications.Core/environments');
    expect(result).toEqual([
      'Applications.Core/environments',
      'Radius.Core/environments',
    ]);
  });

  it('returns both environment types for Radius.Core/environments', () => {
    const result = getEquivalentTypes('Radius.Core/environments');
    expect(result).toEqual([
      'Applications.Core/environments',
      'Radius.Core/environments',
    ]);
  });

  it('returns both application types for Applications.Core/applications', () => {
    const result = getEquivalentTypes('Applications.Core/applications');
    expect(result).toEqual([
      'Applications.Core/applications',
      'Radius.Core/applications',
    ]);
  });

  it('returns both application types for Radius.Core/applications', () => {
    const result = getEquivalentTypes('Radius.Core/applications');
    expect(result).toEqual([
      'Applications.Core/applications',
      'Radius.Core/applications',
    ]);
  });

  it('returns undefined for non-equivalent types', () => {
    expect(getEquivalentTypes('Other/type')).toBeUndefined();
    expect(
      getEquivalentTypes('Applications.Datastores/redisCaches'),
    ).toBeUndefined();
  });
});
