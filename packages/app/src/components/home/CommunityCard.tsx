import { InfoCard, LinkButton } from '@backstage/core-components';
import { CardActions, Typography } from '@material-ui/core';

import React from 'react';

const actions = () => (
  <CardActions>
    <LinkButton
      size="small"
      variant="text"
      to="https://github.com/radius-project/radius"
    >
      Visit on Github
    </LinkButton>
    <LinkButton
      size="small"
      variant="text"
      to="https://github.com/radius-project/radius/issues?q=is:issue+is:open+label:%22good+first+issue%22"
    >
      Good first issues
    </LinkButton>
    <LinkButton size="small" variant="text" to="">
      Join us on Discord
    </LinkButton>
  </CardActions>
);

export const CommunityCard = () => (
  <InfoCard
    title="Join the community"
    subheader="Find ways to participate and contribute"
    actions={actions()}
  >
    <Typography variant="body1">
      We welcome and encourage users to contribute to the Radius open-source
      project in various ways. By joining our community, you can make a
      meaningful impact and help shape the future of this project.
    </Typography>
  </InfoCard>
);

export default CommunityCard;
