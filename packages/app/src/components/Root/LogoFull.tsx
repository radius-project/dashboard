import React from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  svg: {
    width: 'auto',
    height: 30,
  },
});
const LogoFull = () => {
  const classes = useStyles();

  return (
    <svg className={classes.svg}>
      <image href="/logo-full.svg" height="30" />
    </svg>
  );
};

export default LogoFull;
