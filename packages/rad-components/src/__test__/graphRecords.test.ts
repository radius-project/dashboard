import fs from 'fs';
import path from 'path';
import { AppGraph } from '../graph';
import {
  createGraphRecord,
  diffGraphRecords,
  findCarriedForwardGraphDefects,
  findUnapprovedGraphRecordChanges,
  GraphRecord,
  GraphRecordChange,
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

const createFreshGraphRecord = (fixture: unknown): GraphRecord => {
  let record: GraphRecord | undefined;
  jest.isolateModules(() => {
    const { createGraphRecord } =
      require('../graphRecord') as typeof import('../graphRecord');
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

const generatedRecords = () =>
  Object.fromEntries(
    Object.entries(fixtures).map(([name, fixture]) => [
      name,
      createFreshGraphRecord(fixture),
    ]),
  );

describe('graph records', () => {
  it('GU-21a: normalizes, quantizes, and sorts semantic graph data', () => {
    expect(
      normalizeGraphModel({
        nodes: [
          {
            id: 'z',
            label: 'Zulu',
            type: 'test/Zulu',
            status: 'Succeeded',
            position: { x: 149, y: 251 },
          },
          {
            id: 'a',
            label: 'Alpha',
            type: 'test/Alpha',
            status: 'Failed',
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
    expect(createGraphRecord(load(empty))).toEqual({ nodes: [], edges: [] });
  });

  it.each(Object.entries(fixtures))(
    'GU-21: %s produces its committed semantic graph record',
    (name, fixture) => {
      const actual = createFreshGraphRecord(fixture);

      if (process.env.UPDATE_GRAPH_RECORDS === 'true') {
        fs.mkdirSync(fixtureDirectory, { recursive: true });
        fs.writeFileSync(
          path.join(fixtureDirectory, `${name}.json`),
          `${JSON.stringify(actual, null, 2)}\n`,
        );
      }

      expect(actual).toEqual(readRecord(name));
    },
  );

  it('GU-22: rejects record changes not declared in the expected-change manifest', () => {
    const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
    const changes = Object.entries(generatedRecords()).flatMap(
      ([fixture, record]) =>
        diffGraphRecords(fixture, readRecord(fixture), record),
    );
    expect(findUnapprovedGraphRecordChanges(changes, manifest)).toEqual([]);
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
        expect.objectContaining({ field: 'nodes.0.label' }),
        expect.objectContaining({ field: 'nodes.0.icon' }),
        expect.objectContaining({ field: 'nodes.1' }),
        expect.objectContaining({ field: 'edges.0' }),
      ]),
    );
  });

  it('GU-23: reports unchanged KNOWN-DEFECT record fields as carried forward', () => {
    const changedFields = new Set(
      Object.entries(generatedRecords())
        .flatMap(([fixture, record]) =>
          diffGraphRecords(fixture, readRecord(fixture), record),
        )
        .map(change => `${change.fixture}:${change.field}`),
    );

    expect(
      findCarriedForwardGraphDefects(changedFields, knownGraphDefects),
    ).toEqual(knownGraphDefects);
  });

  it('GU-23a: clears only defects whose declared record fields changed', () => {
    const defects = [
      { fixture: 'sample', issue: '#1', fields: ['nodes.icon'] },
      { fixture: 'sample', issue: '#2', fields: ['edges'] },
      { fixture: 'other', issue: '#3', fields: ['nodes'] },
    ];
    const changedFields = new Set([
      'sample:nodes.0.icon',
      'sample:unrelated',
      'other:nodes.0.label',
    ]);

    expect(findCarriedForwardGraphDefects(changedFields, defects)).toEqual([
      defects[1],
    ]);
  });

  it('GU-24: keeps the checked-in expected-change manifest empty', () => {
    expect(parseManifest(fs.readFileSync(manifestPath, 'utf8'))).toEqual([]);
  });
});
