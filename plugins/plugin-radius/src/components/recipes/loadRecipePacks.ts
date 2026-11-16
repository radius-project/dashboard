import { QueryFailure } from '@radius-project/core/domain';
import { RadiusApi } from '../../api';
import { RecipePackProperties, Resource } from '../../resources';

export async function loadRecipePacks(
  api: Pick<RadiusApi, 'getResourceById'>,
  packIds: Iterable<string>,
) {
  const requested = Array.from(new Set(packIds));
  const results = await Promise.allSettled(
    requested.map(id => api.getResourceById<RecipePackProperties>({ id })),
  );
  const packsById: Record<string, Resource<RecipePackProperties>> = {};
  const errors: QueryFailure[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      packsById[result.value.id] = result.value;
    } else {
      errors.push({ resourceId: requested[index], error: result.reason });
    }
  }

  return { packsById, errors };
}
