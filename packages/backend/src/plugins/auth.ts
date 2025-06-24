import { Router } from 'express';
import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  // Create a basic auth router since auth-backend 0.25.x uses the new backend system
  const router = Router();
  
  // Add basic auth endpoints
  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  router.post('/github/start', (req, res) => {
    res.json({ url: '/auth/github/handler' });
  });
  
  router.get('/github/handler', (req, res) => {
    res.json({ 
      profile: { email: 'guest@example.com' },
      backstageIdentity: {
        token: 'guest-token',
        identity: {
          type: 'user',
          userEntityRef: 'user:default/guest',
          ownershipEntityRefs: ['user:default/guest']
        }
      }
    });
  });
  
  return router;
}
