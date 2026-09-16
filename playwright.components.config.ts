/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from '@playwright/test';

/**
 * The rad-components browser suite renders components in Storybook. It has no
 * dependency on the Backstage app, so it gets its own config rather than sharing
 * the app's: under the root config every component run also started the app dev
 * server, and PLAYWRIGHT_URL/PLAYWRIGHT_DISABLE_WEBSERVER — which describe where
 * the *app* is served — silently applied to a suite that never visits it.
 */
const storybookUrl =
  process.env.PLAYWRIGHT_STORYBOOK_URL ?? 'http://127.0.0.1:6006';
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './packages/rad-components/e2e-tests',

  timeout: 60_000,

  expect: {
    timeout: 5_000,
  },

  // Nothing else ever serves Storybook, so it is always spawned.
  // reuseExistingServer keeps a host a developer already started from being
  // spawned twice.
  webServer: [
    {
      command:
        'yarn workspace @radapp.io/rad-components storybook --ci --no-open',
      url: `${storybookUrl}/iframe.html`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['html', { open: 'never', outputFolder: './logs/e2e-component-report' }],
  ],

  use: {
    actionTimeout: 0,
    baseURL: storybookUrl,
    channel: browserChannel,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  outputDir: './logs/e2e-component-results',
});
