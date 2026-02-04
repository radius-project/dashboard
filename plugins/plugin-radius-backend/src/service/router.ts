import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import * as express from 'express';
import Router from 'express-promise-router';

export interface RouterOptions {
  logger: typeof coreServices.logger;
}

export async function createRouter(): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  router.get('/health', (_, response) => {
    response.json({ status: 'ok' });
  });
  return router;
}

export const radiusPlugin = createBackendPlugin({
  pluginId: 'radius',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ httpRouter, logger }) {
        logger.info('Initializing Radius backend plugin');
        const router = await createRouter();
        // @ts-expect-error - Type incompatibility between express-promise-router and express 5 types
        httpRouter.use(router);
      },
    });
  },
});

export default radiusPlugin;
