import * as React from 'react';
import { act, renderHook } from '@testing-library/react';

type Listener = () => void;

type FakeMediaQueryList = {
  matches: boolean;
  media: string;
  addEventListener: jest.Mock<void, ['change', Listener]>;
  removeEventListener: jest.Mock<void, ['change', Listener]>;
  fire: () => void;
};

function fakeMediaQueryList(matches: boolean): FakeMediaQueryList {
  const listeners = new Set<Listener>();
  return {
    matches,
    media: '',
    addEventListener: jest.fn((_type, listener) => {
      listeners.add(listener);
    }),
    removeEventListener: jest.fn((_type, listener) => {
      listeners.delete(listener);
    }),
    fire: () => listeners.forEach((listener) => listener()),
  };
}

// The hook caches one MediaQueryList at module level, so each test loads a
// fresh copy. Its `react` import is pinned to the instance the testing
// library already holds, or the fresh copy would bring a second React.
function load() {
  let hook!: typeof import('../use-mobile');
  jest.isolateModules(() => {
    jest.doMock('react', () => React);
    hook = require('../use-mobile');
  });
  return hook;
}

function setup(matches: boolean) {
  const mql = fakeMediaQueryList(matches);
  const matchMedia = jest.fn(() => mql);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  return { mql, matchMedia, ...load() };
}

describe('useIsMobile', () => {
  it('reads the initial value from matchMedia().matches', () => {
    const wide = setup(false);
    expect(renderHook(() => wide.useIsMobile()).result.current).toBe(false);
    expect(wide.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');

    const narrow = setup(true);
    expect(renderHook(() => narrow.useIsMobile()).result.current).toBe(true);
  });

  it('updates when the media query fires change', () => {
    const { mql, useIsMobile } = setup(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      mql.matches = true;
      mql.fire();
    });
    expect(result.current).toBe(true);

    act(() => {
      mql.matches = false;
      mql.fire();
    });
    expect(result.current).toBe(false);
  });

  it('removes its change listener on unmount', () => {
    const { mql, useIsMobile } = setup(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(mql.addEventListener).toHaveBeenCalledTimes(1);
    const [, listener] = mql.addEventListener.mock.calls[0];

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('calls matchMedia once across rerenders', () => {
    const { matchMedia, useIsMobile } = setup(false);
    const { rerender } = renderHook(() => useIsMobile());
    rerender();
    rerender();
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });
});
