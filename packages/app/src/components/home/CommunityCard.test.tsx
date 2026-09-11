import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { CommunityCard } from './CommunityCard';

/**
 * The community card is the only home card whose actions are not all external
 * documentation links, and it is the one carrying a defect: see CC-05.
 */
describe('CommunityCard', () => {
  it('CC-01: renders the card heading and subheading', async () => {
    await renderInTestApp(<CommunityCard />);

    expect(screen.getByText('Join the community')).toBeInTheDocument();
    expect(
      screen.getByText('Find ways to participate and contribute'),
    ).toBeInTheDocument();
  });

  it('CC-02: invites the reader to contribute in the card body', async () => {
    await renderInTestApp(<CommunityCard />);

    expect(
      screen.getByText(/We welcome and encourage users to contribute/),
    ).toBeInTheDocument();
  });

  it('CC-03: points Visit on Github at the Radius repository', async () => {
    await renderInTestApp(<CommunityCard />);

    expect(
      screen.getByRole('button', { name: /^Visit on Github/ }),
    ).toHaveAttribute('href', 'https://github.com/radius-project/radius');
  });

  it('CC-04: points Good first issues at the filtered issue search', async () => {
    await renderInTestApp(<CommunityCard />);

    expect(
      screen.getByRole('button', { name: /^Good first issues/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/radius-project/radius/issues?q=is:issue+is:open+label:%22good+first+issue%22',
    );
  });

  /**
   * KNOWN-DEFECT, tracked by radius-project/dashboard#364.
   *
   * `Join us on Discord` is declared with `to=""`. Backstage's `Link` resolves
   * that to the app root, so the button renders `href="/"`: it is enabled,
   * focusable, and indistinguishable from the two working actions beside it,
   * but clicking it navigates the user to the dashboard home page instead of
   * to Discord. Because the target is internal rather than external it is also
   * the only action on the card without the "Opens in a new window" hint, so
   * even a screen-reader user gets no warning that it behaves differently.
   *
   * The correct behavior is to point at the Radius Discord invite, as
   * `SupportCard`'s `Ask a Question` already does.
   *
   * This records what ships today. It is expected to fail when the href is
   * supplied, and that failure is the signal the fix landed.
   */
  it('CC-05: KNOWN-DEFECT Join us on Discord navigates to the app root, not to Discord', async () => {
    await renderInTestApp(<CommunityCard />);

    const discord = screen.getByRole('button', { name: 'Join us on Discord' });

    expect(discord).toHaveAttribute('href', '/');
    expect(discord).not.toBeDisabled();
    expect(discord).not.toHaveAttribute('target', '_blank');
  });

  it('CC-06: offers exactly the three documented actions', async () => {
    await renderInTestApp(<CommunityCard />);

    expect(
      screen.getAllByRole('button').map(button => button.textContent),
    ).toEqual([
      'Visit on Github, Opens in a new window',
      'Good first issues, Opens in a new window',
      // No hint, because CC-05 leaves this one pointing inside the app.
      'Join us on Discord',
    ]);
  });

  it('CC-07: applies the class name the host passes for equal-height layout', async () => {
    const { container } = await renderInTestApp(
      <CommunityCard className="host-supplied" />,
    );

    expect(container.querySelector('.host-supplied')).not.toBeNull();
  });
});
