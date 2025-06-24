import { Router } from 'express';
import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  // Create a basic proxy router since proxy-backend 0.6.x uses the new backend system
  const router = Router();
  
  // Add basic proxy endpoints
  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  return router;
}
