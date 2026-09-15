import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { AppGraph } from '../graph';
import {
  diffGraphRecords,
  findCarriedForwardGraphDefects,
  findUnapprovedGraphRecordChanges,
  GraphRecord,
  GraphRecordChange,
  GraphRecordNode,
  knownGraphDefects,
  normalizeGraphModel,
} from '../graphRecord';

import empty from '../__fixtures__/graph/empty.json';
import singleNode from '../__fixtures__/graph/single-node.json';
import containerToDatabase from '../__fixtures__/graph/container-to-database.json';
import gatewayInbound from '../__fixtures__/graph/gateway-inbound.json';
import multiTier from '../__fixtures__/graph/multi-tier.json';
import unparseableConnection from '../__fixtures__/graph/unparseable-connection.json';
import missingTarget from '../__fixtures__/graph/missing-target.json';
import selfReference from '../__fixtures__/graph/self-reference.json';
import managedCluster from '../__fixtures__/graph/managed-cluster.json';
import deployStatusMatrix from '../__fixtures__/graph/deploy-status-matrix.json';
import unknownType from '../__fixtures__/graph/unknown-type.json';
import duplicateIds from '../__fixtures__/graph/duplicate-ids.json';
import bothNamespaces from '../__fixtures__/graph/both-namespaces.json';
import largeFanOut from '../__fixtures__/graph/large-fan-out.json';

const fixtureDirectory = path.resolve(
  __dirname,
  '../__fixtures__/graph-records',
);
const manifestPath = path.resolve(
  __dirname,
  '../__fixtures__/graph-expected-changes.md',
);

const fixtures: Record<string, unknown> = {
  empty,
  'single-node': singleNode,
  'container-to-database': containerToDatabase,
  'gateway-inbound': gatewayInbound,
  'multi-tier': multiTier,
  'unparseable-connection': unparseableConnection,
  'missing-target': missingTarget,
  'self-reference': selfReference,
  'managed-cluster': managedCluster,
  'deploy-status-matrix': deployStatusMatrix,
  'unknown-type': unknownType,
  'duplicate-ids': duplicateIds,
  'both-namespaces': bothNamespaces,
  'large-fan-out': largeFanOut,
};

const load = (fixture: unknown): AppGraph =>
  JSON.parse(JSON.stringify(fixture)) as AppGraph;

const updateMode = process.env.UPDATE_GRAPH_RECORDS === 'true';

const createFreshGraphRecord = async (
  fixture: unknown,
): Promise<GraphRecord> => {
  let record: GraphRecord | undefined;
  await jest.isolateModulesAsync(async () => {
    const { createGraphRecord } = await import('../graphRecord');
    record = createGraphRecord(load(fixture));
  });
  if (!record) {
    throw new Error('Graph record generation did not produce a record');
  }
  return record;
};

const readRecord = (fixture: string): GraphRecord =>
  JSON.parse(
    fs.readFileSync(path.join(fixtureDirectory, `${fixture}.json`), 'utf8'),
  ) as GraphRecord;

const repoRoot = path.resolve(__dirname, '../../../..');

const git = (args: string[]): string | undefined => {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
};

/**
 * GU-21 and GU-22 both compare generated records against the committed ones, so
 * a change that edits a record file and the implementation together satisfies
 * them without ever consulting the manifest. GU-25 closes that by diffing the
 * committed records against the base branch, where the old baseline still
 * lives. CI checks out full history so the base commit is present; locally the
 * fetched `origin/main` serves the same purpose.
 */
const resolveBaseRef = (): string => {
  const candidates = [
    process.env.GRAPH_RECORD_BASE_REF,
    'origin/main',
    'main',
  ].filter((ref): ref is string => Boolean(ref));

  for (const ref of candidates) {
    const resolved = git([
      'rev-parse',
      '--verify',
      '--quiet',
      `${ref}^{commit}`,
    ]);
    if (resolved) {
      return resolved.trim();
    }
  }

  throw new Error(
    `Cannot resolve a base commit to compare graph records against (tried ${candidates.join(
      ', ',
    )}). Fetch the base branch, or set GRAPH_RECORD_BASE_REF to a commit that contains it.`,
  );
};

const readRecordAtRef = (
  ref: string,
  committedPath: string,
): GraphRecord | undefined => {
  const contents = git(['show', `${ref}:${committedPath}`]);
  return contents ? (JSON.parse(contents) as GraphRecord) : undefined;
};

const parseManifest = (contents: string): GraphRecordChange[] =>
  contents
    .split('\n')
    .filter(line => line.startsWith('| ') && !line.startsWith('| Fixture'))
    .filter(line => !line.startsWith('| ---'))
    .map(line => {
      const [fixture, field, oldValue, newValue, reason] = line
        .split('|')
        .slice(1, -1)
        .map(value => value.trim().replaceAll('\\|', '|'));
      return { fixture, field, oldValue, newValue, reason };
    });

const generatedRecords = async (): Promise<Record<string, GraphRecord>> => {
  const records: Record<string, GraphRecord> = {};
  for (const [name, fixture] of Object.entries(fixtures)) {
    records[name] = await createFreshGraphRecord(fixture);
  }
  return records;
};

const updateGraphRecords = (
  records: Record<string, GraphRecord>,
  baselines: Record<string, GraphRecord>,
  manifest: GraphRecordChange[],
  writeRecord: (fixture: string, record: GraphRecord) => void,
) => {
  const changes = Object.entries(records).flatMap(([fixture, record]) =>
    diffGraphRecords(fixture, baselines[fixture], record),
  );
  const unapproved = findUnapprovedGraphRecordChanges(changes, manifest);

  if (unapproved.length > 0) {
    throw new Error(
      `Refusing to update graph records with unapproved changes:\n${JSON.stringify(
        unapproved,
        null,
        2,
      )}`,
    );
  }

  Object.entries(records).forEach(([fixture, record]) =>
    writeRecord(fixture, record),
  );
};

describe('graph records', () => {
  it('GU-21a: normalizes, quantizes, and sorts semantic graph data', async () => {
    expect(
      normalizeGraphModel({
        nodes: [
          {
            id: 'z',
            label: 'Zulu',
            type: 'test/Zulu',
            status: 'Succeeded',
            icon: null,
            statusBadge: null,
            position: { x: 149, y: 251 },
          },
          {
            id: 'a',
            label: 'Alpha',
            type: 'test/Alpha',
            status: 'Failed',
            icon: null,
            statusBadge: null,
            position: { x: 49, y: 50 },
          },
        ],
        edges: [
          { id: 'second', source: 'z', target: 'a' },
          { id: 'first', source: 'a', target: 'z' },
        ],
      }),
    ).toEqual({
      nodes: [
        {
          id: 'a',
          label: 'Alpha',
          type: 'test/Alpha',
          icon: null,
          statusBadge: null,
          position: { x: 0, y: 100 },
        },
        {
          id: 'z',
          label: 'Zulu',
          type: 'test/Zulu',
          icon: null,
          statusBadge: null,
          position: { x: 100, y: 300 },
        },
      ],
      edges: [
        { source: 'a', target: 'z', direction: 'source-to-target' },
        { source: 'z', target: 'a', direction: 'source-to-target' },
      ],
    });
    expect(await createFreshGraphRecord(empty)).toEqual({
      nodes: [],
      edges: [],
    });
  });

  /**
   * In update mode the committed records are the artifact being replaced, so
   * comparing against them proves nothing. These cases are skipped rather than
   * left to pass without assertions, so the reported count reflects what was
   * actually checked. GU-22 still validates every change before any write.
   */
  (updateMode ? it.skip : it).each(Object.entries(fixtures))(
    'GU-21: %s produces its committed semantic graph record',
    async (name, fixture) => {
      expect(await createFreshGraphRecord(fixture)).toEqual(readRecord(name));
    },
  );

  it('GU-22: rejects record changes not declared in the expected-change manifest', async () => {
    const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
    const records = await generatedRecords();
    const baselines = Object.fromEntries(
      Object.keys(records).map(fixture => [fixture, readRecord(fixture)]),
    );
    const changes = Object.entries(records).flatMap(([fixture, record]) =>
      diffGraphRecords(fixture, baselines[fixture], record),
    );
    expect(findUnapprovedGraphRecordChanges(changes, manifest)).toEqual([]);

    if (updateMode) {
      updateGraphRecords(records, baselines, manifest, (fixture, record) => {
        fs.mkdirSync(fixtureDirectory, { recursive: true });
        fs.writeFileSync(
          path.join(fixtureDirectory, `${fixture}.json`),
          `${JSON.stringify(record, null, 2)}\n`,
        );
      });
    }
  });

  it('GU-22a: accepts only exact expected record changes', () => {
    const changes = [
      {
        fixture: 'sample',
        field: 'nodes.0.label',
        oldValue: '"old"',
        newValue: '"new"',
      },
      {
        fixture: 'sample',
        field: 'edges.0.target',
        oldValue: '"old-target"',
        newValue: '"new-target"',
      },
    ];
    const manifest = [
      {
        ...changes[0],
        reason: 'Approved label correction',
      },
    ];

    expect(findUnapprovedGraphRecordChanges(changes, manifest)).toEqual([
      changes[1],
    ]);
  });

  it('GU-22b: reports recursive additions, removals, and scalar changes', () => {
    const baseline: GraphRecord = {
      nodes: [
        {
          id: 'node',
          label: 'Old',
          type: 'test/Type',
          icon: null,
          statusBadge: null,
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { source: 'node', target: 'removed', direction: 'source-to-target' },
      ],
    };
    const current: GraphRecord = {
      nodes: [
        {
          ...baseline.nodes[0],
          label: 'New',
          icon: 'icon',
        },
        {
          ...baseline.nodes[0],
          id: 'added',
        },
      ],
      edges: [],
    };

    expect(diffGraphRecords('sample', baseline, current)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'nodes.0.label',
          oldValue: '"Old"',
          newValue: '"New"',
        }),
        expect.objectContaining({ field: 'nodes.0.icon' }),
        expect.objectContaining({
          field: 'nodes.1',
          oldValue: '<absent>',
        }),
        expect.objectContaining({
          field: 'edges.0',
          newValue: '<absent>',
        }),
      ]),
    );
  });

  it('GU-22c: validates every change before update mode writes any record', () => {
    const baseline = readRecord('single-node');
    const changed = {
      ...baseline,
      nodes: [{ ...baseline.nodes[0], label: 'Changed' }],
    };
    const writeRecord = jest.fn();

    expect(() =>
      updateGraphRecords(
        { 'single-node': changed, empty: readRecord('empty') },
        { 'single-node': baseline, empty: readRecord('empty') },
        [],
        writeRecord,
      ),
    ).toThrow('Refusing to update graph records with unapproved changes');
    expect(writeRecord).not.toHaveBeenCalled();

    expect(() =>
      updateGraphRecords(
        { 'single-node': changed, empty: readRecord('empty') },
        { 'single-node': baseline, empty: readRecord('empty') },
        [
          {
            fixture: 'single-node',
            field: 'nodes.0.label',
            oldValue: JSON.stringify(baseline.nodes[0].label),
            newValue: '"Changed"',
            reason: 'Approved mutation',
          },
        ],
        writeRecord,
      ),
    ).not.toThrow();
    expect(writeRecord).toHaveBeenCalledTimes(2);
  });

  it('GU-22d: distinguishes absence from strings and null in manifest values', () => {
    const baseline = {
      nodes: [{ id: 'node' }],
      edges: [],
    } as unknown as GraphRecord;
    const withString = {
      nodes: [{ id: 'node', icon: '<absent>' }],
      edges: [],
    } as unknown as GraphRecord;
    const withNull = {
      nodes: [{ id: 'node', icon: null }],
      edges: [],
    } as unknown as GraphRecord;

    expect(diffGraphRecords('sample', baseline, withString)).toContainEqual(
      expect.objectContaining({
        field: 'nodes.0.icon',
        oldValue: '<absent>',
        newValue: '"<absent>"',
      }),
    );
    expect(diffGraphRecords('sample', baseline, withNull)).toContainEqual(
      expect.objectContaining({
        field: 'nodes.0.icon',
        oldValue: '<absent>',
        newValue: 'null',
      }),
    );
  });

  it('GU-21b: records renderer-facing icon and status semantics', () => {
    const normalized = normalizeGraphModel({
      nodes: [
        {
          id: 'node',
          label: 'Node',
          type: 'test/Type',
          status: 'Succeeded',
          icon: 'database',
          statusBadge: {
            kind: 'success',
            accessibleName: 'Provisioning succeeded',
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });

    expect(normalized.nodes[0]).toMatchObject({
      icon: 'database',
      statusBadge: {
        kind: 'success',
        accessibleName: 'Provisioning succeeded',
      },
    });
  });

  it('GU-23: reports KNOWN-DEFECT invariant violations as carried forward', async () => {
    expect(
      findCarriedForwardGraphDefects(
        await generatedRecords(),
        knownGraphDefects,
      ),
    ).toEqual(knownGraphDefects);
  });

  it('GU-23a: clears a defect only when its own invariant is repaired', () => {
    const duplicate = readRecord('duplicate-ids');
    const defect = knownGraphDefects.find(
      known => known.fixture === 'duplicate-ids',
    )!;
    const records = (record: GraphRecord) => ({ 'duplicate-ids': record });

    // An unrelated extraction change - here the icon field the renderer will
    // start populating - must not be mistaken for a repair. The old
    // field-based tracker cleared the defect on exactly this input.
    const withIcons: GraphRecord = {
      ...duplicate,
      nodes: duplicate.nodes.map(node => ({ ...node, icon: 'container' })),
    };
    expect(
      findCarriedForwardGraphDefects(records(withIcons), [defect]),
    ).toEqual([defect]);

    // Deduplicating the ids is the actual repair, and only that clears it.
    const deduplicated: GraphRecord = {
      ...duplicate,
      nodes: [duplicate.nodes[0]],
    };
    expect(
      findCarriedForwardGraphDefects(records(deduplicated), [defect]),
    ).toEqual([]);
  });

  it('GU-23b: detects each declared defect invariant independently', () => {
    const node = (id: string): GraphRecordNode => ({
      id,
      label: id,
      type: 'test/Type',
      icon: 'icon',
      statusBadge: { kind: 'success', accessibleName: 'Succeeded' },
      position: { x: 0, y: 0 },
    });
    const healthy: GraphRecord = {
      nodes: [node('a'), node('b')],
      edges: [{ source: 'a', target: 'b', direction: 'source-to-target' }],
    };
    const byFixture = (fixture: string) =>
      knownGraphDefects.find(defect => defect.fixture === fixture)!;

    // Every invariant reports "repaired" on a healthy record, so none of them
    // is a constant that would pin a defect forever.
    Object.keys(fixtures).forEach(fixture => {
      const defect = knownGraphDefects.find(known => known.fixture === fixture);
      if (defect) {
        expect(defect.isPresent(healthy)).toBe(false);
      }
    });

    expect(
      byFixture('missing-target').isPresent({
        ...healthy,
        edges: [
          { source: 'a', target: 'absent', direction: 'source-to-target' },
        ],
      }),
    ).toBe(true);
    expect(
      byFixture('self-reference').isPresent({
        ...healthy,
        edges: [{ source: 'a', target: 'a', direction: 'source-to-target' }],
      }),
    ).toBe(true);
    expect(
      byFixture('duplicate-ids').isPresent({
        ...healthy,
        nodes: [node('a'), node('a')],
      }),
    ).toBe(true);
    expect(
      byFixture('multi-tier').isPresent({
        ...healthy,
        nodes: healthy.nodes.map(current => ({ ...current, icon: null })),
      }),
    ).toBe(true);
    expect(
      byFixture('deploy-status-matrix').isPresent({
        ...healthy,
        nodes: healthy.nodes.map(current => ({
          ...current,
          statusBadge: null,
        })),
      }),
    ).toBe(true);

    // An empty record has no nodes to be missing an icon or badge, so those
    // invariants must not fire on it.
    expect(byFixture('multi-tier').isPresent({ nodes: [], edges: [] })).toBe(
      false,
    );
  });

  it('GU-23c: rejects a defect naming a fixture with no record', () => {
    expect(() =>
      findCarriedForwardGraphDefects({}, [
        {
          fixture: 'absent-fixture',
          issue: '#0',
          invariant: 'never evaluated',
          isPresent: () => true,
        },
      ]),
    ).toThrow('has no graph record');
  });

  it('GU-25: rejects committed record edits not declared in the manifest', () => {
    const baseRef = resolveBaseRef();
    const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
    const relativeDirectory = path
      .relative(repoRoot, fixtureDirectory)
      .replaceAll('\\', '/');

    const changes = Object.keys(fixtures).flatMap(fixture => {
      const committedPath = `${relativeDirectory}/${fixture}.json`;
      const base = readRecordAtRef(baseRef, committedPath);
      // A record that does not exist at the base ref is a new fixture, not a
      // mutated baseline, so there is nothing for the manifest to approve.
      return base ? diffGraphRecords(fixture, base, readRecord(fixture)) : [];
    });

    expect(findUnapprovedGraphRecordChanges(changes, manifest)).toEqual([]);
  });

  it('GU-25a: treats a mutated committed record as an unapproved change', () => {
    const baseline = readRecord('duplicate-ids');
    const edited: GraphRecord = {
      ...baseline,
      nodes: [{ ...baseline.nodes[0], id: 'silently-deduplicated' }].concat(
        baseline.nodes.slice(1),
      ),
    };

    expect(
      findUnapprovedGraphRecordChanges(
        diffGraphRecords('duplicate-ids', baseline, edited),
        [],
      ),
    ).not.toEqual([]);
  });

  it('GU-24: keeps the checked-in expected-change manifest empty', () => {
    expect(parseManifest(fs.readFileSync(manifestPath, 'utf8'))).toEqual([]);
  });
});
