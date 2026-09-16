import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { SupportCard } from './SupportCard';

/**
 * As with `LearnCard`, the value of this suite is the href targets: they are
 * the only routes a user has out of the dashboard to ask for help, and they are
 * hand-written string literals with no other guard. Backstage appends a
 * visually hidden ", Opens in a new window" to the accessible name of an
 * external link, so names are matched by prefix.
 */
describe('SupportCard', () => {
  it('SC-01: renders the card heading and subheading', async () => {
    await renderInTestApp(<SupportCard />);

    expect(screen.getByText('Get help with Radius')).toBeInTheDocument();
    expect(
      screen.getByText('Report issues or ask other users for help'),
    ).toBeInTheDocument();
  });

  it('SC-02: explains what the support channels are for', async () => {
    await renderInTestApp(<SupportCard />);

    expect(
      screen.getByText(/Participate in discussions, forums, and chat channels/),
    ).toBeInTheDocument();
  });

  it('SC-03: points Ask a Question at the Discord support channel', async () => {
    await renderInTestApp(<SupportCard />);

    expect(
      screen.getByRole('button', { name: /^Ask a Question/ }),
    ).toHaveAttribute(
      'href',
      'https://discord.com/channels/1113519723347456110/1115302284356767814',
    );
  });

  it('SC-04: points Report an Issue at the upstream issue chooser', async () => {
    await renderInTestApp(<SupportCard />);

    expect(
      screen.getByRole('button', { name: /^Report an Issue/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/radius-project/radius/issues/new/choose',
    );
  });

  it('SC-05: offers exactly the two documented actions, each marked as leaving the app', async () => {
    await renderInTestApp(<SupportCard />);

    expect(
      screen.getAllByRole('button').map(button => button.textContent),
    ).toEqual([
      'Ask a Question, Opens in a new window',
      'Report an Issue, Opens in a new window',
    ]);
  });

  it('SC-06: applies the class name the host passes for equal-height layout', async () => {
    const { container } = await renderInTestApp(
      <SupportCard className="host-supplied" />,
    );

    expect(container.querySelector('.host-supplied')).not.toBeNull();
  });
});
