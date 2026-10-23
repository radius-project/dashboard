import { InfoCard } from '@backstage/core-components';
import { storageApiRef, useApi } from '@backstage/core-plugin-api';
import { IconButton } from '@material-ui/core';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

/** Storage bucket that remembers which home page cards the user collapsed. */
export const HOME_CARDS_STORAGE_BUCKET = 'radius-home-cards';

/**
 * Collapsed state of one home page card, kept in the Backstage storage API so
 * it survives a refresh and a later visit (the default storage API is backed
 * by the browser's local storage).
 */
export const useCardCollapsed = (
  cardId: string,
): [boolean, (collapsed: boolean) => void] => {
  const storageApi = useApi(storageApiRef);
  const bucket = useMemo(
    () => storageApi.forBucket(HOME_CARDS_STORAGE_BUCKET),
    [storageApi],
  );
  const [collapsed, setCollapsedState] = useState(
    () => bucket.snapshot<boolean>(cardId).value === true,
  );

  // Re-read when the card or storage changes, then follow writes made
  // elsewhere, such as in another tab, so every view agrees.
  useEffect(() => {
    setCollapsedState(bucket.snapshot<boolean>(cardId).value === true);
    const subscription = bucket
      .observe$<boolean>(cardId)
      .subscribe(snapshot => setCollapsedState(snapshot.value === true));
    return () => subscription.unsubscribe();
  }, [bucket, cardId]);

  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapsedState(value);
      bucket.set(cardId, value).catch(() => {
        // Persisting is best effort: when storage is unavailable the card
        // still toggles for the rest of this visit.
      });
    },
    [bucket, cardId],
  );

  return [collapsed, setCollapsed];
};

export type CollapsibleInfoCardProps = {
  /** Stable identifier used as the storage key for the collapsed state. */
  cardId: string;
  title: string;
  subheader?: string;
  /** Applied while expanded; a collapsed card shrinks to its header. */
  className?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

/**
 * An `InfoCard` with a header button that collapses it to its title. The
 * choice is remembered per card.
 */
export const CollapsibleInfoCard = ({
  cardId,
  title,
  subheader,
  className,
  actions,
  children,
}: CollapsibleInfoCardProps) => {
  const [collapsed, setCollapsed] = useCardCollapsed(cardId);
  const contentId = `home-card-${cardId}-content`;

  return (
    <InfoCard
      title={title}
      subheader={collapsed ? undefined : subheader}
      className={collapsed ? undefined : className}
      divider={!collapsed}
      noPadding={collapsed}
      action={
        <IconButton
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        </IconButton>
      }
      actions={collapsed ? undefined : actions}
    >
      <div id={contentId} hidden={collapsed}>
        {children}
      </div>
    </InfoCard>
  );
};

export default CollapsibleInfoCard;
