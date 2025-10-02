import React from 'react';
import { render, screen } from '@testing-library/react';
import { EnvironmentDetailsTable } from './EnvironmentDetailsTable';
import { Resource, EnvironmentProperties } from '../../resources';

describe('EnvironmentDetailsTable', () => {
  it('should render Kubernetes environment details', () => {
    const kubernetesEnv: Resource<EnvironmentProperties> = {
      id: '/planes/radius/local/resourceGroups/default/providers/Applications.Core/environments/k8s-env',
      type: 'Applications.Core/environments',
      name: 'k8s-env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {},
        compute: {
          namespace: 'my-namespace',
        },
      },
    };

    render(<EnvironmentDetailsTable environment={kubernetesEnv} />);

    expect(screen.getByText('default / k8s-env')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes Cluster')).toBeInTheDocument();
    expect(screen.getByText('Radius control plane cluster')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes Namespace')).toBeInTheDocument();
    expect(screen.getByText('my-namespace')).toBeInTheDocument();
    expect(screen.getByText('No cloud provider configured')).toBeInTheDocument();
  });

  it('should render Azure environment details with subscription and resource group', () => {
    const azureEnv: Resource<EnvironmentProperties> = {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/azure-env',
      type: 'Applications.Core/environments',
      name: 'azure-env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {},
        compute: {
          namespace: 'azure-namespace',
        },
        providers: {
          azure: {
            scope: '/subscriptions/12345678-1234-1234-1234-123456789012/resourceGroups/my-resource-group',
          },
        },
      },
    };

    render(<EnvironmentDetailsTable environment={azureEnv} />);

    expect(screen.getByText('test-group / azure-env')).toBeInTheDocument();
    expect(screen.getByText('azure-namespace')).toBeInTheDocument();
    expect(screen.getByText('Azure Subscription ID')).toBeInTheDocument();
    expect(screen.getByText('12345678-1234-1234-1234-123456789012')).toBeInTheDocument();
    expect(screen.getByText('Azure Resource Group')).toBeInTheDocument();
    expect(screen.getByText('my-resource-group')).toBeInTheDocument();
  });

  it('should render Azure environment with explicit subscription and resource group fields', () => {
    const azureEnv: Resource<EnvironmentProperties> = {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/azure-env',
      type: 'Applications.Core/environments',
      name: 'azure-env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {},
        compute: {
          namespace: 'default',
        },
        providers: {
          azure: {
            subscriptionId: 'explicit-sub-id',
            resourceGroup: 'explicit-rg',
          },
        },
      },
    };

    render(<EnvironmentDetailsTable environment={azureEnv} />);

    expect(screen.getByText('Azure Subscription ID')).toBeInTheDocument();
    expect(screen.getByText('explicit-sub-id')).toBeInTheDocument();
    expect(screen.getByText('Azure Resource Group')).toBeInTheDocument();
    expect(screen.getByText('explicit-rg')).toBeInTheDocument();
  });

  it('should render AWS environment details with account and region', () => {
    const awsEnv: Resource<EnvironmentProperties> = {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/aws-env',
      type: 'Applications.Core/environments',
      name: 'aws-env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {},
        compute: {
          namespace: 'aws-namespace',
        },
        providers: {
          aws: {
            scope: '/planes/aws/aws/accounts/123456789012/regions/us-west-2',
          },
        },
      },
    };

    render(<EnvironmentDetailsTable environment={awsEnv} />);

    expect(screen.getByText('test-group / aws-env')).toBeInTheDocument();
    expect(screen.getByText('aws-namespace')).toBeInTheDocument();
    expect(screen.getByText('AWS Account ID')).toBeInTheDocument();
    expect(screen.getByText('123456789012')).toBeInTheDocument();
    expect(screen.getByText('AWS Region')).toBeInTheDocument();
    expect(screen.getByText('us-west-2')).toBeInTheDocument();
  });

  it('should render AWS environment with explicit account and region fields', () => {
    const awsEnv: Resource<EnvironmentProperties> = {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/aws-env',
      type: 'Applications.Core/environments',
      name: 'aws-env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {},
        compute: {
          namespace: 'default',
        },
        providers: {
          aws: {
            accountId: '987654321098',
            region: 'eu-west-1',
          },
        },
      },
    };

    render(<EnvironmentDetailsTable environment={awsEnv} />);

    expect(screen.getByText('AWS Account ID')).toBeInTheDocument();
    expect(screen.getByText('987654321098')).toBeInTheDocument();
    expect(screen.getByText('AWS Region')).toBeInTheDocument();
    expect(screen.getByText('eu-west-1')).toBeInTheDocument();
  });

  it('should use default namespace when compute.namespace is not provided', () => {
    const env: Resource<EnvironmentProperties> = {
      id: '/planes/radius/local/resourceGroups/test-group/providers/Applications.Core/environments/env',
      type: 'Applications.Core/environments',
      name: 'env',
      systemData: {},
      properties: {
        provisioningState: 'Succeeded',
        recipes: {},
      },
    };

    render(<EnvironmentDetailsTable environment={env} />);

    expect(screen.getByText('default')).toBeInTheDocument();
  });
});
