import * as features from './features';
import { featureRadiusCatalog } from './features';
import { radiusPlugin } from './plugin';
import * as publicApi from './index';

/**
 * A feature flag name is a string that crosses a boundary: a host enables it by
 * literal name in its own configuration, and the plugin reads it by constant.
 * Renaming the constant is invisible to TypeScript on the host side, so the
 * only thing protecting an operator's existing configuration is a test that
 * restates the literal.
 *
 * PU-08 already asserts the value and the registration. This suite covers the
 * module itself: that the value is a usable flag name, that the constant is the
 * single source of it, and that nothing else has crept into the module.
 */
describe('features', () => {
  it('FF-01: declares the radius catalog flag by its wire name', () => {
    expect(featureRadiusCatalog).toBe('radius-catalog');
  });

  it('FF-02: exports exactly one feature flag constant', () => {
    expect(Object.keys(features)).toEqual(['featureRadiusCatalog']);
  });

  it('FF-03: uses a name Backstage accepts as a feature flag', () => {
    // Backstage validates flag names as lowercase alphanumeric words separated
    // by hyphens, between 3 and 150 characters.
    expect(featureRadiusCatalog).toMatch(/^[a-z]+[a-z0-9]*(-[a-z0-9]+)*$/);
    expect(featureRadiusCatalog.length).toBeGreaterThanOrEqual(3);
    expect(featureRadiusCatalog.length).toBeLessThanOrEqual(150);
  });

  it('FF-04: registers that exact name on the plugin, with no second flag', () => {
    expect([...radiusPlugin.getFeatureFlags()]).toEqual([
      { name: featureRadiusCatalog },
    ]);
  });

  it('FF-05: publishes the constant so a host can reference the flag it must enable', () => {
    expect(publicApi.featureRadiusCatalog).toBe(featureRadiusCatalog);
  });
});
