import React from 'react';
import { ApplicationListPage } from './ApplicationListPage';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ApplicationProperties, ResourceList } from '../../resources';

describe('ApplicationListPage', () => {
  // Rendering an empty table is fine for now, we have good unit tests for the
  // table logic elsewhere.
  it('should render table', async () => {
    const api: Pick<RadiusApi, 'listResources'> = {
      listResources: async <T = ApplicationProperties,>() =>
        Promise.resolve<ResourceList<T>>({
          value: [],
        }),
    };

    await renderInTestApp(
      <TestApiProvider apis={[[radiusApiRef, api]]}>
        <ApplicationListPage />
      </TestApiProvider>,
    );
    expect(
      screen.getByText('Displaying deployed applications.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // Header + empty row
    const [header] = rows;

    // Verify correct headings (we had headings that will never be shown for an application)
    const expectedColumns = [
      'Name',
      'Resource Group',
      'Type',
      'Environment',
      'Status',
    ];
    const headings = header.querySelectorAll('th');
    expect(headings).toHaveLength(expectedColumns.length);
    headings.forEach((heading, index) => {
      expect(heading).toHaveTextContent(expectedColumns[index]);
    });
  });
});
