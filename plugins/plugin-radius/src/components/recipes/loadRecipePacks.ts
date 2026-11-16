import { QueryFailure } from '@radius-project/core/domain';
import { RadiusApi } from '../../api';
import { RecipePackProperties, Resource } from '../../resources';

export async function loadRecipePacks(
  api: Pick<RadiusApi, 'getResourceById'>,
  packIds: Iterable<string>,
  previous?: Record<string, Resource<RecipePackProperties>>,
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

  if (
    errors.length > 0 &&
    errors.length === requested.length &&
    Object.keys(previous ?? {}).length > 0
  ) {
    throw new Error(
      `Recipe-pack refresh failed.\n${errors
        .map(
          failure =>
            `${failure.resourceId}: ${
              failure.error instanceof Error
                ? failure.error.message
                : String(failure.error)
            }`,
        )
        .join('\n')}`,
    );
  }

  return { packsById, errors };
}
