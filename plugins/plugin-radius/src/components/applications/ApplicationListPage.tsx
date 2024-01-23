import React from 'react';
import { Grid, Typography, Box } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  Breadcrumbs,
  Link,
} from '@backstage/core-components';
import { ResourceTable } from '../resourcetable';

export const ApplicationListPage = () => (
  <Page themeId="radius-application-list">
    <Header title="Applications" subtitle="Displaying deployed applications." />
    <Content>
      <Box mb={3}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link to="/">Home</Link>
          <Link to="/environments">Environments</Link>
          <Typography>Applications</Typography>
        </Breadcrumbs>
      </Box>
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
