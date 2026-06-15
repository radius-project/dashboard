import { Content, Header, Page } from '@backstage/core-components';
import { useRouteRefParams } from '@backstage/core-plugin-api';
import { Grid } from '@material-ui/core';
import React, { PropsWithChildren } from 'react';
import { resourcePageRouteRef } from '../../routes';
import { Resource } from '../../resources';

export const ResourceLayout = (
  props: PropsWithChildren<{ resource: Resource }>,
) => {
  const params = useRouteRefParams(resourcePageRouteRef);

  return (
    <Page themeId="radius-resource-details">
      <Header
        title="Resource"
        subtitle={`Displaying details for ${params.namespace}/${params.type}: ${params.name}`}
      />
      <Content>
        <Grid container spacing={3} direction="column">
          {props.children}
        </Grid>
      </Content>
    </Page>
  );
};
