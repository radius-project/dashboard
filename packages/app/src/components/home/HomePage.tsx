import { HomePageCompanyLogo } from '@backstage/plugin-home';
import { Grid, makeStyles } from '@material-ui/core';
import React from 'react';
import { Content, Page } from '@backstage/core-components';
import {
  ApplicationListInfoCard,
  EnvironmentListInfoCard,
  RadiusLogo,
} from '@internal/plugin-radius';
import LearnCard from './LearnCard';
import CommunityCard from './CommunityCard';
import SupportCard from './SupportCard';

const useStyles = makeStyles(theme => ({
  container: {
    margin: theme.spacing(5, 0),
  },
  infoCard: {
    height: '100%',
  },
  svg: {
    width: 'auto',
    height: 100,
  },
}));

export const HomePage = () => {
  const { container, infoCard, svg } = useStyles();

  return (
    <Page themeId="home">
      <Content>
        <Grid container justifyContent="center" spacing={6}>
          <HomePageCompanyLogo
            className={container}
            logo={<RadiusLogo className={svg} />}
          />
          <Grid container item xs={12}>
            <Grid item xs={8} md={4}>
              <LearnCard className={infoCard} />
            </Grid>
            <Grid item xs={8} md={4}>
              <CommunityCard className={infoCard} />
            </Grid>
            <Grid item xs={8} md={4}>
              <SupportCard className={infoCard} />
            </Grid>
          </Grid>
          <Grid container item xs={12}>
            <Grid item xs={12} md={6}>
              <ApplicationListInfoCard />
            </Grid>
            <Grid item xs={12} md={6}>
              <EnvironmentListInfoCard />
            </Grid>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
