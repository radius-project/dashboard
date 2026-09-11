import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import {
  applicationListPageRouteRef,
  environmentListPageRouteRef,
  recipeListPageRouteRef,
  resourceListPageRouteRef,
  resourceTypesListPageRouteRef,
} from '@internal/plugin-radius';
import { userSettingsPlugin } from '@backstage/plugin-user-settings';
import { Root } from './Root';

/**
 * `Root` is the host's navigation contract: the sidebar is the only way a user
 * reaches four of the five plugin pages, and every destination is a
 * hand-written path string that no route ref checks. A typo here produces a
 * sidebar that renders perfectly and navigates nowhere, which is exactly the
 * failure mode that survives a compile and a lint.
 *
 * The sidebar is collapsed by default in the test app, so `SidebarItem` labels
 * are present in the DOM but the logo renders its square variant.
 */
const renderRoot = async (children?: React.ReactNode) =>
  renderInTestApp(<Root>{children}</Root>, {
    mountedRoutes: {
      '/applications': applicationListPageRouteRef,
      '/environments': environmentListPageRouteRef,
      '/recipes': recipeListPageRouteRef,
      '/resources': resourceListPageRouteRef,
      '/resource-types': resourceTypesListPageRouteRef,
      // The sidebar's settings group renders the user-settings tabs, which
      // resolve their own route ref. Without this the whole sidebar throws.
      '/settings': userSettingsPlugin.routes.settingsPage,
    },
  });

describe('Root', () => {
  it('RR-01: renders the page content the host wraps', async () => {
    await renderRoot(<main>page body</main>);

    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('RR-02: offers every global navigation destination', async () => {
    await renderRoot();

    expect(
      screen
        .getAllByRole('link')
        .map(link => link.textContent)
        .filter(Boolean),
    ).toEqual(
      expect.arrayContaining([
        'Home',
        'Resource Types',
        'Environments',
        'Applications',
        'Resources',
        'Recipes',
      ]),
    );
  });

  it('RR-03: points each navigation item at its page', async () => {
    await renderRoot();

    // Two links are named "Home": the logo (by aria-label) and the menu item
    // (by its text). Match on visible text so the menu item is unambiguous.
    const hrefOf = (text: string) =>
      screen
        .getAllByRole('link')
        .filter(link => link.textContent?.trim() === text)
        .map(link => link.getAttribute('href'));

    expect(hrefOf('Home')).toEqual(['/']);
    expect(hrefOf('Resource Types')).toEqual(['/resource-types']);
    expect(hrefOf('Environments')).toEqual(['/environments']);
    expect(hrefOf('Applications')).toEqual(['/applications']);
    expect(hrefOf('Resources')).toEqual(['/resources']);
    expect(hrefOf('Recipes')).toEqual(['/recipes']);
  });

  it('RR-04: gives the logo an accessible name and links it home', async () => {
    await renderRoot();

    // The logo is the link labelled "Home" that carries no visible text.
    const logo = screen
      .getAllByRole('link', { name: 'Home' })
      .filter(link => link.textContent?.trim() === '');

    expect(logo).toHaveLength(1);
    expect(logo[0]).toHaveAttribute('href', '/');
    expect(logo[0]).toHaveAttribute('aria-label', 'Home');
  });

  it('RR-05: renders the settings group so a user can reach their profile', async () => {
    await renderRoot();

    expect(
      screen.getByRole('link', { name: /Settings/ }).getAttribute('href'),
    ).toBe('/settings');
  });

  it('RR-06: renders an icon beside every navigation item', async () => {
    const { container } = await renderRoot();

    // Six menu items, the logo, the menu group icon, and the settings avatar
    // all render SVGs; the assertion is that icons are wired at all, because a
    // missing icon import renders an empty sidebar row with no error.
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(6);
  });
});
