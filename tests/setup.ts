import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement ResizeObserver (used by react-resizable-panels). Minimal no-op stub.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserverStub, writable: true });
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, writable: true });
}

afterEach(() => {
  cleanup();
});
