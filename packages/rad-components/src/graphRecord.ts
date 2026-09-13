import { AppGraph } from './graph';
import { buildLayoutedGraphModel, GraphModel } from './graphModel';

export interface GraphRecordNode {
  id: string;
  label: string;
  type: string;
  icon: string | null;
  statusBadge: {
    kind: string;
    accessibleName: string;
  } | null;
  position: {
    x: number;
    y: number;
  };
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

export interface KnownGraphDefect {
  fixture: string;
  issue: string;
  fields: string[];
}

export const knownGraphDefects: KnownGraphDefect[] = [
  { fixture: 'missing-target', issue: '#353', fields: ['edges'] },
  { fixture: 'unparseable-connection', issue: '#353', fields: ['edges'] },
  { fixture: 'self-reference', issue: '#357', fields: ['edges'] },
  { fixture: 'duplicate-ids', issue: '#357', fields: ['nodes'] },
  { fixture: 'multi-tier', issue: '#35', fields: ['nodes.icon'] },
  {
    fixture: 'deploy-status-matrix',
    issue: '#89',
    fields: ['nodes.statusBadge'],
  },
];

const POSITION_BUCKET_SIZE = 100;

const quantize = (value: number) =>
  Math.round(value / POSITION_BUCKET_SIZE) * POSITION_BUCKET_SIZE;

export function normalizeGraphModel(model: GraphModel): GraphRecord {
  return {
    nodes: model.nodes
      .map(node => ({
        id: node.id,
        label: node.label,
        type: node.type,
        // The current ResourceNode does not render icons or status badges.
        // Keeping those fields explicit makes their future introduction visible
        // in the extraction record diff instead of silently changing the schema.
        icon: null,
        statusBadge: null,
        position: {
          x: quantize(node.position.x),
          y: quantize(node.position.y),
        },
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

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        fixture,
        field,
        oldValue: JSON.stringify(oldValue),
        newValue: JSON.stringify(newValue),
      });
    }
  };

  visit('', baseline, current);
  return changes;
}

export function findCarriedForwardGraphDefects(
  changedFields: ReadonlySet<string>,
  knownDefects: KnownGraphDefect[],
): KnownGraphDefect[] {
  return knownDefects.filter(defect => {
    const fixtureChanges = [...changedFields]
      .filter(field => field.startsWith(`${defect.fixture}:`))
      .map(field =>
        field.slice(defect.fixture.length + 1).replace(/\.\d+(?=\.|$)/g, ''),
      );
    return defect.fields.every(
      field =>
        !fixtureChanges.some(
          changed => changed === field || changed.startsWith(`${field}.`),
        ),
    );
  });
}
