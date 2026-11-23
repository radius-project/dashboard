import React from 'react';
import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { CommunityCard } from './CommunityCard';

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

  it('CC-05: opens the Radius Discord invite in a new window', async () => {
    await renderInTestApp(<CommunityCard />);

    const discord = screen.getByRole('button', {
      name: /^Join us on Discord/,
    });

    expect(discord).toHaveAttribute('href', 'https://aka.ms/radius/discord');
    expect(discord).not.toBeDisabled();
    expect(discord).toHaveAttribute('target', '_blank');
  });

  it('CC-06: offers exactly the four documented actions', async () => {
    await renderInTestApp(<CommunityCard />);

    expect(
      screen.getAllByRole('button').map(button => button.textContent),
    ).toEqual([
      'Visit on Github, Opens in a new window',
      'Good first issues, Opens in a new window',
      'Dashboard good first issues, Opens in a new window',
      'Join us on Discord, Opens in a new window',
    ]);
  });

  it('CC-07: applies the class name the host passes for equal-height layout', async () => {
    const { container } = await renderInTestApp(
      <CommunityCard className="host-supplied" />,
    );

    expect(container.querySelector('.host-supplied')).not.toBeNull();
  });

  it('CC-08: opens the dashboard good first issues search in a new window', async () => {
    await renderInTestApp(<CommunityCard />);

    const dashboardIssues = screen.getByRole('button', {
      name: /^Dashboard good first issues/,
    });

    expect(dashboardIssues).toHaveAttribute(
      'href',
      'https://github.com/radius-project/dashboard/issues?q=is%3Aissue+state%3Aopen+label%3A%22good+first+issue%22',
    );
    expect(dashboardIssues).toHaveAttribute('target', '_blank');
  });
});
