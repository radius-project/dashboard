import React from 'react';
import { SvgIcon } from '@material-ui/core';

export const ResourceIcon = () => {
  const originalWidth = 1080;
  const originalHeight = 1080;

  return (
    <SvgIcon viewBox={`0 0 ${originalWidth} ${originalHeight}`}>
      <path
        fill="#dd5630"
        d="m940,722.58v-365.16c0-29.93-15.97-57.58-41.88-72.54l-316.24-182.58c-25.92-14.96-57.85-14.96-83.76,0l-316.24,182.58c-25.92,14.96-41.88,42.62-41.88,72.54v365.16c0,29.93,15.97,57.58,41.88,72.54l316.24,182.58c25.92,14.96,57.85,14.96,83.76,0l316.24-182.58c25.92-14.96,41.88-42.62,41.88-72.54Z"
      />
    </SvgIcon>
  );
};

export default ResourceIcon;
