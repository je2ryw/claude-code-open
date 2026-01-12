/**
 * Terminal Utilities - 终端渲染稳定性工具
 *
 * 实现 v2.1.3 的终端渲染稳定性改进：
 * - 防止不受控的写入损坏光标状态
 * - 提供光标状态保护机制
 * - 安全的终端写入包装
 *
 * 从官方 Claude Code v2.1.3 逆向工程
 */

import * as process from 'process';

// ANSI 转义序列
const ESC = '\x1b';
const CSI = `${ESC}[`;

// 光标控制序列
export const CURSOR = {
  SHOW: `${CSI}?25h`,
  HIDE: `${CSI}?25l`,
  SAVE: `${ESC}7`,
  RESTORE: `${ESC}8`,
  // 备用保存/恢复（某些终端使用）
  SAVE_ALT: `${CSI}s`,
  RESTORE_ALT: `${CSI}u`,
} as const;

// 清屏序列
export const CLEAR = {
  // 清除从光标到行尾
  TO_END_OF_LINE: `${CSI}K`,
  // 清除从光标到行首
  TO_START_OF_LINE: `${CSI}1K`,
  // 清除整行
  LINE: `${CSI}2K`,
  // 清除从光标到屏幕底部
  TO_END: `${CSI}J`,
  // 清除从光标到屏幕顶部
  TO_START: `${CSI}1J`,
  // 清除整个屏幕
  SCREEN: `${CSI}2J`,
} as const;

// 光标移动
export const MOVE = {
  // 上移 n 行
  up: (n: number = 1) => `${CSI}${n}A`,
  // 下移 n 行
  down: (n: number = 1) => `${CSI}${n}B`,
  // 右移 n 列
  right: (n: number = 1) => `${CSI}${n}C`,
  // 左移 n 列
  left: (n: number = 1) => `${CSI}${n}D`,
  // 移动到指定位置
  to: (row: number, col: number) => `${CSI}${row};${col}H`,
  // 移动到行首
  toLineStart: () => '\r',
  // 移动到下一行行首
  toNextLine: () => `${CSI}E`,
} as const;

/**
 * 光标状态管理器
 * 防止不受控的写入损坏光标状态
 */
class CursorStateManager {
  private _visible: boolean = true;
  private _savedPositions: Array<{ row: number; col: number }> = [];
  private _writeQueue: Array<() => void> = [];
  private _isWriting: boolean = false;

  /**
   * 获取当前光标可见状态
   */
  get isVisible(): boolean {
    return this._visible;
  }

  /**
   * 显示光标
   */
  show(): void {
    this._visible = true;
    this.safeWrite(CURSOR.SHOW);
  }

  /**
   * 隐藏光标
   */
  hide(): void {
    this._visible = false;
    this.safeWrite(CURSOR.HIDE);
  }

  /**
   * 保存光标位置
   */
  save(): void {
    this.safeWrite(CURSOR.SAVE);
  }

  /**
   * 恢复光标位置
   */
  restore(): void {
    this.safeWrite(CURSOR.RESTORE);
  }

  /**
   * 确保光标可见（用于恢复）
   */
  ensureVisible(): void {
    if (!this._visible) {
      this.show();
    }
  }

  /**
   * 安全写入到 stdout
   * 使用队列防止并发写入导致状态损坏
   */
  safeWrite(data: string): void {
    this._writeQueue.push(() => {
      try {
        process.stdout.write(data);
      } catch (e) {
        // 忽略写入错误（终端可能已断开）
      }
    });

    this._processQueue();
  }

  /**
   * 处理写入队列
   */
  private _processQueue(): void {
    if (this._isWriting || this._writeQueue.length === 0) {
      return;
    }

    this._isWriting = true;

    try {
      while (this._writeQueue.length > 0) {
        const write = this._writeQueue.shift();
        if (write) {
          write();
        }
      }
    } finally {
      this._isWriting = false;
    }
  }

  /**
   * 执行受保护的操作
   * 在操作期间保存和恢复光标状态
   */
  withProtection<T>(fn: () => T): T {
    const wasVisible = this._visible;

    try {
      this.save();
      return fn();
    } finally {
      this.restore();
      if (wasVisible !== this._visible) {
        if (wasVisible) {
          this.show();
        } else {
          this.hide();
        }
      }
    }
  }

  /**
   * 在权限对话框关闭后恢复光标
   * 实现 v2.1.0 修复：关闭权限对话框后光标消失的问题
   */
  restoreAfterDialog(): void {
    // 确保光标可见并重置位置
    this.show();
    // 某些终端需要额外的刷新
    this.safeWrite(CURSOR.SHOW);
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this._visible = true;
    this._savedPositions = [];
    this._writeQueue = [];
    this._isWriting = false;
    this.show();
  }
}

// 全局单例
export const cursorManager = new CursorStateManager();

/**
 * 安全的终端写入
 * 包装 process.stdout.write 以防止状态损坏
 */
export function safeWrite(data: string): void {
  cursorManager.safeWrite(data);
}

/**
 * 清除 n 行
 */
export function clearLines(count: number): void {
  if (count <= 0) return;

  let output = '';
  for (let i = 0; i < count; i++) {
    output += CLEAR.LINE + (i < count - 1 ? MOVE.up(1) : '');
  }
  output += MOVE.toLineStart();

  safeWrite(output);
}

/**
 * 在权限对话框关闭后恢复光标状态
 * 这修复了 v2.1.0 中报告的问题
 */
export function restoreCursorAfterDialog(): void {
  cursorManager.restoreAfterDialog();
}

/**
 * 执行受保护的终端操作
 */
export function withCursorProtection<T>(fn: () => T): T {
  return cursorManager.withProtection(fn);
}

export default {
  CURSOR,
  CLEAR,
  MOVE,
  cursorManager,
  safeWrite,
  clearLines,
  restoreCursorAfterDialog,
  withCursorProtection,
};
