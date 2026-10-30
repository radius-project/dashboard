import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigReader } from '@backstage/config';
import { createApp } from '@backstage/frontend-defaults';
import radius from '@internal/plugin-radius/alpha';
import kubernetes from '@backstage/plugin-kubernetes/alpha';

const app = createApp({
  features: [radius, kubernetes],
  advanced: {
    configLoader: async () => ({
      config: new ConfigReader({
        app: {
          title: 'External native host',
          baseUrl: `${window.location.origin}${window.location.pathname.startsWith('/nested/') ? '/nested' : ''}`,
          extensions: [{ 'sign-in-page:app': false }],
        },
        backend: { baseUrl: window.location.origin },
      }),
    }),
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(app.createRoot());
