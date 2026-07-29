import { renderHook, act } from '@testing-library/react';
import { useScreenSize } from './useScreenSize';

describe('useScreenSize', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  });

  test('should return isMobile true when width is less than 768px', () => {
    window.innerWidth = 767;
    const { result } = renderHook(() => useScreenSize());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.width).toBe(767);
  });

  it('should return isMobile false when width is 768px or greater', () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useScreenSize());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.width).toBe(768);
  });

  it('should update values when window is resized', () => {
    const { result } = renderHook(() => useScreenSize());

    // Initial large screen
    window.innerWidth = 1024;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(false);
    expect(result.current.width).toBe(1024);

    // Resize to mobile
    window.innerWidth = 500;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(true);
    expect(result.current.width).toBe(500);
  });
});
