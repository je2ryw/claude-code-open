/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useNavigationHistory, NavigationItem } from '../useNavigationHistory';

describe('useNavigationHistory', () => {
  const createItem = (id: string, type: 'symbol' | 'file' | 'map' = 'symbol'): NavigationItem => ({
    id,
    type,
    label: id,
    timestamp: Date.now()
  });

  it('should initialize with empty history', () => {
    const { result } = renderHook(() => useNavigationHistory());

    expect(result.current.history).toEqual([]);
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
    expect(result.current.current).toBeNull();
  });

  it('should push items to history', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.current?.id).toBe('item1');

    act(() => {
      result.current.push(createItem('item2'));
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.current?.id).toBe('item2');
  });

  it('should not push duplicate consecutive items', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
      result.current.push(createItem('item1')); // Duplicate
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.currentIndex).toBe(0);
  });

  it('should navigate back correctly', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
      result.current.push(createItem('item2'));
      result.current.push(createItem('item3'));
    });

    expect(result.current.currentIndex).toBe(2);
    expect(result.current.canGoBack).toBe(true);

    let item: NavigationItem | null = null;
    act(() => {
      item = result.current.back();
    });

    expect(item?.id).toBe('item2');
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.current?.id).toBe('item2');
  });

  it('should navigate forward correctly', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
    });

    act(() => {
      result.current.push(createItem('item2'));
    });

    act(() => {
      result.current.back();
    });

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.canGoForward).toBe(true);

    let item: NavigationItem | null = null;
    act(() => {
      item = result.current.forward();
    });

    expect(item?.id).toBe('item2');
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.current?.id).toBe('item2');
  });

  it('should clear forward history when pushing from middle', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
    });

    act(() => {
      result.current.push(createItem('item2'));
    });

    act(() => {
      result.current.push(createItem('item3'));
    });

    act(() => {
      result.current.back(); // Go to item2
    });

    act(() => {
      result.current.back(); // Go to item1
    });

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.history).toHaveLength(3);

    act(() => {
      result.current.push(createItem('item4')); // Branch from item1
    });

    expect(result.current.history).toHaveLength(2);
    expect(result.current.history.map(h => h.id)).toEqual(['item1', 'item4']);
    expect(result.current.canGoForward).toBe(false);
  });

  it('should limit history size', () => {
    const { result } = renderHook(() => useNavigationHistory(3));

    act(() => {
      result.current.push(createItem('item1'));
      result.current.push(createItem('item2'));
      result.current.push(createItem('item3'));
      result.current.push(createItem('item4')); // Should evict item1
    });

    expect(result.current.history).toHaveLength(3);
    expect(result.current.history.map(h => h.id)).toEqual(['item2', 'item3', 'item4']);
    expect(result.current.currentIndex).toBe(2);
  });

  it('should handle back at start of history', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
    });

    let item: NavigationItem | null = null;
    act(() => {
      item = result.current.back();
    });

    expect(item).toBeNull();
    expect(result.current.currentIndex).toBe(0); // Should not change
  });

  it('should handle forward at end of history', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
      result.current.push(createItem('item2'));
    });

    let item: NavigationItem | null = null;
    act(() => {
      item = result.current.forward();
    });

    expect(item).toBeNull();
    expect(result.current.currentIndex).toBe(1); // Should not change
  });

  it('should clear history', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.push(createItem('item1'));
      result.current.push(createItem('item2'));
    });

    expect(result.current.history).toHaveLength(2);

    act(() => {
      result.current.clear();
    });

    expect(result.current.history).toHaveLength(0);
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });
});
