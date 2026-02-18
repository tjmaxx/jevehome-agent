import React from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

export default function ChatPanel({
  messages,
  loading,
  title,
  onSend,
  onLinkClick,
  onMenuToggle,
  previewOpen,
  mapsApiKey,
  tools,
  onToggleTool,
  onOpenArtifact,
  artifactOpen
}) {
  const handleLinkClick = (url) => {
    // Handle suggestion clicks
    if (url.startsWith('suggestion:')) {
      const message = url.replace('suggestion:', '');
      onSend(message);
      return;
    }
    // Pass to parent for preview
    onLinkClick?.(url);
  };

  return (
    <div className={`chat-panel ${previewOpen || artifactOpen ? 'preview-open' : ''}`}>
      <header className="chat-header">
        <button className="menu-toggle" onClick={onMenuToggle}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="chat-title">{title}</span>
        <div style={{ width: '36px' }} /> {/* Spacer for centering */}
      </header>

      <MessageList
        messages={messages}
        loading={loading}
        onLinkClick={handleLinkClick}
        onReask={onSend}
        mapsApiKey={mapsApiKey}
        onOpenArtifact={onOpenArtifact}
      />

      <MessageInput
        onSend={onSend}
        disabled={loading}
        tools={tools}
        onToggleTool={onToggleTool}
      />
    </div>
  );
}
