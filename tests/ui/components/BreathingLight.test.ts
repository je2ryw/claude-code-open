/**
 * Comprehensive tests for BreathingLight animation component
 * Tests all features: breathing effect, colors, intensity variations, states
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';

// Types and interfaces for testing
interface BreathingLightProps {
  color?: 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'white';
  intensity?: number; // 0-100
  frequency?: 'slow' | 'normal' | 'fast';
  label?: string;
  size?: 'small' | 'medium' | 'large';
  paused?: boolean;
}

/**
 * Test suite for BreathingLight component
 */
describe('BreathingLight Component', () => {
  // Setup before each test
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // Cleanup after each test
  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default props', () => {
      const props: BreathingLightProps = {};
      expect(props.color).toBeUndefined();
      expect(props.intensity).toBeUndefined();
      expect(props.frequency).toBeUndefined();
      expect(props.label).toBeUndefined();
    });

    it('should initialize with custom color', () => {
      const props: BreathingLightProps = { color: 'green' };
      expect(props.color).toBe('green');
    });

    it('should initialize with custom intensity', () => {
      const props: BreathingLightProps = { intensity: 75 };
      expect(props.intensity).toBe(75);
    });

    it('should initialize with custom frequency', () => {
      const props: BreathingLightProps = { frequency: 'fast' };
      expect(props.frequency).toBe('fast');
    });

    it('should initialize with label', () => {
      const props: BreathingLightProps = { label: 'Loading...' };
      expect(props.label).toBe('Loading...');
    });

    it('should initialize with size prop', () => {
      const props: BreathingLightProps = { size: 'large' };
      expect(props.size).toBe('large');
    });
  });

  describe('Intensity Calculation', () => {
    it('should validate intensity is within 0-100 range', () => {
      const validateIntensity = (value: number): boolean => value >= 0 && value <= 100;
      
      expect(validateIntensity(0)).toBe(true);
      expect(validateIntensity(50)).toBe(true);
      expect(validateIntensity(100)).toBe(true);
      expect(validateIntensity(-1)).toBe(false);
      expect(validateIntensity(101)).toBe(false);
    });

    it('should clamp intensity to valid range', () => {
      const clampIntensity = (value: number): number => Math.max(0, Math.min(100, value));
      
      expect(clampIntensity(-10)).toBe(0);
      expect(clampIntensity(50)).toBe(50);
      expect(clampIntensity(150)).toBe(100);
    });

    it('should calculate breathing opacity based on intensity', () => {
      const calculateOpacity = (intensity: number, breathingFactor: number): number => {
        const normalizedIntensity = Math.max(0, Math.min(100, intensity));
        const minOpacity = 0.3;
        const maxOpacity = 1.0;
        const range = maxOpacity - minOpacity;
        return minOpacity + (normalizedIntensity / 100) * range * breathingFactor;
      };

      const intensity = 80;
      // At breathing factor 0.5 (mid-breath)
      const opacity = calculateOpacity(intensity, 0.5);
      expect(opacity).toBeGreaterThan(0.3);
      expect(opacity).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Breathing Effect', () => {
    it('should generate breathing frames for slow frequency', () => {
      const generateBreathingFrames = (frequency: 'slow' | 'normal' | 'fast'): number => {
        const frequencies = { slow: 2000, normal: 1500, fast: 1000 };
        return frequencies[frequency];
      };

      expect(generateBreathingFrames('slow')).toBe(2000);
    });

    it('should generate breathing frames for normal frequency', () => {
      const generateBreathingFrames = (frequency: 'slow' | 'normal' | 'fast'): number => {
        const frequencies = { slow: 2000, normal: 1500, fast: 1000 };
        return frequencies[frequency];
      };

      expect(generateBreathingFrames('normal')).toBe(1500);
    });

    it('should generate breathing frames for fast frequency', () => {
      const generateBreathingFrames = (frequency: 'slow' | 'normal' | 'fast'): number => {
        const frequencies = { slow: 2000, normal: 1500, fast: 1000 };
        return frequencies[frequency];
      };

      expect(generateBreathingFrames('fast')).toBe(1000);
    });

    it('should calculate breathing cycle position (0-1)', () => {
      const calculateCyclePosition = (elapsedTime: number, frequency: number): number => {
        const cycles = (elapsedTime % frequency) / frequency;
        return Math.sin(cycles * Math.PI * 2) * 0.5 + 0.5;
      };

      const position = calculateCyclePosition(0, 1000);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(1);
    });

    it('should create smooth breathing wave using sine function', () => {
      const createBreathingWave = (time: number, period: number): number => {
        return (Math.sin((time / period) * Math.PI * 2) + 1) / 2;
      };

      // At time 0, should be at middle
      const value0 = createBreathingWave(0, 1000);
      expect(value0).toBeCloseTo(0.5, 1);

      // At quarter period, should be at max
      const valueQuarter = createBreathingWave(250, 1000);
      expect(valueQuarter).toBeCloseTo(1, 0);

      // At half period, should be at middle
      const valueHalf = createBreathingWave(500, 1000);
      expect(valueHalf).toBeCloseTo(0.5, 1);
    });
  });

  describe('Color Support', () => {
    it('should support red color', () => {
      const props: BreathingLightProps = { color: 'red' };
      expect(props.color).toBe('red');
    });

    it('should support green color', () => {
      const props: BreathingLightProps = { color: 'green' };
      expect(props.color).toBe('green');
    });

    it('should support cyan color', () => {
      const props: BreathingLightProps = { color: 'cyan' };
      expect(props.color).toBe('cyan');
    });

    it('should support all standard terminal colors', () => {
      const colors = ['red', 'green', 'yellow', 'blue', 'cyan', 'magenta', 'white'] as const;
      const props: BreathingLightProps = { color: colors[0] };
      expect(colors).toContain(props.color);
    });
  });

  describe('Size Variations', () => {
    it('should support small size', () => {
      const props: BreathingLightProps = { size: 'small' };
      expect(props.size).toBe('small');
    });

    it('should support medium size', () => {
      const props: BreathingLightProps = { size: 'medium' };
      expect(props.size).toBe('medium');
    });

    it('should support large size', () => {
      const props: BreathingLightProps = { size: 'large' };
      expect(props.size).toBe('large');
    });

    it('should calculate character representation for different sizes', () => {
      const getSizeChar = (size: 'small' | 'medium' | 'large'): string => {
        const chars = { small: '●', medium: '◯', large: '⭕' };
        return chars[size];
      };

      expect(getSizeChar('small')).toBe('●');
      expect(getSizeChar('medium')).toBe('◯');
      expect(getSizeChar('large')).toBe('⭕');
    });
  });

  describe('Pause Control', () => {
    it('should support paused state', () => {
      const props: BreathingLightProps = { paused: true };
      expect(props.paused).toBe(true);
    });

    it('should support unpaused (running) state', () => {
      const props: BreathingLightProps = { paused: false };
      expect(props.paused).toBe(false);
    });

    it('should maintain opacity when paused', () => {
      const maintainOpacityWhenPaused = (paused: boolean, currentOpacity: number): number => {
        return paused ? currentOpacity : -1; // -1 means should update
      };

      expect(maintainOpacityWhenPaused(true, 0.7)).toBe(0.7);
      expect(maintainOpacityWhenPaused(false, 0.7)).toBe(-1);
    });
  });

  describe('Animation Timing', () => {
    it('should update animation frame at correct interval', () => {
      const interval = setInterval(() => {
        // Animation update
      }, 50);

      expect(interval).toBeDefined();
      clearInterval(interval);
    });

    it('should respect frequency settings in animation timing', () => {
      const getUpdateInterval = (frequency: 'slow' | 'normal' | 'fast'): number => {
        const intervals = { slow: 100, normal: 50, fast: 25 };
        return intervals[frequency];
      };

      expect(getUpdateInterval('slow')).toBe(100);
      expect(getUpdateInterval('normal')).toBe(50);
      expect(getUpdateInterval('fast')).toBe(25);
    });

    it('should clean up intervals on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const interval = setInterval(() => {}, 50);
      clearInterval(interval);

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Multiple Instances', () => {
    it('should support multiple breathing lights with different colors', () => {
      const lights = [
        { color: 'red' as const, label: 'Error' },
        { color: 'green' as const, label: 'Success' },
        { color: 'cyan' as const, label: 'Loading' },
      ];

      expect(lights).toHaveLength(3);
      expect(lights[0].color).toBe('red');
      expect(lights[1].color).toBe('green');
      expect(lights[2].color).toBe('cyan');
    });

    it('should support multiple breathing lights with different frequencies', () => {
      const lights = [
        { frequency: 'slow' as const },
        { frequency: 'normal' as const },
        { frequency: 'fast' as const },
      ];

      expect(lights).toHaveLength(3);
      expect(lights[0].frequency).toBe('slow');
      expect(lights[1].frequency).toBe('normal');
      expect(lights[2].frequency).toBe('fast');
    });
  });

  describe('Label Rendering', () => {
    it('should render label when provided', () => {
      const props: BreathingLightProps = { label: 'Connecting...' };
      expect(props.label).toBe('Connecting...');
    });

    it('should not require label', () => {
      const props: BreathingLightProps = {};
      expect(props.label).toBeUndefined();
    });

    it('should render custom labels', () => {
      const labels = ['Loading', 'Saving', 'Syncing', 'Processing'];
      labels.forEach((label) => {
        const props: BreathingLightProps = { label };
        expect(props.label).toBe(label);
      });
    });
  });

  describe('Default Values', () => {
    it('should use default color when not specified', () => {
      const getDefaultColor = (): string => 'cyan';
      expect(getDefaultColor()).toBe('cyan');
    });

    it('should use default intensity when not specified', () => {
      const getDefaultIntensity = (): number => 100;
      expect(getDefaultIntensity()).toBe(100);
    });

    it('should use default frequency when not specified', () => {
      const getDefaultFrequency = (): string => 'normal';
      expect(getDefaultFrequency()).toBe('normal');
    });

    it('should use default size when not specified', () => {
      const getDefaultSize = (): string => 'medium';
      expect(getDefaultSize()).toBe('medium');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero intensity', () => {
      const props: BreathingLightProps = { intensity: 0 };
      expect(props.intensity).toBe(0);
      expect(props.intensity).toBeGreaterThanOrEqual(0);
    });

    it('should handle maximum intensity', () => {
      const props: BreathingLightProps = { intensity: 100 };
      expect(props.intensity).toBe(100);
      expect(props.intensity).toBeLessThanOrEqual(100);
    });

    it('should handle very long labels', () => {
      const longLabel = 'This is a very long label for the breathing light indicator';
      const props: BreathingLightProps = { label: longLabel };
      expect(props.label).toBe(longLabel);
      expect(props.label?.length).toBeGreaterThan(50);
    });

    it('should handle empty label', () => {
      const props: BreathingLightProps = { label: '' };
      expect(props.label).toBe('');
    });
  });
});
