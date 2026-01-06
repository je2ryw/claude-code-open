/**
 * BreathingLight Component
 * A soothing visual indicator with breathing animation effect
 * Perfect for loading states, notifications, and status indicators
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface BreathingLightProps {
  /** Light color - supports all terminal colors */
  color?: 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'white';
  /** Breathing intensity (0-100) - controls opacity variation range */
  intensity?: number;
  /** Breathing animation frequency */
  frequency?: 'slow' | 'normal' | 'fast';
  /** Optional label to display next to the light */
  label?: string;
  /** Physical size of the breathing light */
  size?: 'small' | 'medium' | 'large';
  /** Whether the animation is paused */
  paused?: boolean;
}

// Animation timings for different frequencies (milliseconds)
const FREQUENCY_MAP = {
  slow: 2000,
  normal: 1500,
  fast: 1000,
};

// Size character mapping
const SIZE_CHARS = {
  small: '●',
  medium: '◯',
  large: '⭕',
};

// Update interval for animation (ms)
const ANIMATION_UPDATE_INTERVAL = 50;

export const BreathingLight: React.FC<BreathingLightProps> = ({
  color = 'cyan',
  intensity = 100,
  frequency = 'normal',
  label,
  size = 'medium',
  paused = false,
}) => {
  const [frame, setFrame] = useState(0);
  const [currentOpacity, setCurrentOpacity] = useState(1);

  // Clamp intensity to valid range
  const validIntensity = Math.max(0, Math.min(100, intensity));

  // Animation loop for breathing effect
  useEffect(() => {
    if (paused) {
      return;
    }

    const cycleDuration = FREQUENCY_MAP[frequency];
    const updateInterval = ANIMATION_UPDATE_INTERVAL;

    const timer = setInterval(() => {
      setFrame((prevFrame) => {
        const nextFrame = (prevFrame + 1) % (cycleDuration / updateInterval);

        // Calculate breathing wave using sine function
        // Maps frame to 0-2π for full sine wave cycle
        const progress = (nextFrame / (cycleDuration / updateInterval)) * Math.PI * 2;
        const sine = Math.sin(progress);

        // Map sine wave (-1 to 1) to opacity range
        // At minimum intensity: min opacity stays at 0.3
        // At maximum intensity: full range from 0.3 to 1.0
        const minOpacity = 0.3;
        const maxOpacity = 1.0;
        const intensityFactor = validIntensity / 100;
        const opacityRange = (maxOpacity - minOpacity) * intensityFactor;
        const newOpacity = minOpacity + ((sine + 1) / 2) * opacityRange;

        setCurrentOpacity(Math.max(0, Math.min(1, newOpacity)));

        return nextFrame;
      });
    }, updateInterval);

    return () => clearInterval(timer);
  }, [frequency, paused, validIntensity]);

  // Get the character representation for the breathing light
  const lightChar = SIZE_CHARS[size];

  // Render the breathing light with calculated opacity
  // Note: Ink doesn't support opacity directly, so we use color dimming as visual feedback
  const shouldDim = currentOpacity < 0.6;

  return (
    <Box>
      <Text color={color} dimColor={shouldDim}>
        {lightChar}
      </Text>
      {label && (
        <Text> {label}</Text>
      )}
    </Box>
  );
};

/**
 * MultiBreathingLight Component
 * Display multiple breathing lights with different colors and labels
 * Useful for showing multiple status indicators simultaneously
 */
export interface MultiBreathingLightProps {
  lights: Array<{
    id: string;
    label: string;
    color?: BreathingLightProps['color'];
    intensity?: number;
    frequency?: BreathingLightProps['frequency'];
    size?: BreathingLightProps['size'];
    paused?: boolean;
  }>;
}

export const MultiBreathingLight: React.FC<MultiBreathingLightProps> = ({ lights }) => {
  return (
    <Box flexDirection="column" gap={0}>
      {lights.map((light) => (
        <BreathingLight
          key={light.id}
          color={light.color}
          intensity={light.intensity}
          frequency={light.frequency}
          label={light.label}
          size={light.size}
          paused={light.paused}
        />
      ))}
    </Box>
  );
};

/**
 * BreathingLightRing Component
 * A circular ring of breathing lights, useful for loading states
 */
export interface BreathingLightRingProps {
  /** Number of lights in the ring */
  count?: number;
  /** Color of the lights */
  color?: BreathingLightProps['color'];
  /** Animation frequency */
  frequency?: BreathingLightProps['frequency'];
  /** Delay between light animations (creates wave effect) */
  delay?: number; // milliseconds
}

export const BreathingLightRing: React.FC<BreathingLightRingProps> = ({
  count = 4,
  color = 'cyan',
  frequency = 'normal',
  delay = 100,
}) => {
  const lights = Array.from({ length: count }, (_, index) => {
    const pauseOffset = (index * delay) / FREQUENCY_MAP[frequency];
    return {
      id: `light-${index}`,
      label: '',
      color,
      frequency,
      intensity: 100,
    };
  });

  return (
    <Box>
      {lights.map((light) => (
        <Box key={light.id} marginRight={light.id === `light-${count - 1}` ? 0 : 1}>
          <BreathingLight
            color={light.color}
            frequency={light.frequency}
            intensity={light.intensity}
            size="small"
          />
        </Box>
      ))}
    </Box>
  );
};

/**
 * PulsingText Component
 * Text that pulses with breathing animation
 * Great for emphasizing important information
 */
export interface PulsingTextProps {
  text: string;
  color?: BreathingLightProps['color'];
  intensity?: number;
  frequency?: BreathingLightProps['frequency'];
  paused?: boolean;
}

export const PulsingText: React.FC<PulsingTextProps> = ({
  text,
  color = 'cyan',
  intensity = 100,
  frequency = 'normal',
  paused = false,
}) => {
  const [frame, setFrame] = useState(0);
  const [dimmed, setDimmed] = useState(false);

  const validIntensity = Math.max(0, Math.min(100, intensity));

  // Animation loop for text pulsing
  useEffect(() => {
    if (paused) {
      return;
    }

    const cycleDuration = FREQUENCY_MAP[frequency];
    const updateInterval = ANIMATION_UPDATE_INTERVAL;

    const timer = setInterval(() => {
      setFrame((prevFrame) => {
        const nextFrame = (prevFrame + 1) % (cycleDuration / updateInterval);
        const progress = (nextFrame / (cycleDuration / updateInterval)) * Math.PI * 2;
        const sine = Math.sin(progress);
        const opacity = (sine + 1) / 2;

        // Dim text when opacity is low
        setDimmed(opacity < 0.6 && validIntensity > 0);

        return nextFrame;
      });
    }, updateInterval);

    return () => clearInterval(timer);
  }, [frequency, paused, validIntensity]);

  return (
    <Text color={color} dimColor={dimmed}>
      {text}
    </Text>
  );
};

export default BreathingLight;
