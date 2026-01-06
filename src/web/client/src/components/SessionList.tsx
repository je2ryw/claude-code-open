import { useState } from 'react';
import { formatDate } from '../utils/constants';
import type { Session } from '../types';

interface SessionListProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionRename: (sessionId: string, name: string) => void;
}

export function SessionList({
  sessions,
  currentSessionId,
  onSessionSelect,
  onSessionDelete,
  onSessionRename,
}: SessionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const handleRenameStart = (session: Session) => {
    setEditingId(session.id);
    setNewTitle(session.name || '未命名会话');
  };

  const handleRenameSubmit = (sessionId: string) => {
    if (newTitle.trim()) {
      onSessionRename(sessionId, newTitle.trim());
    }
    setEditingId(null);
  };

  const handleRenameCancel = () => {
    setEditingId(null);
    setNewTitle('');
  };

  if (sessions.length === 0) {
    return <div className="session-list-empty">暂无会话历史</div>;
  }

  return (
    <div className="session-list">
      {sessions.map(session => (
        <div
          key={session.id}
          className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
          onClick={() => editingId !== session.id && onSessionSelect(session.id)}
        >
          {editingId === session.id ? (
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={() => handleRenameSubmit(session.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameSubmit(session.id);
                } else if (e.key === 'Escape') {
                  handleRenameCancel();
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <>
              <div className="session-title">{session.name || '未命名会话'}</div>
              <div className="session-meta">
                <span className="session-date">{formatDate(session.updatedAt)}</span>
                <span className="session-count">{session.messageCount} 消息</span>
              </div>
              <div className="session-actions">
                <button
                  className="session-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRenameStart(session);
                  }}
                  title="重命名"
                >
                  ✏️
                </button>
                <button
                  className="session-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定要删除会话 "${session.name || '未命名会话'}" 吗？`)) {
                      onSessionDelete(session.id);
                    }
                  }}
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
