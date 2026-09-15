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
import { generateProjects } from '@backstage/e2e-test-utils/playwright';

// Set PLAYWRIGHT_DISABLE_WEBSERVER=true when the Backstage app is already served elsewhere, such as the built container the release workflow starts on port 7007 (paired with PLAYWRIGHT_URL=http://localhost:7007). The flag only hands over the app on port 3000; see the webServer comment below for why Storybook is spawned either way.
const disableWebServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === 'true';
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: 60_000,

  expect: {
    timeout: 5_000,
  },

  // Run your local dev server before starting the tests.
  //
  // The two entries are deliberately gated differently. PLAYWRIGHT_DISABLE_WEBSERVER
  // means "something else already serves the Backstage app", so only the app entry is
  // dropped. Storybook is always spawned because nothing else ever serves it: the
  // built container published by the release workflow contains the Backstage app
  // alone, so leaving Storybook out under that flag makes the rad-components browser
  // suite fail with ERR_CONNECTION_REFUSED on port 6006. reuseExistingServer keeps a
  // Storybook host a developer already started from being spawned twice.
  webServer: [
    ...(!disableWebServer
      ? [
          {
            command: 'yarn start',
            port: 3000,
            reuseExistingServer: true,
            timeout: 180_000,
          },
        ]
      : []),
    {
      command:
        'yarn workspace @radapp.io/rad-components storybook --ci --no-open',
      port: 6006,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['html', { open: 'never', outputFolder: './logs/e2e-test-report' }],
  ],

  use: {
    actionTimeout: 0,
    baseURL: process.env.PLAYWRIGHT_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  outputDir: './logs/e2e-test-results',

  projects: generateProjects().map(project => ({
    ...project,
    use: {
      ...project.use,
      ...(browserChannel ? { channel: browserChannel } : {}),
    },
  })), // Find all packages with e2e-test folders
});
