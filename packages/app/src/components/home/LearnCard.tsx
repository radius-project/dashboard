import { InfoCard, LinkButton } from '@backstage/core-components';
import { CardActions, Typography } from '@material-ui/core';

import React from 'react';

const actions = () => (
  <CardActions>
    <LinkButton
      size="small"
      variant="text"
      to="https://docs.radapp.io/getting-started/"
    >
      Get Started
    </LinkButton>
    <LinkButton
      size="small"
      variant="text"
      to="https://docs.radapp.io/tutorials/new-app/"
    >
      Tutorials
    </LinkButton>
    <LinkButton
      size="small"
      variant="text"
      to="https://docs.radapp.io/reference/resource-schema/overview/"
    >
      Reference
    </LinkButton>
  </CardActions>
);

export const LearnCard = ({ className }: { className?: string }) => (
  <InfoCard
    title="Learn more"
    subheader="Discover documentation, tutorials, and reference materials"
    className={className}
    actions={actions()}
  >
    <Typography variant="body1">
      Radius is an open-source, cloud-native, application platform that enables
      developers and the operators that support them to define, deploy, and
      collaborate on cloud-native applications across public clouds and private
      infrastructure
    </Typography>
  </InfoCard>
);

export default LearnCard;
