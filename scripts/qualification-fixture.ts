import fs from 'node:fs';
import path from 'node:path';

export function radiusFixtureResponse(url: string): unknown {
  const applicationId =
    '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/applications/packed-app';
  const environmentId =
    '/planes/radius/local/resourceGroups/demo/providers/Applications.Core/environments/demo';
  const application = {
    id: applicationId,
    name: 'packed-app',
    type: 'Applications.Core/applications',
    properties: { environment: environmentId },
  };
  const environment = {
    id: environmentId,
    name: 'demo',
    type: 'Applications.Core/environments',
    properties: {},
  };
  if (url.endsWith('/clusters')) {
    return {
      items: [{ name: 'packed-cluster', authProvider: 'serviceAccount' }],
    };
  }
  if (url.includes('/getGraph?')) {
    return JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'packages',
          'app',
          'e2e-tests',
          'fixtures',
          'multi-tier.json',
        ),
        'utf8',
      ),
    );
  }
  if (url.includes('/resourceTypes/applications?')) {
    return {
      Name: 'applications',
      Description: 'Applications',
      ResourceProviderNamespace: 'Applications.Core',
      APIVersions: { '2025-01-01': {} },
      APIVersionList: ['2025-01-01'],
    };
  }
  if (url.includes(`${applicationId}?`)) return application;
  if (url.includes(`${environmentId}?`)) return environment;
  if (url.includes('/Applications.Core/applications?'))
    return { value: [application] };
  if (url.includes('/Applications.Core/environments?'))
    return { value: [environment] };
  return { value: [] };
}
