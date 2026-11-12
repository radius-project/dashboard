import React from 'react';
import type { SignInPageProps } from '@backstage/core-plugin-api';

export const basePath =
  document
    .querySelector('meta[name="host-base-path"]')
    ?.getAttribute('content') ??
  (window.location.pathname.startsWith('/nested/') ? '/nested' : '');
export const mountPath =
  document
    .querySelector('meta[name="plugin-mount-path"]')
    ?.getAttribute('content') ?? '';
export const installed =
  document.querySelector('meta[name="installed-host"]') !== null;

// This identity belongs to the fixture host, not to the Radius plugin. It is
// deliberately not a guest sign-in or a claim about production authorization.
const hostIdentity = {
  getUserId: () => 'installed-host-user',
  getIdToken: async () => 'radius-installed-host-fixture',
  getProfile: () => ({ displayName: 'Installed host user' }),
  getProfileInfo: async () => ({ displayName: 'Installed host user' }),
  getBackstageIdentity: async () => ({
    type: 'user' as const,
    userEntityRef: 'user:default/installed-host',
    ownershipEntityRefs: ['user:default/installed-host'],
  }),
  getCredentials: async () => ({ token: 'radius-installed-host-fixture' }),
  signOut: async () => {},
};

export function HostSignIn({ onSignInSuccess }: SignInPageProps) {
  return React.createElement(
    'button',
    { onClick: () => onSignInSuccess(hostIdentity) },
    'Sign in to qualification host',
  );
}
