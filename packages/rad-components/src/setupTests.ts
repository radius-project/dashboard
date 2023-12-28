import '@testing-library/jest-dom';
import { ResizeObserver } from '@juggle/resize-observer';

// Polyfill for ResizeObserver is required for react-flow in tests.
global.ResizeObserver = ResizeObserver;
window.ResizeObserver = ResizeObserver;
