import React from 'react';
import { Route } from 'react-router-dom';
import { FlatRoutes } from '@backstage/core-app-api';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { RadiusApi } from '../../api';
import { radiusApiRef } from '../../plugin';
import { ResourceTypeDetailPage } from './ResourceTypeDetailPage';

type ResourceTypeDetail = Awaited<ReturnType<RadiusApi['getResourceType']>>;

const versions = ['2025-01-01-preview', '2023-10-01-preview'];
const snippets = [
  { language: 'yaml', text: 'name: example\nproperties:\n  image: example:v1' },
  { language: 'json', text: '{\n  "name": "example"\n}' },
];

const tlsObject = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    ready: { type: 'boolean', readOnly: true },
  },
};

const connectionObject = {
  type: 'object',
  properties: {
    tls: tlsObject,
    outputTls: { ...tlsObject, readOnly: true },
  },
};

// Both branches permit navigation before and after the separate output-filter fix.
const nestedObject = {
  type: 'object',
  properties: {
    connection: connectionObject,
    outputConnection: { ...connectionObject, readOnly: true },
  },
};

const resourceType: ResourceTypeDetail = {
  Name: 'containers',
  ResourceProviderNamespace: 'Applications.Core',
  Description: snippets
    .map(({ language, text }) => `\`\`\`${language}\n${text}\n\`\`\``)
    .join('\n\n'),
  APIVersions: Object.fromEntries(
    versions.map(version => [
      version,
      {
        Schema: {
          properties: {
            config: nestedObject,
            status: { ...nestedObject, readOnly: true },
          },
        },
      },
    ]),
  ),
  APIVersionList: versions,
};

const renderPage = async (tab = 'overview') => {
  const getResourceType = jest.fn(async () => resourceType);
  await renderInTestApp(
    <TestApiProvider apis={[[radiusApiRef, { getResourceType }]]}>
      <FlatRoutes>
        <Route
          path="/resource-types/:namespace/:typeName"
          element={<ResourceTypeDetailPage />}
        />
      </FlatRoutes>
    </TestApiProvider>,
    {
      routeEntries: [`/resource-types/Applications.Core/containers/${tab}`],
    },
  );
  expect(
    await screen.findByRole('heading', { name: 'containers' }),
  ).toBeInTheDocument();
  expect(getResourceType).toHaveBeenCalledWith({
    namespace: 'Applications.Core',
    typeName: 'containers',
  });
};

describe('ResourceTypeDetailPage interactions', () => {
  describe('copy buttons', () => {
    const writeText = jest.fn<Promise<void>, [string]>();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );

    beforeEach(() => {
      writeText.mockReset().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    });

    afterEach(() => {
      cleanup();
      act(() => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
      if (clipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    });

    const copy = async (button: HTMLElement) => {
      await act(async () => {
        fireEvent.click(button);
      });
    };

    it.each(snippets)(
      'copies the $language block and resets success after two seconds',
      async ({ text }) => {
        await renderPage();
        jest.useFakeTimers();
        const code = screen.getByText(text, {
          selector: 'code',
          normalizer: value => value,
        });
        const button = within(code.parentElement!.parentElement!).getByRole(
          'button',
          { name: 'Copy to clipboard' },
        );

        await copy(button);

        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText).toHaveBeenCalledWith(text);
        expect(button).toHaveAccessibleName('Copied!');
        act(() => {
          jest.advanceTimersByTime(1999);
        });
        expect(button).toHaveAccessibleName('Copied!');
        act(() => {
          jest.advanceTimersByTime(1);
        });
        expect(button).toHaveAccessibleName('Copy to clipboard');
      },
    );

    it('keeps success local to the clicked copy button', async () => {
      await renderPage();
      jest.useFakeTimers();
      const [first, second] = screen.getAllByRole('button', {
        name: 'Copy to clipboard',
      });

      await copy(first);
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      await copy(second);

      expect(writeText.mock.calls).toEqual(snippets.map(({ text }) => [text]));
      expect(first).toHaveAccessibleName('Copied!');
      expect(second).toHaveAccessibleName('Copied!');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(first).toHaveAccessibleName('Copy to clipboard');
      expect(second).toHaveAccessibleName('Copied!');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(second).toHaveAccessibleName('Copy to clipboard');
    });

    it('does not show success after clipboard rejection and allows a retry', async () => {
      await renderPage();
      jest.useFakeTimers();
      writeText.mockRejectedValueOnce(new Error('Clipboard access denied'));
      const button = screen.getAllByRole('button', {
        name: 'Copy to clipboard',
      })[0];

      await copy(button);

      expect(writeText).toHaveBeenCalledWith(snippets[0].text);
      expect(button).toHaveAccessibleName('Copy to clipboard');
      expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull();
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(button).toHaveAccessibleName('Copy to clipboard');

      await copy(button);

      expect(writeText).toHaveBeenCalledTimes(2);
      expect(writeText).toHaveBeenLastCalledWith(snippets[0].text);
      expect(button).toHaveAccessibleName('Copied!');
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(button).toHaveAccessibleName('Copy to clipboard');
    });
  });

  describe.each([
    { tab: 'properties', prefix: '', property: 'config' },
    { tab: 'output-properties', prefix: 'output-', property: 'status' },
  ])('$tab navigation', ({ tab, prefix, property }) => {
    const scrollIntoView = jest.fn();
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    );

    beforeEach(() => {
      scrollIntoView.mockReset();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });
    });

    afterEach(() => {
      if (scrollDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollIntoView',
          scrollDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    });

    const section = (id: string) => {
      const element = document.getElementById(id);
      expect(element).not.toBeNull();
      return element!;
    };

    const clickAndExpectScroll = (link: HTMLElement, target: HTMLElement) => {
      scrollIntoView.mockClear();
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      fireEvent(link, event);
      expect(event.defaultPrevented).toBe(true);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
      expect(scrollIntoView.mock.contexts[0]).toBe(target);
    };

    it.each(versions)('scrolls the API version link to %s', async version => {
      await renderPage(tab);
      const link = screen.getByRole('link', { name: version });
      const target = section(`${prefix}version-${version}`);

      expect(link).toHaveAttribute('href', `#${target.id}`);
      clickAndExpectScroll(link, target);
    });

    it.each(versions)(
      'follows nested links and returns to each parent in %s',
      async version => {
        await renderPage(tab);
        const root = section(`${prefix}version-${version}`);
        const first = section(`${prefix}${version}-${property}`);
        const propertyLink = within(root).getByRole('link', { name: property });
        expect(propertyLink).toHaveAttribute('href', `#${first.id}`);
        clickAndExpectScroll(propertyLink, first);

        const parents = [root, first];
        let current = first;
        for (const name of [
          /^(connection|outputConnection)$/,
          /^(tls|outputTls)$/,
        ]) {
          const link = within(current).getByRole('link', { name });
          const target = section(`${current.id}.${link.textContent}`);
          expect(link).toHaveAttribute('href', `#${target.id}`);
          clickAndExpectScroll(link, target);
          parents.push(target);
          current = target;
        }

        for (let index = parents.length - 1; index > 0; index--) {
          clickAndExpectScroll(
            within(parents[index]).getByRole('link', {
              name: /Back to parent/,
            }),
            parents[index - 1],
          );
        }
      },
    );
  });
});
