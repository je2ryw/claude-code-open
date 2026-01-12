/**
 * PermissionDestinationSelector 前端组件测试
 *
 * 测试 v2.1.3 权限请求目标选择器 UI 组件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PermissionDestinationSelector,
  PermissionDestinationDropdown,
  PERMISSION_DESTINATIONS,
  type PermissionDestination,
} from '../../src/web/client/src/components/PermissionDestinationSelector';

// Mock CSS modules
vi.mock('../../src/web/client/src/components/PermissionDestinationSelector.module.css', () => ({
  default: {
    container: 'container',
    compact: 'compact',
    horizontal: 'horizontal',
    disabled: 'disabled',
    header: 'header',
    headerIcon: 'headerIcon',
    headerText: 'headerText',
    optionsContainer: 'optionsContainer',
    option: 'option',
    selected: 'selected',
    hovered: 'hovered',
    optionIcon: 'optionIcon',
    optionContent: 'optionContent',
    optionLabel: 'optionLabel',
    optionDescription: 'optionDescription',
    optionPath: 'optionPath',
    shortcut: 'shortcut',
    shortcutHint: 'shortcutHint',
    checkmark: 'checkmark',
    dropdown: 'dropdown',
    dropdownTrigger: 'dropdownTrigger',
    dropdownIcon: 'dropdownIcon',
    dropdownLabel: 'dropdownLabel',
    dropdownArrow: 'dropdownArrow',
    dropdownMenu: 'dropdownMenu',
    dropdownItem: 'dropdownItem',
    dropdownItemSelected: 'dropdownItemSelected',
    dropdownItemIcon: 'dropdownItemIcon',
    dropdownItemContent: 'dropdownItemContent',
    dropdownItemLabel: 'dropdownItemLabel',
    dropdownItemDescription: 'dropdownItemDescription',
    dropdownItemCheck: 'dropdownItemCheck',
  },
}));

describe('PERMISSION_DESTINATIONS', () => {
  it('should have 4 destination options', () => {
    expect(PERMISSION_DESTINATIONS).toHaveLength(4);
  });

  it('should include project destination', () => {
    const project = PERMISSION_DESTINATIONS.find((d) => d.id === 'project');
    expect(project).toBeDefined();
    expect(project?.label).toBe('This project');
    expect(project?.path).toBe('.claude/settings.json');
  });

  it('should include global destination', () => {
    const global = PERMISSION_DESTINATIONS.find((d) => d.id === 'global');
    expect(global).toBeDefined();
    expect(global?.label).toBe('All projects');
    expect(global?.path).toBe('~/.claude/settings.json');
  });

  it('should include team destination', () => {
    const team = PERMISSION_DESTINATIONS.find((d) => d.id === 'team');
    expect(team).toBeDefined();
    expect(team?.label).toBe('Shared with team');
    expect(team?.path).toBe('.claude/settings.local.json');
  });

  it('should include session destination', () => {
    const session = PERMISSION_DESTINATIONS.find((d) => d.id === 'session');
    expect(session).toBeDefined();
    expect(session?.label).toBe('Session only');
    expect(session?.path).toBeUndefined();
  });

  it('should have shortcuts for all destinations', () => {
    PERMISSION_DESTINATIONS.forEach((dest) => {
      expect(dest.shortcut).toBeDefined();
      expect(dest.shortcut?.length).toBe(1);
    });
  });
});

describe('PermissionDestinationSelector', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('should render all destination options', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('This project')).toBeInTheDocument();
    expect(screen.getByText('All projects')).toBeInTheDocument();
    expect(screen.getByText('Shared with team')).toBeInTheDocument();
    expect(screen.getByText('Session only')).toBeInTheDocument();
  });

  it('should render header', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('Where to save this permission?')).toBeInTheDocument();
  });

  it('should call onSelect when option is clicked', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByText('This project'));
    expect(onSelect).toHaveBeenCalledWith('project');

    fireEvent.click(screen.getByText('All projects'));
    expect(onSelect).toHaveBeenCalledWith('global');
  });

  it('should show selected state for current destination', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="project"
        onSelect={onSelect}
      />
    );

    const projectButton = screen.getByRole('radio', { name: /this project/i });
    expect(projectButton).toHaveAttribute('aria-checked', 'true');
  });

  it('should not call onSelect when disabled', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
        disabled
      />
    );

    fireEvent.click(screen.getByText('This project'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should show shortcuts when showShortcuts is true', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
        showShortcuts
      />
    );

    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('should show paths when showPaths is true', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
        showPaths
      />
    );

    expect(screen.getByText('.claude/settings.json')).toBeInTheDocument();
    expect(screen.getByText('~/.claude/settings.json')).toBeInTheDocument();
    expect(screen.getByText('.claude/settings.local.json')).toBeInTheDocument();
  });

  it('should hide descriptions in compact mode', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
        compact
      />
    );

    // 描述应该不可见
    expect(screen.queryByText(/Save to .claude\/settings.json/)).not.toBeInTheDocument();
  });

  it('should respond to keyboard navigation', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    const firstOption = screen.getAllByRole('radio')[0];
    fireEvent.keyDown(firstOption, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalled();
  });
});

describe('PermissionDestinationDropdown', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('should render current destination label', () => {
    render(
      <PermissionDestinationDropdown
        currentDestination="project"
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('This project')).toBeInTheDocument();
  });

  it('should toggle dropdown when clicked', () => {
    render(
      <PermissionDestinationDropdown
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    const trigger = screen.getByRole('button', { name: /session only/i });
    fireEvent.click(trigger);

    // 菜单应该显示所有选项
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('should call onSelect and close when option is selected', () => {
    render(
      <PermissionDestinationDropdown
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    // 打开菜单
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // 选择选项
    const projectOption = screen.getByRole('option', { name: /this project/i });
    fireEvent.click(projectOption);

    expect(onSelect).toHaveBeenCalledWith('project');
  });

  it('should not toggle when disabled', () => {
    render(
      <PermissionDestinationDropdown
        currentDestination="session"
        onSelect={onSelect}
        disabled
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // 菜单不应该显示
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('should show checkmark for selected option', () => {
    render(
      <PermissionDestinationDropdown
        currentDestination="global"
        onSelect={onSelect}
      />
    );

    // 打开菜单
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const globalOption = screen.getByRole('option', { name: /all projects/i });
    expect(globalOption).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Keyboard shortcuts', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('should respond to P key for project', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    fireEvent.keyDown(window, { key: 'P' });
    expect(onSelect).toHaveBeenCalledWith('project');
  });

  it('should respond to G key for global', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    fireEvent.keyDown(window, { key: 'G' });
    expect(onSelect).toHaveBeenCalledWith('global');
  });

  it('should respond to T key for team', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    fireEvent.keyDown(window, { key: 'T' });
    expect(onSelect).toHaveBeenCalledWith('team');
  });

  it('should respond to S key for session', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="project"
        onSelect={onSelect}
      />
    );

    fireEvent.keyDown(window, { key: 'S' });
    expect(onSelect).toHaveBeenCalledWith('session');
  });

  it('should not respond to shortcuts when disabled', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
        disabled
      />
    );

    fireEvent.keyDown(window, { key: 'P' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Accessibility', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('should have radiogroup role', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('should have aria-label', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-label',
      'Permission save location'
    );
  });

  it('should have radio roles for options', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="session"
        onSelect={onSelect}
      />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
  });

  it('should have correct tabindex', () => {
    render(
      <PermissionDestinationSelector
        currentDestination="project"
        onSelect={onSelect}
      />
    );

    const projectRadio = screen.getByRole('radio', { name: /this project/i });
    const sessionRadio = screen.getByRole('radio', { name: /session only/i });

    expect(projectRadio).toHaveAttribute('tabindex', '0');
    expect(sessionRadio).toHaveAttribute('tabindex', '-1');
  });
});
