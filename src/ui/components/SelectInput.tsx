/**
 * SelectInput 组件
 * 交互式选择器，类似官方的选择界面
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface SelectOption<T = string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

interface SelectInputProps<T = string> {
  items: SelectOption<T>[];
  onSelect: (item: SelectOption<T>) => void;
  onCancel?: () => void;
  title?: string;
  hint?: string;
  initialIndex?: number;
}

export function SelectInput<T = string>({
  items,
  onSelect,
  onCancel,
  title,
  hint = '↑/↓ to navigate · enter to select · esc to go back',
  initialIndex = 0,
}: SelectInputProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => {
        let newIndex = prev - 1;
        if (newIndex < 0) newIndex = items.length - 1;
        // Skip disabled items
        while (items[newIndex]?.disabled && newIndex !== prev) {
          newIndex--;
          if (newIndex < 0) newIndex = items.length - 1;
        }
        return newIndex;
      });
    } else if (key.downArrow) {
      setSelectedIndex((prev) => {
        let newIndex = prev + 1;
        if (newIndex >= items.length) newIndex = 0;
        // Skip disabled items
        while (items[newIndex]?.disabled && newIndex !== prev) {
          newIndex++;
          if (newIndex >= items.length) newIndex = 0;
        }
        return newIndex;
      });
    } else if (key.return) {
      const selectedItem = items[selectedIndex];
      if (selectedItem && !selectedItem.disabled) {
        onSelect(selectedItem);
      }
    } else if (key.escape && onCancel) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      {title && (
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            {title}
          </Text>
        </Box>
      )}

      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isDisabled = item.disabled;

        return (
          <Box key={String(item.value)} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '❯ ' : '  '}
              </Text>
              <Text
                color={isDisabled ? 'gray' : isSelected ? 'cyan' : 'white'}
                dimColor={isDisabled}
                bold={isSelected}
              >
                {item.label}
              </Text>
              {isDisabled && (
                <Text color="gray" dimColor>
                  {' '}
                  (unavailable)
                </Text>
              )}
            </Box>
            {item.description && isSelected && (
              <Box marginLeft={4}>
                <Text color="gray" dimColor>
                  {item.description}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {hint && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {hint}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default SelectInput;
