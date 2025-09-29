import React, { useState } from 'react';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  Link,
} from '@backstage/core-components';
import { Checkbox, FormControlLabel, Box } from '@material-ui/core';
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { radiusApiRef } from '../../plugin';

type RT = {
  id: string;
  name: string;
  type: string;
  properties: {
    namespace: string;
    type: string;
    apiVersion: string;
    apiVersions?: string[];
  };
};

export const ResourceTypesTable = (props: { title: string }) => {
  const [showOtherResourceTypes, setShowOtherResourceTypes] = useState(false);
  const radiusApi = useApi(radiusApiRef);
  const { value, loading, error } = useAsync(async () => {
    // call the API method we added
    return (await radiusApi.listResourceTypes()) as
      | {
          value: RT[];
        }
      | undefined;
  });

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  // Filter resource types based on checkbox state
  // Hide commonly built-in namespaces by default to reduce clutter
  const EXCLUDED_NAMESPACES = ['Applications.', 'Microsoft.'];
  const allData = value?.value || [];
  const filteredData = showOtherResourceTypes
    ? allData
    : allData.filter(rt => {
        const namespace = rt.properties?.namespace ?? '';
        return !EXCLUDED_NAMESPACES.some(prefix =>
          namespace.startsWith(prefix),
        );
      });

  const columns: TableColumn<RT>[] = [
    {
      title: 'Type',
      field: 'properties.type',
      type: 'string',
      render: (row: RT) => (
        <Link
          to={`/resource-types/${encodeURIComponent(
            row.properties.namespace,
          )}/${encodeURIComponent(row.properties.type)}`}
        >
          {row.properties.type}
        </Link>
      ),
    },
    { title: 'Namespace', field: 'properties.namespace', type: 'string' },
    {
      title: 'API Versions',
      field: 'properties.apiVersion',
      type: 'string',
      render: (row: RT) => (
        <div style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
          {row.properties.apiVersion}
        </div>
      ),
    },
  ];

  return (
    <Box>
      <Table
        key={`table-${showOtherResourceTypes}`}
        title={props.title}
        options={{ search: false, paging: false }}
        columns={columns}
        data={filteredData}
      />
      <Box mt={2}>
        <FormControlLabel
          control={
            <Checkbox
              checked={showOtherResourceTypes}
              onChange={e => setShowOtherResourceTypes(e.target.checked)}
              color="primary"
            />
          }
          label={
            <span style={{ color: '#656d76', fontSize: '14px' }}>
              Show all Resource Types
            </span>
          }
        />
      </Box>
    </Box>
  );
};
