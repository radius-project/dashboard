import { createApiRef } from '@backstage/core-plugin-api';
import type { RadiusApi } from './api';

export const radiusApiRef = createApiRef<RadiusApi>({
  id: 'radius-api',
});
