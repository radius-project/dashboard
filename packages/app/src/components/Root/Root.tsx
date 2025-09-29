import React, { PropsWithChildren } from 'react';
import { makeStyles } from '@material-ui/core';
import {
  Settings as SidebarSettings,
  UserSettingsSignInAvatar,
} from '@backstage/plugin-user-settings';
import {
  Sidebar,
  sidebarConfig,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarPage,
  SidebarScrollWrapper,
  SidebarSpace,
  useSidebarOpenState,
  Link,
} from '@backstage/core-components';
import MenuIcon from '@material-ui/icons/Menu';
import {
  RadiusLogo,
  RadiusLogomarkReverse,
  ApplicationIcon,
  EnvironmentIcon,
  ResourceIcon,
  RecipeIcon,
} from '@internal/plugin-radius';

const useSidebarLogoStyles = makeStyles({
  root: {
    width: sidebarConfig.drawerWidthClosed,
    height: 3 * sidebarConfig.logoHeight,
    display: 'flex',
    flexFlow: 'row nowrap',
    alignItems: 'center',
    marginBottom: -14,
  },
  link: {
    width: sidebarConfig.drawerWidthClosed,
    marginLeft: 24,
  },
  svg: {
    width: 'auto',
    height: 28,
  },
});

const SidebarLogo = () => {
  const classes = useSidebarLogoStyles();
  const { isOpen } = useSidebarOpenState();

  return (
    <div className={classes.root}>
      <Link to="/" underline="none" className={classes.link} aria-label="Home">
        {isOpen ? (
          <RadiusLogo shape="full" className={classes.svg} />
        ) : (
          <RadiusLogo shape="square" className={classes.svg} />
        )}
      </Link>
    </div>
  );
};

export const Root = ({ children }: PropsWithChildren<NonNullable<object>>) => (
  <SidebarPage>
    <Sidebar>
      <SidebarLogo />
      <SidebarDivider />
      <SidebarGroup label="Menu" icon={<MenuIcon />}>
        {/* Global nav, not org-specific */}
        <SidebarItem icon={RadiusLogomarkReverse} to="/" text="Home" />
        <SidebarItem
          icon={EnvironmentIcon}
          to="environments"
          text="Environments"
        />
        <SidebarItem
          icon={ApplicationIcon}
          to="applications"
          text="Applications"
        />
        <SidebarItem icon={ResourceIcon} to="resources" text="Resources" />
        <SidebarItem
          icon={ResourceIcon}
          to="resource-types"
          text="Resource Types"
        />
        <SidebarItem icon={RecipeIcon} to="recipes" text="Recipes" />
        {/* End global nav */}
        <SidebarDivider />
        <SidebarScrollWrapper />
      </SidebarGroup>
      <SidebarSpace />
      <SidebarDivider />
      <SidebarGroup
        label="Settings"
        icon={<UserSettingsSignInAvatar />}
        to="/settings"
      >
        <SidebarSettings />
      </SidebarGroup>
    </Sidebar>
    {children}
  </SidebarPage>
);
