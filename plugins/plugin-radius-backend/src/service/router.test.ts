import express from 'express';
import request from 'supertest';

jest.mock('@backstage/backend-plugin-api', () => ({
  createBackendPlugin: jest.fn((definition: unknown) => definition),
  coreServices: {
    httpRouter: { id: 'core.httpRouter' },
    logger: { id: 'core.logger' },
  },
}));

import { coreServices } from '@backstage/backend-plugin-api';
import { createRouter, radiusPlugin } from './router';

interface InitRegistration {
  deps: {
    httpRouter: unknown;
    logger: unknown;
  };
  init(context: {
    httpRouter: { use: jest.Mock };
    logger: { info: jest.Mock };
  }): Promise<void>;
}

interface PluginDefinition {
  pluginId: string;
  register(env: { registerInit: jest.Mock }): void;
}

const pluginDefinition = radiusPlugin as unknown as PluginDefinition;

const getInitRegistration = (): InitRegistration => {
  const registerInit = jest.fn();
  pluginDefinition.register({ registerInit });

  expect(registerInit).toHaveBeenCalledTimes(1);
  return registerInit.mock.calls[0][0] as InitRegistration;
};

describe('Radius backend plugin', () => {
  it('BE-01: serves GET /health with an ok response', async () => {
    const app = express().use(await createRouter());

    const response = await request(app).get('/health');

    expect(response.status).toEqual(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('BE-02: returns 404 for an unknown path', async () => {
    const app = express().use(await createRouter());

    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
  });

  it('BE-03: registers the radius plugin with the declared service dependencies', () => {
    const { createBackendPlugin } = jest.requireMock(
      '@backstage/backend-plugin-api',
    ) as { createBackendPlugin: jest.Mock };
    const registration = getInitRegistration();

    expect(createBackendPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: 'radius' }),
    );
    expect(registration.deps).toEqual({
      httpRouter: coreServices.httpRouter,
      logger: coreServices.logger,
    });
  });

  it('BE-04: mounts the router and logs initialization once', async () => {
    const registration = getInitRegistration();
    const httpRouter = { use: jest.fn() };
    const logger = { info: jest.fn() };

    await registration.init({ httpRouter, logger });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'Initializing Radius backend plugin',
    );
    expect(httpRouter.use).toHaveBeenCalledTimes(1);
    expect(httpRouter.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('BE-05: surfaces a router construction failure during startup', async () => {
    const failure = new Error('router construction failed');
    const actualExpress =
      jest.requireActual<typeof import('express')>('express');
    jest.doMock('express', () => ({
      ...actualExpress,
      Router: jest.fn(() => {
        throw failure;
      }),
    }));

    let isolatedPlugin: PluginDefinition | undefined;
    jest.isolateModules(() => {
      const isolatedModule =
        jest.requireActual<typeof import('./router')>('./router');
      isolatedPlugin =
        isolatedModule.radiusPlugin as unknown as PluginDefinition;
    });
    jest.dontMock('express');

    const registerInit = jest.fn();
    if (!isolatedPlugin) {
      throw new Error('isolated backend plugin did not load');
    }
    isolatedPlugin.register({ registerInit });
    const registration = registerInit.mock.calls[0][0] as InitRegistration;
    const httpRouter = { use: jest.fn() };
    const logger = { info: jest.fn() };

    await expect(registration.init({ httpRouter, logger })).rejects.toThrow(
      failure,
    );
    expect(httpRouter.use).not.toHaveBeenCalled();
  });
});
