import React from 'react';
import { useAuthStore } from '@/shared/stores/authStore';
import ChatView from '../components/ChatView';
import { canOpenAIChat } from '../components/ChatFab';

// Full-screen AI assistant: the same ChatView as the floating panel,
// rendered as a real page at /ai-chat (same threads, same streaming state).
const AIChat: React.FC = () => {
  const permissions = useAuthStore((s) => s.permissions);

  if (!canOpenAIChat(permissions)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <h2 className="text-lg font-semibold text-white">Permission denied</h2>
        <p className="text-sm text-gray-400 mt-2 max-w-md">
          Ask an administrator to grant AI Chat access.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
        <p className="text-sm text-gray-400 mt-1">
          Full-page chat — same threads as the floating panel.
        </p>
      </div>
      <section
        aria-label="AI assistant"
        className="ks-card overflow-hidden flex flex-col min-h-[60vh] h-[calc(100dvh-16rem)] max-h-[calc(100dvh-10rem)]"
      >
        <ChatView variant="page" />
      </section>
    </div>
  );
};

export default AIChat;
