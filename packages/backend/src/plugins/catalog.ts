import { Router } from 'express';
import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  // Create a basic router since catalog-backend 2.x uses the new backend system
  const router = Router();
  
  // Add basic catalog endpoints
  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  router.get('/entities', (req, res) => {
    res.json({ items: [] });
  });
  
  router.get('/locations', (req, res) => {
    res.json({ items: [] });
  });
  
  return router;
}
