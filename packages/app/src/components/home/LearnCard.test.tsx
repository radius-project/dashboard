import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { LearnCard } from './LearnCard';

/**
 * The home cards are static, but their link targets are the product's
 * documentation entry points and nothing pins them. A silent edit to one of
 * these hrefs ships a dead "Get Started" button with no test failure, which is
 * why every target is asserted explicitly rather than by count.
 *
 * Two harness details shape the queries below. `LinkButton` renders an anchor
 * with `role="button"`, not `role="link"`, so these queries ask for buttons.
 * And Backstage appends a visually hidden ", Opens in a new window" to the
 * accessible name of every external link, so the names are matched by prefix
 * rather than exactly.
 */
describe('LearnCard', () => {
  it('LC-01: renders the card heading and subheading', async () => {
    await renderInTestApp(<LearnCard />);

    expect(screen.getByText('Learn more')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Discover documentation, tutorials, and reference materials',
      ),
    ).toBeInTheDocument();
  });

  it('LC-02: describes what Radius is in the card body', async () => {
    await renderInTestApp(<LearnCard />);

    expect(
      screen.getByText(/open-source, cloud-native, application platform/),
    ).toBeInTheDocument();
  });

  it('LC-03: points Get Started at the getting-started documentation', async () => {
    await renderInTestApp(<LearnCard />);

    expect(
      screen.getByRole('button', { name: /^Get Started/ }),
    ).toHaveAttribute('href', 'https://docs.radapp.io/getting-started/');
  });

  it('LC-04: points Tutorials at the new-app tutorial', async () => {
    await renderInTestApp(<LearnCard />);

    expect(screen.getByRole('button', { name: /^Tutorials/ })).toHaveAttribute(
      'href',
      'https://docs.radapp.io/tutorials/new-app/',
    );
  });

  it('LC-05: points Reference at the resource schema overview', async () => {
    await renderInTestApp(<LearnCard />);

    expect(screen.getByRole('button', { name: /^Reference/ })).toHaveAttribute(
      'href',
      'https://docs.radapp.io/reference/resource-schema/overview/',
    );
  });

  it('LC-06: offers exactly the three documented actions, each marked as leaving the app', async () => {
    await renderInTestApp(<LearnCard />);

    expect(
      screen.getAllByRole('button').map(button => button.textContent),
    ).toEqual([
      'Get Started, Opens in a new window',
      'Tutorials, Opens in a new window',
      'Reference, Opens in a new window',
    ]);
  });

  it('LC-07: applies the class name the host passes for equal-height layout', async () => {
    const { container } = await renderInTestApp(
      <LearnCard className="host-supplied" />,
    );

    expect(container.querySelector('.host-supplied')).not.toBeNull();
  });
});
