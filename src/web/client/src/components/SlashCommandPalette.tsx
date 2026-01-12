import { useState, useEffect, useRef } from 'react';
import { SLASH_COMMANDS } from '../utils/constants';
import type { SlashCommand } from '../types';

interface SlashCommandPaletteProps {
  input: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function SlashCommandPalette({ input, onSelect, onClose }: SlashCommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const paletteRef = useRef<HTMLDivElement>(null);

  // 过滤匹配的命令
  const query = input.slice(1).toLowerCase();
  const filteredCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.name.slice(1).startsWith(query) ||
    cmd.aliases?.some(a => a.slice(1).startsWith(query))
  );

  // 重置选中索引当过滤结果变化时
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands.length > 0) {
          e.preventDefault();
          onSelect(filteredCommands[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  if (filteredCommands.length === 0) return null;

  return (
    <div ref={paletteRef} className="slash-command-palette">
      {filteredCommands.map((cmd, i) => (
        <div
          key={cmd.name}
          className={`slash-command-item ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="command-name">{cmd.name}</span>
          <span className="command-desc">{cmd.description}</span>
          {cmd.usage && <span className="command-usage">{cmd.usage}</span>}
        </div>
      ))}
    </div>
  );
}
