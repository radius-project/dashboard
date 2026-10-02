import React from 'react';
import { storageApiRef, StorageApi } from '@backstage/core-plugin-api';
import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/test-utils';
import { act, fireEvent, screen } from '@testing-library/react';
import {
  CollapsibleInfoCard,
  HOME_CARDS_STORAGE_BUCKET,
} from './CollapsibleInfoCard';

/**
 * The home cards can be collapsed to their title, and the choice has to
 * outlive the page: the issue asks for the boxes to stay minimized after a
 * refresh or a later visit. Every test therefore runs against an explicit
 * storage API so it can inspect, seed or share what was persisted.
 */
const Card = ({
  cardId = 'learn',
  title = 'Learn more',
}: {
  cardId?: string;
  title?: string;
}) => (
  <CollapsibleInfoCard
    cardId={cardId}
    title={title}
    subheader={`${title} subheader`}
    className="host-supplied"
    actions={<a href="https://example.com">{`${title} action`}</a>}
  >
    {`${title} body`}
  </CollapsibleInfoCard>
);

const renderWithStorage = (
  storage: StorageApi,
  element: React.ReactElement = <Card />,
) =>
  renderInTestApp(
    <TestApiProvider apis={[[storageApiRef, storage]]}>
      {element}
    </TestApiProvider>,
  );

describe('CollapsibleInfoCard', () => {
  it('CIC-01: starts expanded when nothing has been stored', async () => {
    const { container } = await renderWithStorage(mockApis.storage());

    const toggle = screen.getByRole('button', { name: 'Collapse Learn more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'home-card-learn-content');
    expect(screen.getByText('Learn more body')).toBeVisible();
    expect(screen.getByText('Learn more subheader')).toBeInTheDocument();
    expect(screen.getByText('Learn more action')).toBeInTheDocument();
    expect(container.querySelector('.host-supplied')).not.toBeNull();
  });

  it('CIC-02: collapses to the title and persists the choice', async () => {
    const storage = mockApis.storage();
    const { container } = await renderWithStorage(storage);

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse Learn more' }),
    );

    const toggle = screen.getByRole('button', { name: 'Expand Learn more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Learn more')).toBeInTheDocument();
    expect(screen.getByText('Learn more body')).not.toBeVisible();
    expect(screen.queryByText('Learn more subheader')).not.toBeInTheDocument();
    expect(screen.queryByText('Learn more action')).not.toBeInTheDocument();
    // A collapsed card shrinks to its header instead of filling its grid cell.
    expect(container.querySelector('.host-supplied')).toBeNull();
    expect(
      storage.forBucket(HOME_CARDS_STORAGE_BUCKET).snapshot('learn').value,
    ).toBe(true);
  });

  it('CIC-03: restores a stored collapsed state on a later visit', async () => {
    await renderWithStorage(
      mockApis.storage({
        data: { [HOME_CARDS_STORAGE_BUCKET]: { learn: true } },
      }),
    );

    expect(
      screen.getByRole('button', { name: 'Expand Learn more' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Learn more body')).not.toBeVisible();
  });

  it('CIC-04: expanding again persists the expanded state', async () => {
    const storage = mockApis.storage({
      data: { [HOME_CARDS_STORAGE_BUCKET]: { learn: true } },
    });
    await renderWithStorage(storage);

    fireEvent.click(screen.getByRole('button', { name: 'Expand Learn more' }));

    expect(
      screen.getByRole('button', { name: 'Collapse Learn more' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Learn more body')).toBeVisible();
    expect(
      storage.forBucket(HOME_CARDS_STORAGE_BUCKET).snapshot('learn').value,
    ).toBe(false);
  });

  it('CIC-05: remembers each card independently', async () => {
    const storage = mockApis.storage();
    await renderWithStorage(
      storage,
      <>
        <Card />
        <Card cardId="support" title="Get help" />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Get help' }));

    expect(
      screen.getByRole('button', { name: 'Collapse Learn more' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand Get help' }),
    ).toBeInTheDocument();
    const bucket = storage.forBucket(HOME_CARDS_STORAGE_BUCKET);
    expect(bucket.snapshot('support').value).toBe(true);
    expect(bucket.snapshot('learn').presence).toBe('absent');
  });

  it('CIC-06: follows a change stored elsewhere, such as in another tab', async () => {
    const storage = mockApis.storage();
    await renderWithStorage(storage);

    await act(async () => {
      await storage.forBucket(HOME_CARDS_STORAGE_BUCKET).set('learn', true);
    });

    expect(
      screen.getByRole('button', { name: 'Expand Learn more' }),
    ).toBeInTheDocument();
  });

  it('CIC-07: still toggles for the current visit when storage rejects the write', async () => {
    const storage = mockApis.storage();
    const bucket = storage.forBucket(HOME_CARDS_STORAGE_BUCKET);
    const set = jest
      .spyOn(bucket, 'set')
      .mockRejectedValue(new Error('QuotaExceededError'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await renderWithStorage(storage);

      fireEvent.click(
        screen.getByRole('button', { name: 'Collapse Learn more' }),
      );
      // Let the rejected write settle so an unhandled rejection would surface.
      await act(() => new Promise(resolve => setTimeout(resolve, 0)));

      expect(set).toHaveBeenCalledWith('learn', true);
      expect(unhandled).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Expand Learn more' }),
      ).toBeInTheDocument();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('CIC-08: shows the stored state of the new card when the card id changes', async () => {
    const storage = mockApis.storage({
      data: { [HOME_CARDS_STORAGE_BUCKET]: { support: true } },
    });
    const { rerender } = await renderWithStorage(storage);
    expect(
      screen.getByRole('button', { name: 'Collapse Learn more' }),
    ).toBeInTheDocument();

    rerender(
      <TestApiProvider apis={[[storageApiRef, storage]]}>
        <Card cardId="support" title="Get help" />
      </TestApiProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Expand Get help' }),
    ).toBeInTheDocument();
  });
});
