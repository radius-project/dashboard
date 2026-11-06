import { LinkButton } from '@backstage/core-components';
import { CardActions, Typography } from '@material-ui/core';

import React from 'react';
import { CollapsibleInfoCard } from './CollapsibleInfoCard';

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

export const SupportCard = ({ className }: { className?: string }) => (
  <CollapsibleInfoCard
    cardId="support"
    title="Get help with Radius"
    subheader="Report issues or ask other users for help"
    className={className}
    actions={actions()}
  >
    <Typography variant="body1">
      Participate in discussions, forums, and chat channels related to Radius.
      Seek guidance, offer help to others, and build connections within the
      community.
    </Typography>
  </CollapsibleInfoCard>
);

export default SupportCard;
