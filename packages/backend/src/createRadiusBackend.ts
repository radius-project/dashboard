import { createBackend } from '@backstage/backend-defaults';

export function createRadiusBackend() {
  const backend = createBackend();
  backend.add(import('@backstage/plugin-app-backend'));
  backend.add(import('@backstage/plugin-proxy-backend'));
  backend.add(import('@backstage/plugin-auth-backend'));
  backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
  backend.add(import('@backstage/plugin-catalog-backend'));
  backend.add(import('@backstage/plugin-kubernetes-backend'));
  return backend;
}
