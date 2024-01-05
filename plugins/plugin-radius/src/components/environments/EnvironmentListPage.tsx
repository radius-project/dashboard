import React from 'react';
import { Grid } from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { ResourceTable } from '../resourcetable';

export const EnvironmentListPage = () => (
  <Page themeId="radius-environment-list">
    <Header
      title="Environments"
      subtitle="Displaying environments where applications can be deployed."
    />
    <Content>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <ResourceTable
            title="Environments"
            resourceType="Applications.Core/environments"
          />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
