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
import { withRadiusTheme } from '../../appearance';
import { useRouteRef } from '@backstage/core-plugin-api';
import { environmentListPageRouteRef } from '../../routes';

export const ApplicationListPage = withRadiusTheme(() => {
  const environmentsRoute = useRouteRef(environmentListPageRouteRef);
  return (
    <Page themeId="radius-application-list">
      <Header
        title="Applications"
        subtitle="Displaying deployed applications."
      />
      <Content>
        <Box mb={3}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to="/">Home</Link>
            <Link to={environmentsRoute()}>Environments</Link>
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
});
