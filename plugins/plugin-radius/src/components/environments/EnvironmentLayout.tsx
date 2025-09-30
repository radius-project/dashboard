import { Content, Header, Page, Breadcrumbs, Link } from '@backstage/core-components';
import { useRouteRefParams } from '@backstage/core-plugin-api';
import { Grid, Typography, Box } from '@material-ui/core';
import React, { PropsWithChildren } from 'react';
import { environmentPageRouteRef } from '../../routes';
import { Resource, EnvironmentProperties } from '../../resources';

export const EnvironmentLayout = (
  props: PropsWithChildren<{ environment: Resource<EnvironmentProperties> }>,
) => {
  const params = useRouteRefParams(environmentPageRouteRef);

  return (
    <Page themeId="radius-environment-details">
      <Header
        title="Environment"
        subtitle={`Displaying details for ${params.namespace}/${params.type}: ${params.name}`}
      />
      <Content>
        <Box mb={3}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to="/">Home</Link>
            <Link to="/environments">Environments</Link>
            <Typography>{props.environment.name}</Typography>
          </Breadcrumbs>
        </Box>
        <Grid container spacing={3} direction="column">
          {props.children}
        </Grid>
      </Content>
    </Page>
  );
};