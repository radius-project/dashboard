import '@testing-library/jest-dom';
import { ResizeObserver } from '@juggle/resize-observer';

// Polyfill for ResizeObserver is required for react-flow in tests.
global.ResizeObserver = ResizeObserver;
window.ResizeObserver = ResizeObserver;

// Expose structuredClone to the jsdom environment (used by @dagrejs/dagre).
// jest-environment-jsdom doesn't expose this Node.js global.
if (typeof global.structuredClone === 'undefined') {
  (global as unknown as { structuredClone: <T>(val: T) => T }).structuredClone =
    <T>(val: T): T => JSON.parse(JSON.stringify(val));
}
