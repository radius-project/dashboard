import React from 'react';
import { ResponseErrorPanel, WarningPanel } from '@backstage/core-components';
import { RadiusListResult } from '../../api';

export function ResourceQueryResult({
  result,
  children,
}: {
  result?: Pick<RadiusListResult, 'complete' | 'errors'> & {
    value: readonly unknown[];
  };
  children: React.ReactNode;
}) {
  const incomplete = result?.complete === false || !!result?.errors?.length;
  if (!incomplete) {
    return <>{children}</>;
  }

  const failures =
    result?.errors?.map(failure => {
      let reason = 'Request failed.';
      if (failure.error instanceof Error) {
        reason = failure.error.message;
      } else if (typeof failure.error === 'string') {
        reason = failure.error;
      }
      return `${failure.resourceType || failure.resourceId || 'Radius request'}: ${reason}`;
    }) ?? [];

  if (!result?.value.length) {
    return (
      <ResponseErrorPanel
        error={
          new Error(
            `No Radius inventory data is available. Some Radius requests failed.\n${failures.join('\n')}`,
          )
        }
      />
    );
  }

  return (
    <>
      <WarningPanel title="Incomplete Radius inventory">
        Some Radius requests failed. The list can be incomplete.
        <ul>
          {failures.map((failure, index) => (
            <li key={`${index}-${failure}`}>{failure}</li>
          ))}
        </ul>
      </WarningPanel>
      {children}
    </>
  );
}
