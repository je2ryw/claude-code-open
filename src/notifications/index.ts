/**
 * Notification System
 * Desktop and terminal notifications
 */

import * as child_process from 'child_process';
import * as os from 'os';
import { EventEmitter } from 'events';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type NotificationKind = 'task_complete' | 'agent_complete' | 'error' | 'permission_required' | 'update_available' | 'message' | 'custom';

/**
 * Agent completion result for inline display in notifications
 * (v2.1.7 feature: inline display of agent's final response)
 */
export interface AgentCompletionResult {
  agentId: string;
  agentType: string;
  description: string;
  status: 'completed' | 'failed' | 'killed';
  result?: string;
  resultSummary?: string;  // 摘要版本的结果
  duration?: number;       // 执行时长（毫秒）
  transcriptPath?: string; // 完整转录文件路径
}

export interface Notification {
  id: string;
  type: NotificationType;
  kind: NotificationKind;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actions?: NotificationAction[];
  data?: Record<string, unknown>;
  agentResult?: AgentCompletionResult;  // v2.1.7: inline agent result
}

export interface NotificationAction {
  label: string;
  action: string;
  primary?: boolean;
}

export interface NotificationConfig {
  enabled: boolean;
  desktopNotifications: boolean;
  soundEnabled: boolean;
  quietHoursStart?: number; // Hour (0-23)
  quietHoursEnd?: number;
  minPriority?: NotificationType;
}

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  desktopNotifications: true,
  soundEnabled: false,
};

// Priority order
const PRIORITY_ORDER: NotificationType[] = ['info', 'success', 'warning', 'error'];

/**
 * Notification Manager
 */
export class NotificationManager extends EventEmitter {
  private config: NotificationConfig;
  private notifications: Notification[] = [];
  private maxNotifications: number = 100;

  constructor(config: Partial<NotificationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Check quiet hours
    if (this.config.quietHoursStart !== undefined && this.config.quietHoursEnd !== undefined) {
      const now = new Date().getHours();
      if (this.config.quietHoursStart <= this.config.quietHoursEnd) {
        // Same day (e.g., 22-06)
        if (now >= this.config.quietHoursStart && now < this.config.quietHoursEnd) {
          return false;
        }
      } else {
        // Overnight (e.g., 22-06)
        if (now >= this.config.quietHoursStart || now < this.config.quietHoursEnd) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if notification meets minimum priority
   */
  private meetsPriority(type: NotificationType): boolean {
    if (!this.config.minPriority) {
      return true;
    }

    const typeIndex = PRIORITY_ORDER.indexOf(type);
    const minIndex = PRIORITY_ORDER.indexOf(this.config.minPriority);

    return typeIndex >= minIndex;
  }

  /**
   * Send notification
   */
  notify(options: {
    type?: NotificationType;
    kind?: NotificationKind;
    title: string;
    message: string;
    actions?: NotificationAction[];
    data?: Record<string, unknown>;
    agentResult?: AgentCompletionResult;
  }): Notification | null {
    if (!this.isEnabled()) {
      return null;
    }

    const type = options.type || 'info';

    if (!this.meetsPriority(type)) {
      return null;
    }

    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      kind: options.kind || 'custom',
      title: options.title,
      message: options.message,
      timestamp: Date.now(),
      read: false,
      actions: options.actions,
      data: options.data,
      agentResult: options.agentResult,
    };

    // Add to list
    this.notifications.unshift(notification);

    // Trim old notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    // Emit event
    this.emit('notification', notification);

    // Send desktop notification
    if (this.config.desktopNotifications) {
      this.sendDesktopNotification(notification);
    }

    // Play sound
    if (this.config.soundEnabled) {
      this.playSound(type);
    }

    return notification;
  }

  /**
   * Send desktop notification
   */
  private async sendDesktopNotification(notification: Notification): Promise<void> {
    const platform = os.platform();

    try {
      if (platform === 'darwin') {
        // macOS
        const script = `display notification "${notification.message}" with title "${notification.title}"`;
        child_process.exec(`osascript -e '${script}'`);
      } else if (platform === 'linux') {
        // Linux (notify-send)
        const urgency = notification.type === 'error' ? 'critical' :
                       notification.type === 'warning' ? 'normal' : 'low';
        child_process.exec(`notify-send -u ${urgency} "${notification.title}" "${notification.message}"`);
      } else if (platform === 'win32') {
        // Windows (PowerShell)
        const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $textNodes = $template.GetElementsByTagName("text"); $textNodes.Item(0).AppendChild($template.CreateTextNode("${notification.title}")); $textNodes.Item(1).AppendChild($template.CreateTextNode("${notification.message}")); $toast = [Windows.UI.Notifications.ToastNotification]::new($template); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Code").Show($toast)`;
        child_process.exec(`powershell -command "${ps}"`);
      }
    } catch {
      // Ignore notification errors
    }
  }

  /**
   * Play notification sound
   */
  private playSound(type: NotificationType): void {
    const platform = os.platform();

    try {
      if (platform === 'darwin') {
        const sound = type === 'error' ? 'Basso' : type === 'warning' ? 'Sosumi' : 'Pop';
        child_process.exec(`afplay /System/Library/Sounds/${sound}.aiff`);
      } else if (platform === 'linux') {
        child_process.exec('paplay /usr/share/sounds/freedesktop/stereo/complete.oga');
      } else if (platform === 'win32') {
        child_process.exec('powershell -c (New-Object Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync()');
      }
    } catch {
      // Ignore sound errors
    }
  }

  /**
   * Get all notifications
   */
  getAll(): Notification[] {
    return [...this.notifications];
  }

  /**
   * Get unread notifications
   */
  getUnread(): Notification[] {
    return this.notifications.filter((n) => !n.read);
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): boolean {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
      this.emit('notification-read', notification);
      return true;
    }
    return false;
  }

  /**
   * Mark all as read
   */
  markAllAsRead(): void {
    this.notifications.forEach((n) => {
      n.read = true;
    });
    this.emit('all-read');
  }

  /**
   * Clear all notifications
   */
  clear(): void {
    this.notifications = [];
    this.emit('cleared');
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  // Convenience methods

  /**
   * Send info notification
   */
  info(title: string, message: string): Notification | null {
    return this.notify({ type: 'info', title, message });
  }

  /**
   * Send success notification
   */
  success(title: string, message: string): Notification | null {
    return this.notify({ type: 'success', kind: 'task_complete', title, message });
  }

  /**
   * Send warning notification
   */
  warn(title: string, message: string): Notification | null {
    return this.notify({ type: 'warning', title, message });
  }

  /**
   * Send error notification
   */
  error(title: string, message: string): Notification | null {
    return this.notify({ type: 'error', kind: 'error', title, message });
  }

  /**
   * Send task complete notification
   */
  taskComplete(taskName: string): Notification | null {
    return this.notify({
      type: 'success',
      kind: 'task_complete',
      title: 'Task Complete',
      message: taskName,
    });
  }

  /**
   * Send agent completion notification with inline result display
   * (v2.1.7 feature: inline display of agent's final response in task notifications)
   *
   * @param result Agent completion result containing status and response
   * @returns Notification object or null if notifications are disabled
   */
  notifyAgentCompletion(result: AgentCompletionResult): Notification | null {
    const statusText = result.status === 'completed' ? 'completed successfully' :
                       result.status === 'failed' ? 'failed' : 'was killed';

    // 生成结果摘要（如果结果太长则截断）
    const maxSummaryLength = 200;
    let resultSummary = result.resultSummary || result.result;
    if (resultSummary && resultSummary.length > maxSummaryLength) {
      resultSummary = resultSummary.substring(0, maxSummaryLength - 3) + '...';
    }

    // 格式化持续时间
    const durationStr = result.duration
      ? ` in ${(result.duration / 1000).toFixed(1)}s`
      : '';

    // 构建消息
    let message = `Agent "${result.description}" ${statusText}${durationStr}`;
    if (resultSummary && result.status === 'completed') {
      message += `\n\nResult: ${resultSummary}`;
    }
    if (result.transcriptPath) {
      message += `\n\nFull transcript: ${result.transcriptPath}`;
    }

    return this.notify({
      type: result.status === 'completed' ? 'success' :
            result.status === 'failed' ? 'error' : 'warning',
      kind: 'agent_complete',
      title: `Agent ${result.status === 'completed' ? 'Complete' : result.status === 'failed' ? 'Failed' : 'Killed'}`,
      message,
      agentResult: {
        ...result,
        resultSummary,
      },
      data: {
        agentId: result.agentId,
        agentType: result.agentType,
        status: result.status,
      },
    });
  }

  /**
   * Send permission required notification
   */
  permissionRequired(toolName: string, action: string): Notification | null {
    return this.notify({
      type: 'warning',
      kind: 'permission_required',
      title: 'Permission Required',
      message: `${toolName} wants to ${action}`,
      actions: [
        { label: 'Allow', action: 'allow', primary: true },
        { label: 'Deny', action: 'deny' },
      ],
    });
  }

  /**
   * Send update available notification
   */
  updateAvailable(version: string): Notification | null {
    return this.notify({
      type: 'info',
      kind: 'update_available',
      title: 'Update Available',
      message: `Version ${version} is available`,
      actions: [
        { label: 'Update Now', action: 'update', primary: true },
        { label: 'Later', action: 'dismiss' },
      ],
    });
  }
}

/**
 * Terminal notification (inline)
 */
export function terminalNotify(message: string, type: NotificationType = 'info'): void {
  const prefix = {
    info: 'ℹ️ ',
    success: '✓ ',
    warning: '⚠️ ',
    error: '✗ ',
  }[type];

  console.log(`${prefix}${message}`);
}

/**
 * Bell notification (terminal bell)
 */
export function bell(): void {
  process.stdout.write('\x07');
}

// Default notification manager
export const notificationManager = new NotificationManager();
