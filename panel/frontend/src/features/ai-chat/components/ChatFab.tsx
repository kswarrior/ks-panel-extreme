import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import { useAIChatStore } from '../store/aiChatStore';

// Bottom-right FAB that opens the panel-wide AI assistant. Mounted once in
// App beside ConfirmDialog; hidden on /auth, for roles without any
// chat-capable AI key (umbrella or Q&A/Tools/Writes — threads-only holders
// manage history via API but get no composer, mirroring the backend gate),
// and when the user switched it off in the profile dropdown (per-user pref
// — the chat then opens from the profile menu instead).
export const AI_CHAT_KEYS = [
  PermissionKey.AI_CHAT_USE,
  PermissionKey.AI_CHAT_QA,
  PermissionKey.AI_CHAT_TOOLS,
  PermissionKey.AI_CHAT_WRITES,
] as const;

export function canOpenAIChat(permissions: string[]): boolean {
  return hasPermissionAny(permissions, ...AI_CHAT_KEYS);
}

const ChatFab: React.FC = () => {
  const location = useLocation();
  const permissions = useAuthStore((s) => s.permissions);
  const open = useAIChatStore((s) => s.open);
  const toggle = useAIChatStore((s) => s.toggle);
  const fabHidden = useAIChatStore((s) => s.fabHidden);

  if (location.pathname.startsWith('/auth')) return null;
  if (!canOpenAIChat(permissions)) return null;
  if (fabHidden) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      aria-expanded={open}
      title={open ? 'Close AI assistant' : 'Ask the panel assistant'}
      className={`fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ks-ai-fab-enter ks-ai-fab-anim ${open ? 'is-open' : 'is-idle'}`}
      style={{ background: 'var(--ks-btn-bg, #fff)', color: 'var(--ks-btn-text, #000)' }}
    >
      <span className={`ks-ai-fab-icon inline-flex ${open ? 'is-open' : ''}`}>
        {open ? (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </span>
    </button>
  );
};

export default ChatFab;
