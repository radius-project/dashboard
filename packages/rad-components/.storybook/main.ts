import { defineMain } from '@storybook/react-vite/node';
import { createRequire } from 'node:module';
import { join, dirname } from 'path';

const require = createRequire(import.meta.url);

/**
 * Resolve the absolute path of a package. Required in monorepos so Storybook
 * can locate addons that live in the workspace's hoisted node_modules.
 */
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')));
}

export default defineMain({
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    getAbsolutePath('@storybook/addon-links'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath('@storybook/addon-themes'),
    getAbsolutePath('@storybook/addon-a11y'),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
});
