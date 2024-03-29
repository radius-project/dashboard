import React from 'react';
import { SvgIcon } from '@material-ui/core';

export const ApplicationIcon = () => {
  const originalWidth = 1080;
  const originalHeight = 1080;

  return (
    <SvgIcon viewBox={`0 0 ${originalWidth} ${originalHeight}`}>
      <g>
        <path
          fill="#d0b1fc"
          d="m910.77,167.2H169.23c-35.47,0-64.23,28.76-64.23,64.23v92.56h870v-92.56c0-35.47-28.76-64.23-64.23-64.23Z"
        />
        <path
          fill="#861adf"
          d="m105,324v524.57c0,35.47,28.76,64.23,64.23,64.23h741.55c35.47,0,64.23-28.76,64.23-64.23V324H105Z"
        />
        <path
          fill="#fff"
          d="m575.51,647.28c-19.93,19.61-51.98,19.36-71.59-.57-19.61-19.93-19.36-51.98.57-71.59,13.83-13.61,33.5-17.65,50.8-12.18l105.32-103.66c-30.74-24.45-69.13-39.86-111.36-41.87-107.03-5.11-197.94,77.51-203.05,184.54-5.11,107.03,77.51,197.94,184.54,203.05,107.03,5.11,197.94-77.51,203.05-184.54,2.3-48.14-13.19-92.98-40.62-128.26l-105.02,103.37c5.72,17.66,1.49,37.81-12.64,51.71Z"
        />
      </g>
      <path
        fill="#861adf"
        d="m712.3,271.75c-11.17,0-20.23-9.06-20.23-20.23s9.06-20.23,20.23-20.23,20.23,9.06,20.23,20.23-9.06,20.23-20.23,20.23Z"
      />
      <path
        fill="#861adf"
        d="m803.02,271.75c-11.17,0-20.23-9.06-20.23-20.23s9.06-20.23,20.23-20.23,20.23,9.06,20.23,20.23-9.06,20.23-20.23,20.23Z"
      />
      <path
        fill="#861adf"
        d="m893.74,271.75c-11.17,0-20.23-9.06-20.23-20.23s9.06-20.23,20.23-20.23,20.23,9.06,20.23,20.23-9.06,20.23-20.23,20.23Z"
      />
    </SvgIcon>
  );
};

export default ApplicationIcon;
