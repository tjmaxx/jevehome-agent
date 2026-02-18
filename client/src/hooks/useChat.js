import { useState, useCallback, useEffect } from 'react';
import { sendMessage, getConversations, getConversation, deleteConversation as apiDeleteConversation, getTools } from '../services/api';

export function useChat() {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentArtifact, setCurrentArtifact] = useState(null);

  // Tools state: { name, description, source, configured, enabled }
  const [availableTools, setAvailableTools] = useState([]);

  // Load conversations and tools on mount
  useEffect(() => {
    loadConversations();
    loadTools();
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await getConversations();
      setConversations(convs);
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  }, []);

  const loadTools = useCallback(async () => {
    try {
      const { tools } = await getTools();
      
      // Load saved tool preferences from localStorage
      const savedEnabledTools = localStorage.getItem('enabledTools');
      const savedPreferences = savedEnabledTools ? JSON.parse(savedEnabledTools) : null;
      
      const toolsWithPreferences = tools.map(t => ({
        ...t,
        // Use saved preference if available, otherwise default to configured status
        enabled: savedPreferences ? savedPreferences[t.name] ?? t.configured : t.configured
      }));
      
      setAvailableTools(toolsWithPreferences);
    } catch (err) {
      console.error('Error loading tools:', err);
    }
  }, []);

  const toggleTool = useCallback((toolName) => {
    setAvailableTools(prev => {
      const updated = prev.map(t =>
        t.name === toolName && t.configured
          ? { ...t, enabled: !t.enabled }
          : t
      );
      
      // Save tool preferences to localStorage
      const enabledMap = {};
      updated.forEach(t => {
        enabledMap[t.name] = t.enabled;
      });
      localStorage.setItem('enabledTools', JSON.stringify(enabledMap));
      
      return updated;
    });
  }, []);

  const loadConversation = useCallback(async (id) => {
    try {
      setLoading(true);
      const conv = await getConversation(id);
      if (conv) {
        setConversationId(id);
        setMessages(conv.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          mapData: m.map_data,
          searchResults: m.search_results,
          thinkingComplete: true  // Loaded messages are always complete
        })));
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(async (message) => {
    // Use unique string IDs to avoid timestamp collision between user/assistant messages
    const baseId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userMsgId = `u_${baseId}`;
    const assistantMsgId = `a_${baseId}`;

    try {
      setLoading(true);
      setError(null);

      // Add user message immediately
      const userMessage = { role: 'user', content: message, id: userMsgId };
      setMessages(prev => [...prev, userMessage]);

      // Add a placeholder assistant message to collect streaming steps
      setMessages(prev => [...prev, {
        role: 'assistant', content: '', id: assistantMsgId,
        thinkingSteps: [], thinkingComplete: false
      }]);

      // Stream: collect steps live, then get final response
      const enabledToolNames = availableTools.filter(t => t.enabled).map(t => t.name);

      const onStep = (step) => {
        // Artifact step: set artifactData on the message and auto-open the panel immediately
        if (step.type === 'artifact') {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, artifactData: step.artifactData }
              : m
          ));
          setCurrentArtifact(step.artifactData);
          return;
        }
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, thinkingSteps: [...(m.thinkingSteps || []), step] }
            : m
        ));
      };

      const response = await sendMessage(conversationId, message, enabledToolNames, onStep);

      // Update conversation ID if new
      if (response.isNewConversation || !conversationId) {
        setConversationId(response.conversationId);
        loadConversations();
      }

      // Finalize the assistant message
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? {
              ...m,
              content: response.reply,
              mapData: response.mapData,
              searchResults: response.searchResults,
              // Keep artifact already set via step event; fall back to done-event artifact
              artifactData: m.artifactData || response.artifactData,
              thinkingComplete: true
            }
          : m
      ));

      // Auto-open artifact panel when an artifact is present
      if (response.artifactData && !currentArtifact) {
        setCurrentArtifact(response.artifactData);
      }

      if (response.isNewConversation) {
        setTimeout(loadConversations, 500);
      }

    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== assistantMsgId && m.id !== userMsgId));
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadConversations, availableTools, currentArtifact]);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }, []);

  const deleteConversation = useCallback(async (id) => {
    try {
      await apiDeleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (conversationId === id) {
        newConversation();
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  }, [conversationId, newConversation]);

  const currentTitle = conversationId
    ? conversations.find(c => c.id === conversationId)?.title || 'Chat'
    : 'New Chat';

  return {
    conversationId,
    messages,
    conversations,
    loading,
    error,
    currentTitle,
    send,
    loadConversation,
    newConversation,
    deleteConversation,
    loadConversations,
    availableTools,
    toggleTool,
    loadTools,
    currentArtifact,
    setCurrentArtifact
  };
}
