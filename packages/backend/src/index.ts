/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createRadiusBackend } from './createRadiusBackend';

createRadiusBackend()
  .start()
  .catch(error => {
    console.error('Radius backend startup failed', error);
    process.exit(1);
  });
