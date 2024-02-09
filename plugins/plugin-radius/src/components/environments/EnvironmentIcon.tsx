import React from 'react';
import { SvgIcon, SvgIconProps } from '@material-ui/core';

export const EnvironmentIcon = (
  props: SvgIconProps & { shape?: 'full' | 'square' },
) => {
  const originalWidth = 1080;
  const originalHeight = 1080;

  return (
    <SvgIcon
      {...props}
      viewBox={
        props.shape === 'square'
          ? `0 0 ${originalHeight} ${originalHeight}`
          : `0 0 ${originalWidth} ${originalHeight}`
      }
    >
      <path
        fill="#dd5630"
        d="m940,722.58v-365.16c0-29.93-15.97-57.58-41.88-72.54l-316.24-182.58c-25.92-14.96-57.85-14.96-83.76,0l-316.24,182.58c-25.92,14.96-41.88,42.62-41.88,72.54v365.16c0,29.93,15.97,57.58,41.88,72.54l316.24,182.58c25.92,14.96,57.85,14.96,83.76,0l316.24-182.58c25.92-14.96,41.88-42.62,41.88-72.54Z"
      />
      <path
        fill="#fff"
        d="m577.11,576.75c-20.56,20.23-53.63,19.97-73.86-.59-20.23-20.56-19.97-53.63.59-73.86,14.27-14.05,34.57-18.2,52.41-12.57l108.66-106.94c-31.71-25.22-71.32-41.12-114.88-43.2-110.42-5.27-204.21,79.96-209.48,190.38-5.27,110.42,79.96,204.21,190.39,209.48,110.42,5.27,204.21-79.96,209.48-190.38,2.37-49.66-13.61-95.93-41.91-132.32l-108.35,106.64c5.9,18.22,1.54,39.01-13.04,53.35Z"
      />
    </SvgIcon>
  );
};

export default EnvironmentIcon;
