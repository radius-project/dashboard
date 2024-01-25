# Developing components of the Radius Dashboard

This page how to run and develop the Radius Dashboard and its components.

## Developing: Dashboard

**Launch the Dashboard:**

_Run in separate terminals:_

```bash
kubectl proxy
```

```bash
yarn dev
```

You can leave these commands running while you work on the Dashboard. Changes you make will be reflected in the browser pretty immediately.

The Dashboard is configured to look for a Kubernetes API server on `localhost:8001`. Running `kubectl proxy` will open a port-forward to your currently-configured Kubernetes cluster.

This will launch the Dashboard at `http://localhost:3000`.

### Configuration

The configuration for local development (`yarn dev`) is stored in `app-config.local.yaml`. This file is a set of overrides for development that will be combined with `app-config.yaml`. See the configuration file comments for links to relevant documentation.

This file is checked in but `.gitignored`'d. Feel free to make changes as needed.

The `app-config.dashboard.yaml` configuration is used when deployed as part of a Radius installation.

## Developing: rad-components

**Launch Storybook to experiment with rad-components:**

```bash
yarn workspace @radapp.io/rad-components run storybook
```

This will launch Storybook at `http://localhost:6006`.
