import { Content, Header, Page } from '@backstage/core-components';
import { Grid } from '@material-ui/core';
import React, { PropsWithChildren } from 'react';
import { Resource } from '../../resources';

export const ResourceLayout = (
  props: PropsWithChildren<{ resource: Resource }>,
) => {
  return (
    <Page themeId="radius-resource-details">
      <Header
        title="Resource"
        subtitle={`Displaying details for ${props.resource.type}: ${props.resource.name}`}
      />
      <Content>
        <Grid container spacing={3} direction="column">
          {props.children}
        </Grid>
      </Content>
    </Page>
  );
};
