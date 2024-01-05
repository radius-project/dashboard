import { HomePageCompanyLogo } from '@backstage/plugin-home';
import { Grid, makeStyles } from '@material-ui/core';
import React from 'react';
import { SearchContextProvider } from '@backstage/plugin-search-react';
import { Content, InfoCard, Page } from '@backstage/core-components';
import { RadiusLogo } from '@internal/plugin-radius';
import LearnCard from './LearnCard';
import CommunityCard from './CommunityCard';
import SupportCard from './SupportCard';

const useLogoStyles = makeStyles(theme => ({
  container: {
    margin: theme.spacing(5, 0),
  },
  svg: {
    width: 'auto',
    height: 100,
  },
}));

export const HomePage = () => {
  const { container, svg } = useLogoStyles();

  return (
    <SearchContextProvider>
      <Page themeId="home">
        <Content>
          <Grid container justifyContent="center" spacing={6}>
            <HomePageCompanyLogo
              className={container}
              logo={<RadiusLogo className={svg} />}
            />
            <Grid container item xs={12}>
              <Grid item xs={8} md={4}>
                <LearnCard />
              </Grid>
              <Grid item xs={8} md={4}>
                <CommunityCard />
              </Grid>
              <Grid item xs={8} md={4}>
                <SupportCard />
              </Grid>
            </Grid>
            <Grid container item xs={12}>
              <Grid item xs={12} md={6}>
                <InfoCard title="Applications">
                  Applications are great.
                  {/* placeholder for content */}
                  <div style={{ height: 250 }} />
                </InfoCard>
              </Grid>
              <Grid item xs={12} md={6}>
                <InfoCard title="Environments">
                  You&apos;re going to need some enviornments. Trust us.
                  {/* placeholder for content */}
                  <div style={{ height: 250 }} />
                </InfoCard>
              </Grid>
            </Grid>
          </Grid>
        </Content>
      </Page>
    </SearchContextProvider>
  );
};
