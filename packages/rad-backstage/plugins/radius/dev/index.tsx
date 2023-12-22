import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { radiusPlugin, EnvironmentPage } from '../src/plugin';

createDevApp()
  .registerPlugin(radiusPlugin)
  .addPage({
    element: <EnvironmentPage />,
    title: 'Root Page',
    path: '/radius'
  })
  .render();
