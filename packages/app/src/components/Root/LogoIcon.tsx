import React from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  svg: {
    width: 'auto',
    height: 28,
  },
});

const LogoIcon = () => {
  const classes = useStyles();

  return (
    <svg className={classes.svg} viewBox="0 0 28 28">
      <image href="/logo-full.svg" height="28" />
    </svg>
  );
};

export default LogoIcon;
