import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import LinkPreview from './components/LinkPreview';
import KnowledgeBase from './components/KnowledgeBase';
import AdminPage from './components/AdminPage';
import ArtifactPanel from './components/ArtifactPanel';
import { useChat } from './hooks/useChat';
import { useTheme } from './hooks/useTheme';

// Get API key from environment or use empty string (user should configure via .env)
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const { themeName, setTheme, customColors, updateCustomColor, resetCustomToPreset } = useTheme();

  const {
    conversationId,
    messages,
    conversations,
    loading,
    currentTitle,
    send,
    loadConversation,
    newConversation,
    deleteConversation,
    availableTools,
    toggleTool,
    loadTools,
    currentArtifact,
    setCurrentArtifact
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
        onOpenKnowledgeBase={() => { setShowKnowledgeBase(true); setShowAdmin(false); }}
        onOpenAdmin={() => { setShowAdmin(true); setShowKnowledgeBase(false); }}
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
          tools={availableTools}
          onToggleTool={toggleTool}
          onOpenArtifact={setCurrentArtifact}
          artifactOpen={!!currentArtifact}
        />
      </main>

      <LinkPreview url={previewUrl} onClose={handleClosePreview} />

      <ArtifactPanel artifact={currentArtifact} onClose={() => setCurrentArtifact(null)} />

      {showKnowledgeBase && (
        <KnowledgeBase onClose={() => setShowKnowledgeBase(false)} />
      )}

      {showAdmin && (
        <AdminPage
          onClose={() => setShowAdmin(false)}
          onToolsChanged={loadTools}
          themeName={themeName}
          setTheme={setTheme}
          customColors={customColors}
          updateCustomColor={updateCustomColor}
          resetCustomToPreset={resetCustomToPreset}
        />
      )}
    </div>
  );
}
