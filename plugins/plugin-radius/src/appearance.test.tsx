import React from 'react';
import { render, screen } from '@testing-library/react';
import { Theme, useTheme } from '@material-ui/core/styles';
import {
  Theme as Mui5Theme,
  useTheme as useMui5Theme,
} from '@mui/material/styles';
import {
  UnifiedThemeProvider,
  createBaseThemeOptions,
  createUnifiedTheme,
  palettes,
} from '@backstage/theme';
import { radiusThemes, withRadiusTheme } from './appearance';

const snapshot = (theme: Theme, mui5Theme: Mui5Theme) =>
  JSON.stringify({
    primary: theme.palette.primary,
    background: theme.palette.background,
    typography: theme.typography,
    page: theme.page,
    mui5Primary: mui5Theme.palette.primary,
    mui5Typography: mui5Theme.typography,
  });

const ThemeProbe = ({ name }: { name: string }) => {
  const theme = useTheme();
  const mui5Theme = useMui5Theme();
  return <output data-testid={name}>{snapshot(theme, mui5Theme)}</output>;
};

const RadiusPage = withRadiusTheme(() => <ThemeProbe name="radius" />);

it('keeps native page styles inside Radius and follows live host light/dark changes', () => {
  const { typography } = createBaseThemeOptions({ palette: palettes.light });
  const hostThemes = {
    light: createUnifiedTheme({
      ...createBaseThemeOptions({ palette: palettes.light }),
      typography: { ...typography, fontFamily: 'Host font' },
    }),
    dark: createUnifiedTheme({
      ...createBaseThemeOptions({ palette: palettes.dark }),
      typography: { ...typography, fontFamily: 'Other host font' },
    }),
  };
  const page = (variant: 'light' | 'dark') => (
    <UnifiedThemeProvider theme={hostThemes[variant]} themeName="generic-host">
      <ThemeProbe name="host-before" />
      <RadiusPage />
      <ThemeProbe name="host-after" />
    </UnifiedThemeProvider>
  );

  const { rerender } = render(page('light'));
  const lightPage = screen.getByTestId('radius').textContent;
  for (const variant of ['light', 'dark'] as const) {
    rerender(page(variant));
    expect(screen.getByTestId('radius').textContent).toEqual(
      snapshot(
        radiusThemes[variant].getTheme('v4') as Theme,
        radiusThemes[variant].getTheme('v5') as Mui5Theme,
      ),
    );
    expect(screen.getByTestId('host-before').textContent).toEqual(
      screen.getByTestId('host-after').textContent,
    );
    expect(screen.getByTestId('radius').textContent).not.toEqual(
      screen.getByTestId('host-before').textContent,
    );
    expect(document.body.getAttribute('data-theme-name')).toBe('generic-host');
    expect(
      JSON.parse(document.body.getAttribute('data-unified-theme-stack')!),
    ).toHaveLength(1);
  }
  expect(screen.getByTestId('radius').textContent).not.toEqual(lightPage);
});
