import React from 'react';
import { EnvironmentProperties, Resource } from '../../resources';
import { InfoCard } from '@backstage/core-components';
import { Box, Grid, Typography } from '@material-ui/core';
import { parseResourceId } from '@radapp.io/rad-components';

export const EnvironmentDetailsTable = (props: {
  environment: Resource<EnvironmentProperties>;
}) => {
  const { environment } = props;
  const properties = environment.properties;

  // Helper function to determine environment kind
  const getEnvironmentKind = (): string => {
    if (!properties?.providers) {
      return 'Kubernetes';
    }

    if (properties.providers.azure) {
      return 'Azure';
    }

    if (properties.providers.aws) {
      return 'AWS';
    }

    return 'Kubernetes';
  };

  const extractSubscriptionId = (scope: string): string | undefined => {
    // Azure scopes typically follow the pattern: /subscriptions/{subscription-id}/...
    const match = scope.match(/\/subscriptions\/([^/]+)/i);
    return match?.[1];
  };

  const extractResourceGroup = (scope: string): string | undefined => {
    // Azure scopes typically follow the pattern: /subscriptions/{subscription-id}/resourceGroups/{resource-group}/...
    const match = scope.match(/\/resourceGroups\/([^/]+)/i);
    return match?.[1];
  };

  const extractAwsAccountId = (scope: string): string | undefined => {
    // AWS scopes follow the pattern: /planes/aws/aws/accounts/{account-id}/regions/{region}
    const match = scope.match(/\/accounts\/(\d+)\//i);
    return match?.[1];
  };

  const extractAwsRegion = (scope: string): string | undefined => {
    // AWS scopes follow the pattern: /planes/aws/aws/accounts/{account-id}/regions/{region}
    const match = scope.match(/\/regions\/([^/]+)/i);
    return match?.[1];
  };

  const kind = getEnvironmentKind();
  const namespace = properties?.compute?.namespace || 'default';

  // Get provider information
  const providerInfo: { label: string; value: string }[] = [];
  let hasProviderInfo = false;

  if (kind === 'Azure' && properties?.providers?.azure) {
    const azure = properties.providers.azure;

    // Get subscription ID from explicit field or parse from scope
    let subscriptionId = azure.subscriptionId;
    if (!subscriptionId && azure.scope) {
      subscriptionId = extractSubscriptionId(azure.scope);
    }

    // Get resource group from explicit field or parse from scope
    let resourceGroup = azure.resourceGroup;
    if (!resourceGroup && azure.scope) {
      resourceGroup = extractResourceGroup(azure.scope);
    }

    if (subscriptionId) {
      providerInfo.push({
        label: 'Azure Subscription ID',
        value: subscriptionId,
      });
      hasProviderInfo = true;
    }
    if (resourceGroup) {
      providerInfo.push({
        label: 'Azure Resource Group',
        value: resourceGroup,
      });
      hasProviderInfo = true;
    }
  } else if (kind === 'AWS' && properties?.providers?.aws) {
    const aws = properties.providers.aws;

    // Get account ID from explicit field or parse from scope
    let accountId = aws.accountId;
    if (!accountId && aws.scope) {
      accountId = extractAwsAccountId(aws.scope);
    }

    // Get region from explicit field or parse from scope
    let region = aws.region;
    if (!region && aws.scope) {
      region = extractAwsRegion(aws.scope);
    }

    if (accountId) {
      providerInfo.push({ label: 'AWS Account ID', value: accountId });
      hasProviderInfo = true;
    }
    if (region) {
      providerInfo.push({ label: 'AWS Region', value: region });
      hasProviderInfo = true;
    }
  }

  const resourceGroup = parseResourceId(environment.id)?.group || '';
  const title = `${resourceGroup} / ${environment.name}`;

  return (
    <InfoCard title={title}>
      <Grid container spacing={3}>
        {/* Left Column - Kubernetes Information */}
        <Grid item xs={6}>
          <Box mb={2}>
            <Typography variant="body2" color="textSecondary">
              Kubernetes Cluster
            </Typography>
            <Typography variant="body1">
              Radius control plane cluster
            </Typography>
          </Box>
          <Box mb={2}>
            <Typography variant="body2" color="textSecondary">
              Kubernetes Namespace
            </Typography>
            <Typography variant="body1">{namespace}</Typography>
          </Box>
        </Grid>

        {/* Right Column - Provider Information */}
        <Grid item xs={6}>
          <Box style={{ opacity: hasProviderInfo ? 1 : 0.5 }}>
            {hasProviderInfo ? (
              providerInfo.map((info, index) => (
                <Box key={index} mb={2}>
                  <Typography variant="body2" color="textSecondary">
                    {info.label}
                  </Typography>
                  <Typography variant="body1">{info.value}</Typography>
                </Box>
              ))
            ) : (
              <Box mb={2}>
                <Typography variant="body2" color="textSecondary">
                  No cloud provider configured
                </Typography>
                <Typography variant="body1" color="textSecondary">
                  —
                </Typography>
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>
    </InfoCard>
  );
};
