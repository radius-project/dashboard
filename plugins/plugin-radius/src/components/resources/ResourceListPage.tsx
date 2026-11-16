import React from 'react';
import { Grid } from '@material-ui/core';
import { Header, Page, Content } from '@backstage/core-components';
import { ResourceTable } from '../resourcetable';
import { withRadiusPage } from '../../connection';

export const ResourceListPage = withRadiusPage(() => (
  <Page themeId="radius-resource-list">
    <Header title="Resources" subtitle="Displaying deployed resources." />
    <Content>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <ResourceTable title="Resources" />
        </Grid>
      </Grid>
    </Content>
  </Page>
));
