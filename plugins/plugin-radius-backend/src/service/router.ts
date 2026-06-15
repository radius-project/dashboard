import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import * as express from 'express';

export async function createRouter(): Promise<express.Router> {
  const router = express.Router();
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
        // @ts-expect-error - Express 5 Router types are not fully compatible with Backstage's Handler type. See: https://github.com/express-promise-router/express-promise-router/issues/119
        httpRouter.use(router);
      },
    });
  },
});

export default radiusPlugin;
