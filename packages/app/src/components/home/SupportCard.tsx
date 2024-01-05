import { InfoCard, LinkButton } from '@backstage/core-components';
import { CardActions, Typography } from '@material-ui/core';

import React from 'react';

const actions = () => (
  <CardActions>
    <LinkButton
      size="small"
      variant="text"
      to="https://discord.com/channels/1113519723347456110/1115302284356767814"
    >
      Ask a Question
    </LinkButton>
    <LinkButton
      size="small"
      variant="text"
      to="https://github.com/radius-project/radius/issues/new/choose"
    >
      Report an Issue
    </LinkButton>
  </CardActions>
);

export const SupportCard = () => (
  <InfoCard
    title="Get help with Radius"
    subheader="Report issues or ask other users for help"
    actions={actions()}
  >
    <Typography variant="body1">
      Participate in discussions, forums, and chat channels related to Radius.
      Seek guidance, offer help to others, and build connections within the
      community.
    </Typography>
  </InfoCard>
);

export default SupportCard;
