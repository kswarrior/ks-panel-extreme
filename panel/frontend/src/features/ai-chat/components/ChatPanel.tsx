import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useAIChatStore } from '../store/aiChatStore';
import ChatView from './ChatView';
import { canOpenAIChat } from './ChatFab';

// Floating chat panel: near-fullscreen so it covers the page area.
// Hidden on /auth and for roles without any chat-capable AI key. Uses the
// profile-dropdown surface (glass-dropdown) so Theme Studio Dropdowns tab
// tints it like the menu.
const ChatPanel: React.FC = () => {
  const location = useLocation();
  const permissions = useAuthStore((s) => s.permissions);
  const panelName = useSettingsStore((s) => s.panelName);
  const open = useAIChatStore((s) => s.open);

  if (!open) return null;
  if (location.pathname.startsWith('/auth')) return null;
  if (!canOpenAIChat(permissions)) return null;

  return (
    <div
      role="dialog"
      aria-label={`${panelName} Assistant`}
      style={{ position: 'fixed' }}
      className={`fixed z-50 bottom-20 right-4 sm:right-5 w-[700px] max-w-[calc(100vw-2rem)] h-[calc(100dvh-6.5rem)] max-h-[calc(100dvh-5.5rem)] flex flex-col rounded-xl glass-dropdown overflow-hidden ks-ai-panel-enter`}
    >
      <ChatView />
    </div>
  );
};

export default ChatPanel;
