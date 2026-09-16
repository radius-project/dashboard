import { expect, Page, test } from '@playwright/test';

// Relative to the Storybook baseURL in playwright.components.config.ts.
const storyUrl = (story: string) =>
  `/iframe.html?id=appgraph--${story}&viewMode=story`;

// Test-only stories live in their own non-documented Storybook title.
const harnessStoryUrl = (story: string) =>
  `/iframe.html?id=appgraph-harness--${story}&viewMode=story`;

const node = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}`, 'i') });

const edge = (page: Page, source: string, target: string) =>
  page.getByRole('button', {
    name: new RegExp(`^Edge from .*${source}.* to .*${target}`, 'i'),
  });

const graphContract = async (page: Page) => ({
  namedNode: await node(page, 'frontend').isVisible(),
  namedEdge: await edge(page, 'backend', 'frontend').isVisible(),
  stylesheet: await page.locator('.react-flow__controls').evaluate(element => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return (
      style.position === 'absolute' && bounds.width > 0 && bounds.height > 0
    );
  }),
});

test.describe('real AppGraph renderer', () => {
  test('GU-11: unmounting and remounting preserves positions without leaking scheduled work', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const activeTimeouts = new Set<number>();
      const activeAnimationFrames = new Set<number>();
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      const nativeRequestAnimationFrame =
        window.requestAnimationFrame.bind(window);
      const nativeCancelAnimationFrame =
        window.cancelAnimationFrame.bind(window);

      window.setTimeout = ((handler: TimerHandler, timeout?: number) => {
        const id = nativeSetTimeout(() => {
          activeTimeouts.delete(id);
          if (typeof handler === 'function') {
            handler();
          } else {
            window.eval(handler);
          }
        }, timeout);
        activeTimeouts.add(id);
        return id;
      }) as typeof window.setTimeout;
      window.clearTimeout = ((id?: number) => {
        if (id !== undefined) activeTimeouts.delete(id);
        nativeClearTimeout(id);
      }) as typeof window.clearTimeout;
      window.requestAnimationFrame = callback => {
        const id = nativeRequestAnimationFrame(time => {
          activeAnimationFrames.delete(id);
          callback(time);
        });
        activeAnimationFrames.add(id);
        return id;
      };
      window.cancelAnimationFrame = id => {
        activeAnimationFrames.delete(id);
        nativeCancelAnimationFrame(id);
      };
      (
        window as Window & {
          scheduledWork?: { count: () => number };
        }
      ).scheduledWork = {
        // Timeouts and animation frames are counted in separate sets because the
        // two id spaces are independent: a timeout id and a frame id can be the
        // same number, and a shared set would let one cancellation hide the
        // other's leak.
        count: () => activeTimeouts.size + activeAnimationFrames.size,
      };
    });
    const pageErrors: Error[] = [];
    page.on('pageerror', error => pageErrors.push(error));
    await page.goto(harnessStoryUrl('remount-harness'));
    const positions = async () =>
      page.locator('.react-flow__node').evaluateAll(nodes =>
        nodes.map(node => ({
          name: node.textContent?.trim(),
          transform: (node as HTMLElement).style.transform,
        })),
      );

    const scheduledWorkCount = () =>
      page.evaluate(() =>
        (
          window as Window & { scheduledWork: { count: () => number } }
        ).scheduledWork.count(),
      );
    const baselineScheduledWork = await scheduledWorkCount();
    await page.getByRole('button', { name: 'Mount graph' }).click();
    await expect(node(page, 'frontend')).toBeVisible();
    const first = await positions();
    await page.getByRole('button', { name: 'Unmount graph' }).click();
    await expect(page.locator('.react-flow')).toHaveCount(0);
    await expect
      .poll(scheduledWorkCount)
      .toBeLessThanOrEqual(baselineScheduledWork);

    await page.getByRole('button', { name: 'Mount graph' }).click();
    await expect(node(page, 'frontend')).toBeVisible();
    expect(await positions()).toEqual(first);
    expect(pageErrors).toEqual([]);
  });

  test('GU-10 / GU-12 / GU-13: preserves named nodes and directed connections through rendering', async ({
    page,
  }) => {
    await page.goto(storyUrl('multi-tier'));

    await expect(node(page, 'frontend')).toBeVisible();
    await expect(node(page, 'backend')).toBeVisible();
    await expect(edge(page, 'backend', 'frontend')).toBeVisible();
  });

  test('E2E-19: renders resources from both supported application namespaces', async ({
    page,
  }) => {
    await page.goto(storyUrl('both-namespaces'));

    await expect(node(page, 'core-app')).toBeVisible();
    await expect(node(page, 'radius-app')).toBeVisible();
  });

  test('GU-09 / GU-14: lays out non-overlapping nodes and operates graph controls', async ({
    page,
  }) => {
    await page.goto(storyUrl('multi-tier'));
    await expect(node(page, 'frontend')).toBeVisible();

    const boxes = await page.locator('.react-flow__node').evaluateAll(nodes =>
      nodes.map(node => {
        const box = node.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      }),
    );
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        expect(
          boxes[left].right <= boxes[right].left ||
            boxes[right].right <= boxes[left].left ||
            boxes[left].bottom <= boxes[right].top ||
            boxes[right].bottom <= boxes[left].top,
        ).toBe(true);
      }
    }

    const viewport = page.locator('.react-flow__viewport');
    const before = await viewport.getAttribute('style');
    const zoomIn = page.getByRole('button', { name: 'Zoom In' });
    await zoomIn.click();
    await expect(viewport).not.toHaveAttribute('style', before ?? '');
    const zoomed = await viewport.getAttribute('style');

    await page.getByRole('button', { name: 'Fit View' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => viewport.getAttribute('style')).not.toBe(zoomed);
  });

  // KNOWN-DEFECT (#368): the correct behavior is an explicit accessible empty state.
  test('GU-15: KNOWN-DEFECT an empty graph is a blank canvas without an empty-state message', async ({
    page,
  }) => {
    await page.goto(storyUrl('empty'));

    await expect(page.locator('.react-flow')).toBeVisible();
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await expect(page.getByText(/no resources|empty graph/i)).toHaveCount(0);
  });

  // KNOWN-DEFECT (#41): selection should open dismissible details and restore focus on close.
  test('GU-18: KNOWN-DEFECT selecting a node does not reveal resource details', async ({
    page,
  }) => {
    await page.goto(storyUrl('single-node'));
    const selectedNode = node(page, 'solo');

    await expect(selectedNode).toBeVisible();
    await selectedNode.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(selectedNode).toBeFocused();
  });

  test('GU-19: renders with the shared stylesheet in light and dark hosts', async ({
    page,
  }) => {
    for (const story of ['multi-tier', 'dark']) {
      await page.goto(storyUrl(story));
      await expect(node(page, 'frontend')).toBeVisible();
      await expect(page.locator('.react-flow__controls')).toBeVisible();
      expect((await graphContract(page)).stylesheet).toBe(true);
    }
  });

  test('GU-20: semantic checks reject a stubbed renderer and missing stylesheet', async ({
    page,
  }) => {
    await page.goto(storyUrl('multi-tier'));
    await expect
      .poll(() => graphContract(page))
      .toEqual({
        namedNode: true,
        namedEdge: true,
        stylesheet: true,
      });

    await page.goto(harnessStoryUrl('stubbed-renderer'));
    await expect(node(page, 'frontend')).toHaveCount(0);

    await page.goto(harnessStoryUrl('stylesheet-removed'));
    await expect(node(page, 'frontend')).toBeHidden();
    await expect(page.locator('.react-flow__controls')).toBeHidden();
  });
});
