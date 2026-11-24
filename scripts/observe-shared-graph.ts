import { once } from 'node:events';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium, expect, type Page } from '@playwright/test';
import { assertInside } from './installed-host.ts';

const root = process.cwd();
const consumerRoot = process.argv[2] ?? root;
const frontendRoot = process.argv[3] ?? consumerRoot;
assertInside(consumerRoot, frontendRoot);
const consumerRequire = createRequire(
  path.join(path.resolve(frontendRoot), 'package.json'),
);
const pluginRoot = path.dirname(
  consumerRequire.resolve('@internal/plugin-radius/package.json'),
);
const liveAdapter = path.join(
  pluginRoot,
  process.argv[2]
    ? 'dist/components/resources/legacyGraph.esm.js'
    : 'src/components/resources/legacyGraph.ts',
);
const fixturesDirectory = path.join(
  root,
  'packages/rad-components/src/__fixtures__/graph',
);
const fixtures = Object.fromEntries(
  fs
    .readdirSync(fixturesDirectory)
    .filter(file => file.endsWith('.json'))
    .map(file => [
      file.slice(0, -5),
      JSON.parse(fs.readFileSync(path.join(fixturesDirectory, file), 'utf8')),
    ]),
);

async function observe(page: Page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    const boxes = nodes.map(node => {
      const bounds = node.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    });
    const record = {
      nodes: nodes
        .map(node => {
          const card = node.querySelector('[data-node-id]') ?? node;
          const title = card.querySelector(
            '[data-radius-part="node-title"], h3',
          );
          const type = card.querySelector('[data-radius-part="node-type"], h6');
          if (!title || !type) throw new Error('Missing rendered title/type');
          const badge = card.getAttribute('data-radius-badge');
          return {
            id:
              card.getAttribute('data-node-id') ?? node.getAttribute('data-id'),
            label: title.textContent?.trim(),
            type: type.textContent?.trim(),
            icon: card.getAttribute('data-radius-icon') ?? 'not-yet-populated',
            statusBadge: badge
              ? {
                  kind: badge,
                  accessibleName: card
                    .querySelector('[aria-label]')
                    ?.getAttribute('aria-label'),
                }
              : 'not-yet-populated',
          };
        })
        .sort((left, right) => (left.id ?? '').localeCompare(right.id ?? '')),
      edges: Array.from(document.querySelectorAll('.react-flow__edge'))
        .map(edge => {
          const id = edge.getAttribute('data-id') ?? '';
          const endpoints: string[] | null = id.startsWith('[')
            ? JSON.parse(id)
            : (/^Edge from (.*?) to (.*)$/
                .exec(edge.getAttribute('aria-label') ?? '')
                ?.slice(1) ?? null);
          if (!endpoints || endpoints.length !== 2)
            throw new Error(
              'Rendered edge has no observable directed identity',
            );
          const [source, target] = endpoints;
          return { source, target, direction: 'source-to-target' };
        })
        .sort((left, right) =>
          `${left.source}\0${left.target}`.localeCompare(
            `${right.source}\0${right.target}`,
          ),
        ),
    };
    return {
      record,
      boxes,
      positions: nodes
        .map(node => [
          node.getAttribute('data-id'),
          (node as HTMLElement).style.transform,
        ])
        .sort(),
    };
  });
}

async function main() {
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), 'radius-graph-observation-'),
  );
  let browser;
  const server = createServer((request, response) => {
    const asset = new URL(
      request.url ?? '/',
      'http://localhost',
    ).pathname.slice(1);
    if (asset === 'graph.js' || asset === 'graph.css') {
      response.setHeader(
        'content-type',
        asset.endsWith('.css') ? 'text/css' : 'text/javascript',
      );
      response.end(fs.readFileSync(path.join(output, asset)));
    } else {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<!doctype html><link rel="stylesheet" href="/graph.css"><div id="root" style="height:700px;width:1100px"></div><script type="module" src="/graph.js"></script>',
      );
    }
  });
  try {
    await build({
      stdin: {
        contents: `
          import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {flushSync} from 'react-dom';
          import {RadiusGraph} from '@radius-project/graph-react';
          import {AppGraph,ResourceNode} from '@radapp.io/rad-components';
          import {ReactFlow, ReactFlowProvider} from 'reactflow';
          import {legacyGraphToLive} from 'qualification-live-adapter';
          import '@radius-project/graph-react/styles.css';
          import 'reactflow/dist/style.css';
          const fixtures = ${JSON.stringify(fixtures)};
          let root = createRoot(document.getElementById('root'));
          window.renderGraph = (name, mode = 'compat', reverse = false, remount = false) => {
            if (remount) { flushSync(() => root.unmount()); root = createRoot(document.getElementById('root')); }
            const graph = structuredClone(fixtures[name]);
            if (reverse) graph.resources.reverse();
            const context = {connectionId:'observed-host',plane:{type:'radius',name:'local'},applicationId:'/planes/radius/local/resourceGroups/demo/providers/Applications.Core/applications/observed'};
            flushSync(() => root.render(mode === 'stub' ? <div>Graph placeholder</div> : mode === 'flow11'
              ? <ReactFlowProvider><ReactFlow defaultNodes={[{id:graph.resources[0].id,position:{x:50,y:50},data:graph.resources[0],type:'legacy'}]} nodeTypes={{legacy:ResourceNode}} /></ReactFlowProvider>
              : mode === 'native' ? <RadiusGraph graph={legacyGraphToLive(graph,context)} options={{showLegend:false,enablePopup:false}} />
              : <AppGraph graph={graph} />));
          };
        `,
        resolveDir: frontendRoot,
        loader: 'tsx',
      },
      outfile: path.join(output, 'graph.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      loader: { '.svg': 'dataurl', '.png': 'dataurl' },
      logLevel: 'silent',
      alias: { 'qualification-live-adapter': liveAdapter },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL
        ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL }
        : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => 'renderGraph' in window);
    const render = async (
      fixture: string,
      mode = 'compat',
      reverse = false,
      remount = false,
    ) => {
      await page.evaluate(
        ({ fixture, mode, reverse, remount }) => {
          (
            window as unknown as {
              renderGraph: (
                name: string,
                mode: string,
                reverse: boolean,
                remount: boolean,
              ) => void;
            }
          ).renderGraph(fixture, mode, reverse, remount);
        },
        { fixture, mode, reverse, remount },
      );
      await page.evaluate(
        () =>
          new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      if (fixture !== 'empty' && mode !== 'stub') {
        await expect(page.locator('.react-flow__node').first()).toBeVisible();
      }
      return observe(page);
    };
    const records: Record<string, unknown> = {};
    for (const fixture of Object.keys(fixtures).sort()) {
      const first = await render(fixture);
      records[fixture] = first.record;
      for (const box of first.boxes) {
        assert(
          Object.values(box).every(Number.isFinite),
          `GU-09 ${fixture}: nonfinite bounds`,
        );
        assert(
          box.width > 0 && box.height > 0,
          `GU-09 ${fixture}: unmeasured node`,
        );
      }
      for (let left = 0; left < first.boxes.length; left += 1) {
        for (let right = left + 1; right < first.boxes.length; right += 1) {
          const a = first.boxes[left];
          const b = first.boxes[right];
          assert(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
            `GU-09a ${fixture}: overlapping actual nodes`,
          );
        }
      }
      const reversed = await render(fixture, 'compat', true, true);
      assert.deepEqual(
        reversed.record,
        first.record,
        `GU-07 ${fixture}: input-order dependence`,
      );
      const live = await render(fixture, 'native', false, true);
      assert.deepEqual(
        {
          ids: live.record.nodes.map(node => node.id),
          edges: live.record.edges,
        },
        {
          ids: first.record.nodes.map(node => node.id),
          edges: first.record.edges,
        },
        `GU-21 ${fixture}: public and live graph topology differs`,
      );
      const reversedLive = await render(fixture, 'native', true, true);
      assert.deepEqual(
        reversedLive.record,
        live.record,
        `GU-07 ${fixture}: live input-order dependence`,
      );
      const remountedLive = await render(fixture, 'native', false, true);
      assert.deepEqual(
        remountedLive.positions,
        live.positions,
        `GU-07/GU-08 ${fixture}: live remount/layout leak`,
      );
      const remounted = await render(fixture, 'compat', false, true);
      assert.deepEqual(
        remounted.positions,
        first.positions,
        `GU-08/GU-11 ${fixture}: remount/layout leak`,
      );
    }
    await render('single-node', 'flow11');
    await expect(
      page.getByRole('heading', { name: 'solo', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.react-flow__handle')).toHaveCount(2);
    await render('multi-tier', 'native');
    const native = await observe(page);
    assert.equal(
      native.record.nodes.length,
      4,
      'GU-21b: missing native graph nodes',
    );
    await expect(page.locator('[data-radius-part="node"]')).toHaveCount(4);
    await expect(page.locator('[data-radius-part="icon"]')).not.toHaveCount(0);
    const viewport = page.locator('.react-flow__viewport');
    const before = await viewport.getAttribute('style');
    await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
    await expect(viewport).not.toHaveAttribute('style', before!);
    await page.getByRole('button', { name: 'Fit View', exact: true }).click();
    await expect(page.locator('[data-radius-part="legend"]')).toHaveCount(0);
    await page.getByRole('group', { name: 'frontend', exact: true }).click();
    await expect(page.locator('[data-radius-details]')).toHaveCount(0);
    const hasStyle = () =>
      page
        .locator('.react-flow__controls')
        .evaluate(
          element =>
            getComputedStyle(element).position === 'absolute' &&
            element.getBoundingClientRect().width > 0,
        );
    assert(await hasStyle(), 'GU-19: shared CSS is absent');
    await page
      .locator('link[rel=stylesheet]')
      .evaluate(element => element.remove());
    assert.equal(
      await hasStyle(),
      false,
      'GU-20: missing CSS negative control was not detected',
    );
    const stub = await render('multi-tier', 'stub');
    assert.equal(
      stub.record.nodes.length,
      0,
      'GU-20: stub negative control was not detected',
    );
    assert.deepEqual(errors, [], 'Browser errors');
    process.stdout.write(`${JSON.stringify(records)}\n`);
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        await new Promise<void>((resolve, reject) => {
          if (!server.listening) return resolve();
          server.close(error => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
      } finally {
        fs.rmSync(output, { recursive: true, force: true });
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
