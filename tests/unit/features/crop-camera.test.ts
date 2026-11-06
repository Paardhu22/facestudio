import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCropCamera } from '@/features/cropping/use-crop-camera';

const initial = { scale: 0.5, x: 10, y: 20 };
const target = { scale: 2, x: -300, y: -200 };
let frames: Map<number, FrameRequestCallback>;
let media: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
let change: (() => void) | undefined;

beforeEach(() => {
  frames = new Map();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  media = {
    matches: false,
    addEventListener: vi.fn((_name, listener) => {
      change = listener;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => media);
});
afterEach(() => vi.unstubAllGlobals());

function frame(time: number) {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  });
}

describe('crop camera', () => {
  it('shows intermediate frames and settles at the exact target', () => {
    const { result } = renderHook(() => useCropCamera(initial));
    act(() => result.current.animateTo(target));
    expect(result.current.settling).toBe(true);
    frame(80);
    expect(result.current.view.scale).toBeGreaterThan(initial.scale);
    expect(result.current.view.scale).toBeLessThan(target.scale);
    frame(320);
    expect(result.current.view).toEqual(target);
    expect(result.current.settling).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('freezes on interruption and gives manual zoom and Fit immediate control', () => {
    const { result } = renderHook(() => useCropCamera(initial));
    act(() => result.current.animateTo(target));
    frame(120);
    const displayed = result.current.view;
    act(() => result.current.stop());
    frame(320);
    expect(result.current.view).toEqual(displayed);
    expect(result.current.settling).toBe(false);
    act(() => result.current.setView({ scale: 1, x: 60, y: 70 }));
    expect(result.current.view).toEqual({ scale: 1, x: 60, y: 70 });
    act(() => result.current.reset());
    expect(result.current.view).toEqual(initial);
  });

  it('retargets from the displayed frame and cancels the older destination', () => {
    const { result } = renderHook(() => useCropCamera(initial));
    act(() => result.current.animateTo(target));
    frame(80);
    const displayed = result.current.view;
    const next = { scale: 0.8, x: 50, y: 50 };
    act(() => result.current.animateTo(next));
    expect(result.current.view).toEqual(displayed);
    expect(frames.size).toBe(1);
    frame(320);
    expect(result.current.view).toEqual(next);
  });

  it('reframes immediately with reduced motion and schedules no animation', () => {
    media.matches = true;
    const { result } = renderHook(() => useCropCamera(initial));
    act(() => result.current.animateTo(target));
    expect(result.current.view).toEqual(target);
    expect(result.current.settling).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('completes without more motion if reduced motion is enabled during settling', () => {
    const { result } = renderHook(() => useCropCamera(initial));
    act(() => result.current.animateTo(target));
    frame(80);
    media.matches = true;
    act(() => change?.());
    expect(result.current.view).toEqual(target);
    expect(result.current.settling).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('cancels animation and removes the preference listener on image switch/unmount', () => {
    const { result, unmount } = renderHook(() => useCropCamera(initial));
    act(() => result.current.animateTo(target));
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalled();
  });
});
