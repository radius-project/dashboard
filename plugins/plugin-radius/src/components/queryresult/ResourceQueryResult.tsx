import React from 'react';
import {
  Progress,
  ResponseErrorPanel,
  WarningPanel,
} from '@backstage/core-components';
import { Button } from '@material-ui/core';
import { RadiusListResult } from '../../api';

export function ResourceQueryResult({
  result,
  loading = false,
  error,
  retry,
  children,
}: {
  result?: Pick<RadiusListResult, 'complete' | 'errors'> & {
    value: readonly unknown[];
  };
  loading?: boolean;
  error?: Error;
  retry?: () => void;
  children: React.ReactNode;
}) {
  const incomplete = result?.complete === false || !!result?.errors?.length;
  const hasData = !!result?.value.length;
  const retryAction = retry && (
    <Button onClick={retry} disabled={loading}>
      Retry inventory
    </Button>
  );
  const progress = loading && (
    <div role="status" aria-label="Loading Radius inventory">
      <Progress data-testid="progress" />
      {hasData && 'Refreshing Radius inventory. Available data is shown below.'}
    </div>
  );

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

  const displayError =
    error ??
    (incomplete && !hasData
      ? new Error(
          `No Radius inventory data is available. Some Radius requests failed.\n${failures.join('\n')}`,
        )
      : undefined);

  return (
    <>
      {progress}
      {displayError && <ResponseErrorPanel error={displayError} />}
      {error && hasData && (
        <WarningPanel title="Radius inventory is out of date">
          The refresh failed. Previously loaded data is shown below and can be
          incomplete.
        </WarningPanel>
      )}
      {!error && incomplete && hasData && (
        <WarningPanel title="Incomplete Radius inventory">
          Some Radius requests failed. The list can be incomplete.
          <ul>
            {failures.map((failure, index) => (
              <li key={`${index}-${failure}`}>{failure}</li>
            ))}
          </ul>
        </WarningPanel>
      )}
      {(displayError || incomplete) && retryAction}
      {(!displayError || hasData) && (!loading || !!result) && children}
    </>
  );
}
