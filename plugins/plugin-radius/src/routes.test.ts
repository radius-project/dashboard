import * as routes from './routes';
import { rootRouteRef } from './routes';
import * as publicApi from './index';

/**
 * `routes.ts` is the plugin's navigation contract. PU-03 and PU-04 already pin
 * each ref's id and params from the consumer's side; this suite covers the
 * module's own invariants, which the contract test cannot see:
 *
 * - the file exports refs and nothing else, so a helper cannot be smuggled into
 *   what consumers treat as a pure route table;
 * - ids are unique, because Backstage resolves a duplicate id to whichever ref
 *   was registered last and the loser silently never matches;
 * - `rootRouteRef` is deliberately internal, so re-exporting it would widen the
 *   published surface without anyone noticing.
 */
const refs = Object.entries(routes);

describe('routes', () => {
  it('RO-01: exports nine route refs and nothing else', () => {
    expect(refs).toHaveLength(9);
    for (const [name, ref] of refs) {
      expect([name, typeof ref]).toEqual([name, 'object']);
      expect([name, typeof (ref as { id?: unknown }).id]).toEqual([
        name,
        'string',
      ]);
    }
  });

  it('RO-02: gives every ref a distinct id', () => {
    const ids = refs.map(([, ref]) => (ref as unknown as { id: string }).id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('RO-03: namespaces every id under "radius"', () => {
    for (const [name, ref] of refs) {
      const id = (ref as unknown as { id: string }).id;
      expect([name, id === 'radius' || id.startsWith('radius-')]).toEqual([
        name,
        true,
      ]);
    }
  });

  it('RO-04: gives every ref its own identity, so two pages cannot alias one route', () => {
    const objects = refs.map(([, ref]) => ref);

    expect(new Set(objects).size).toBe(objects.length);
  });

  it('RO-05: keeps rootRouteRef internal to the plugin', () => {
    // It is bound into `radiusPlugin.routes.root` (PU-05), which is how a host
    // reaches it. Exporting it directly would add a second, unversioned way in.
    expect(publicApi).not.toHaveProperty('rootRouteRef');
    expect(rootRouteRef).toBeDefined();
  });

  it('RO-06: publishes every non-root ref from the package entry point', () => {
    const internal = refs
      .filter(([name]) => name !== 'rootRouteRef')
      .map(([name]) => name)
      .sort();

    const published = Object.keys(publicApi)
      .filter(name => name.endsWith('RouteRef'))
      .sort();

    expect(published).toEqual(internal);
  });

  it('RO-07: declares parameters only on the two detail routes and the two entity routes', () => {
    const parameterised = refs
      .filter(([, ref]) => ((ref as { params?: string[] }).params ?? []).length)
      .map(([name]) => name)
      .sort();

    expect(parameterised).toEqual([
      'environmentPageRouteRef',
      'resourcePageRouteRef',
      'resourceTypeDetailPageRouteRef',
    ]);
  });
});
