import React, { ComponentType } from 'react';
import { ThemeProvider, useTheme, type Theme } from '@material-ui/core/styles';
import {
  ThemeProvider as Mui5ThemeProvider,
  type Theme as Mui5Theme,
} from '@mui/material/styles';
import {
  createBaseThemeOptions,
  createUnifiedTheme,
  genPageTheme,
  palettes,
  shapes,
} from '@backstage/theme';

const createRadiusTheme = (variant: 'light' | 'dark') =>
  createUnifiedTheme({
    ...createBaseThemeOptions({
      palette: {
        ...palettes[variant],
        primary: { main: '#db4c24' },
      },
    }),
    defaultPageTheme: 'other',
    pageTheme: {
      other: genPageTheme({
        colors: ['#db4c24', '#db4c24'],
        shape: shapes.wave,
      }),
    },
  });

export const radiusThemes = {
  light: createRadiusTheme('light'),
  dark: createRadiusTheme('dark'),
};

const scopedThemes = {
  light: {
    v4: radiusThemes.light.getTheme('v4') as Theme,
    v5: radiusThemes.light.getTheme('v5') as Mui5Theme,
  },
  dark: {
    v4: radiusThemes.dark.getTheme('v4') as Theme,
    v5: radiusThemes.dark.getTheme('v5') as Mui5Theme,
  },
};

export const withRadiusTheme = (Component: ComponentType) => {
  return function RadiusThemedPage() {
    const hostTheme = useTheme();
    const theme =
      scopedThemes[hostTheme.palette.type as keyof typeof scopedThemes] ??
      scopedThemes.light;
    return (
      <Mui5ThemeProvider theme={theme.v5}>
        <ThemeProvider theme={theme.v4}>
          <Component />
        </ThemeProvider>
      </Mui5ThemeProvider>
    );
  };
};
