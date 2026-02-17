import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import LinkPreview from './components/LinkPreview';
import { useChat } from './hooks/useChat';

// Get API key from environment or use empty string (user should configure via .env)
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const {
    conversationId,
    messages,
    conversations,
    loading,
    currentTitle,
    send,
    loadConversation,
    newConversation,
    deleteConversation
  } = useChat();

  const handleLinkClick = (url) => {
    if (url.startsWith('place:') || url.startsWith('http')) {
      setPreviewUrl(url);
    }
  };

  const handleClosePreview = () => {
    setPreviewUrl(null);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentId={conversationId}
        onSelect={loadConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        collapsed={sidebarCollapsed}
      />

      <main className="main-content">
        <ChatPanel
          messages={messages}
          loading={loading}
          title={currentTitle}
          onSend={send}
          onLinkClick={handleLinkClick}
          onMenuToggle={toggleSidebar}
          previewOpen={!!previewUrl}
          mapsApiKey={MAPS_API_KEY}
        />
      </main>

      <LinkPreview url={previewUrl} onClose={handleClosePreview} />
    </div>
  );
}
