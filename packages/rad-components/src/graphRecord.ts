import { AppGraph } from './graph';
import { buildLayoutedGraphModel, GraphModel } from './graphModel';

/**
 * The renderer does not populate icons or status badges yet. That is recorded
 * as an explicit `not-yet-populated` state rather than a pinned `null`, so when
 * richer node rendering lands the diff reads as a state transition rather than
 * as a regression against an asserted absence.
 */
export const NOT_YET_POPULATED = 'not-yet-populated';

export interface GraphRecordNode {
  id: string;
  label: string;
  type: string;
  /** An icon name, or `NOT_YET_POPULATED`. */
  icon: string;
  statusBadge:
    | {
        kind: string;
        accessibleName: string;
      }
    | typeof NOT_YET_POPULATED;
}

export interface GraphRecordEdge {
  source: string;
  target: string;
  direction: 'source-to-target';
}

export interface GraphRecord {
  nodes: GraphRecordNode[];
  edges: GraphRecordEdge[];
}

export interface GraphRecordChange {
  fixture: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface GraphRecordFieldChange {
  fixture: string;
  field: string;
  oldValue: string;
  newValue: string;
}

/**
 * A defect that is characterized rather than fixed. `isPresent` reads the
 * invariant the defect actually violates straight off the record, so unrelated
 * extraction work - a new icon, a moved node, a relabelled edge - cannot make a
 * still-broken fixture look repaired. When a defect is genuinely fixed its
 * predicate goes false and GU-23 fails, which is the signal to retire the entry.
 */
export interface KnownGraphDefect {
  fixture: string;
  issue: string;
  invariant: string;
  isPresent: (record: GraphRecord) => boolean;
}

const nodeIds = (record: GraphRecord) => new Set(record.nodes.map(n => n.id));

const hasDanglingEdge = (record: GraphRecord) => {
  const ids = nodeIds(record);
  return record.edges.some(
    edge => !ids.has(edge.source) || !ids.has(edge.target),
  );
};

const hasSelfEdge = (record: GraphRecord) =>
  record.edges.some(edge => edge.source === edge.target);

const hasDuplicateNodeIds = (record: GraphRecord) =>
  nodeIds(record).size !== record.nodes.length;

const hasNoNodeIcons = (record: GraphRecord) =>
  record.nodes.length > 0 &&
  record.nodes.every(node => node.icon === NOT_YET_POPULATED);

const hasNoStatusBadges = (record: GraphRecord) =>
  record.nodes.length > 0 &&
  record.nodes.every(node => node.statusBadge === NOT_YET_POPULATED);

export const knownGraphDefects: KnownGraphDefect[] = [
  {
    fixture: 'missing-target',
    issue: '#353',
    invariant: 'every edge endpoint resolves to a node',
    isPresent: hasDanglingEdge,
  },
  {
    fixture: 'unparseable-connection',
    issue: '#353',
    invariant: 'every edge endpoint resolves to a node',
    isPresent: hasDanglingEdge,
  },
  {
    fixture: 'self-reference',
    issue: '#357',
    invariant: 'no edge points at its own source',
    isPresent: hasSelfEdge,
  },
  {
    fixture: 'duplicate-ids',
    issue: '#357',
    invariant: 'node ids are unique',
    isPresent: hasDuplicateNodeIds,
  },
  {
    fixture: 'multi-tier',
    issue: '#35',
    invariant: 'distinct resource types carry distinct icons',
    isPresent: hasNoNodeIcons,
  },
  {
    fixture: 'deploy-status-matrix',
    issue: '#89',
    invariant: 'distinct deployment statuses carry status badges',
    isPresent: hasNoStatusBadges,
  },
];

/**
 * The record deliberately holds no coordinates. Whatever the graph is migrated
 * to will lay out with different node dimensions and different engine settings,
 * so recording positions would change every fixture at once and force a blanket
 * approval - exactly the moment a real regression would slip through. Layout is
 * covered by renderer-independent assertions instead: GU-09 requires finite
 * positions and GU-09a requires non-overlapping nodes.
 */
export function normalizeGraphModel(model: GraphModel): GraphRecord {
  return {
    nodes: model.nodes
      .map((node): GraphRecordNode => ({
        id: node.id,
        label: node.label,
        type: node.type,
        icon: node.icon ?? NOT_YET_POPULATED,
        statusBadge: node.statusBadge ?? NOT_YET_POPULATED,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: model.edges
      .map(edge => ({
        source: edge.source,
        target: edge.target,
        direction: 'source-to-target' as const,
      }))
      .sort((left, right) =>
        `${left.source}\0${left.target}`.localeCompare(
          `${right.source}\0${right.target}`,
        ),
      ),
  };
}

export function createGraphRecord(graph: AppGraph): GraphRecord {
  return normalizeGraphModel(buildLayoutedGraphModel(graph));
}

export function findUnapprovedGraphRecordChanges(
  changes: GraphRecordFieldChange[],
  manifest: GraphRecordChange[],
): GraphRecordFieldChange[] {
  const approved = new Set(
    manifest.map(change =>
      JSON.stringify({
        fixture: change.fixture,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      }),
    ),
  );
  return changes.filter(change => !approved.has(JSON.stringify(change)));
}

export function diffGraphRecords(
  fixture: string,
  baseline: GraphRecord,
  current: GraphRecord,
): GraphRecordFieldChange[] {
  const changes: GraphRecordFieldChange[] = [];
  const serialize = (value: unknown) =>
    value === undefined ? '<absent>' : JSON.stringify(value);

  const visit = (field: string, oldValue: unknown, newValue: unknown) => {
    if (
      oldValue !== null &&
      newValue !== null &&
      typeof oldValue === 'object' &&
      typeof newValue === 'object'
    ) {
      const keys = new Set([
        ...Object.keys(oldValue),
        ...Object.keys(newValue),
      ]);
      for (const key of [...keys].sort()) {
        visit(
          field ? `${field}.${key}` : key,
          (oldValue as Record<string, unknown>)[key],
          (newValue as Record<string, unknown>)[key],
        );
      }
      return;
    }

    if (serialize(oldValue) !== serialize(newValue)) {
      changes.push({
        fixture,
        field,
        oldValue: serialize(oldValue),
        newValue: serialize(newValue),
      });
    }
  };

  visit('', baseline, current);
  return changes;
}

export function findCarriedForwardGraphDefects(
  records: Record<string, GraphRecord>,
  knownDefects: KnownGraphDefect[],
): KnownGraphDefect[] {
  return knownDefects.filter(defect => {
    const record = records[defect.fixture];
    if (!record) {
      throw new Error(
        `Known defect ${defect.issue} names fixture "${defect.fixture}", which has no graph record`,
      );
    }
    return defect.isPresent(record);
  });
}
