import { AppGraph as SharedAppGraph } from '@radius-project/graph-react/compat';
import { ResourceNode as SharedResourceNode } from '@radius-project/graph-react/compat/reactflow11';
import { parseLegacyResourceId } from '@radius-project/core/domain';
import { AppGraph, ResourceNode, parseResourceId } from '../../../index';

describe('PU-29: forwarding public exports', () => {
  it('forwards the exact canonical renderer, legacy node and parser functions', () => {
    expect(AppGraph).toBe(SharedAppGraph);
    expect(ResourceNode).toBe(SharedResourceNode);
    expect(parseResourceId).toBe(parseLegacyResourceId);
  });
});
