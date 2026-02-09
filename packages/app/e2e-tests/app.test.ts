/*
 * Copyright 2020 The Backstage Authors
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

import { test, expect } from '@playwright/test';

test('App should render the home page', async ({ page }) => {
  await page.goto('/');

  // Click the Enter button on the sign-in page to complete guest authentication
  const enterButton = page.getByRole('button', { name: 'Enter' });
  await enterButton.waitFor({ state: 'visible' });
  await enterButton.click();

  // Verify home page content is visible
  await expect(page.getByText('Learn More')).toBeVisible();
  await expect(page.getByText('Join the Community')).toBeVisible();
  await expect(page.getByText('Get help with Radius')).toBeVisible();
});
