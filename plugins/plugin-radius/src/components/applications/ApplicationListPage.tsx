import React from 'react';
import { Grid } from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { ResourceTable } from '../resourcetable';

export const ApplicationListPage = () => (
  <Page themeId="radius-application-list">
    <Header title="Applications" subtitle="Displaying deployed applications." />
    <Content>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <ResourceTable
            title="Applications"
            resourceType="Applications.Core/applications"
          />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
