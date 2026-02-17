import { useState, useCallback, useEffect } from 'react';
import { sendMessage, getConversations, getConversation, deleteConversation as apiDeleteConversation, getTools } from '../services/api';

export function useChat() {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      setAvailableTools(tools.map(t => ({
        ...t,
        enabled: t.configured // default: enabled if configured
      })));
    } catch (err) {
      console.error('Error loading tools:', err);
    }
  }, []);

  const toggleTool = useCallback((toolName) => {
    setAvailableTools(prev => prev.map(t =>
      t.name === toolName && t.configured
        ? { ...t, enabled: !t.enabled }
        : t
    ));
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
          searchResults: m.search_results
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
    try {
      setLoading(true);
      setError(null);

      // Add user message immediately
      const userMessage = { role: 'user', content: message, id: Date.now() };
      setMessages(prev => [...prev, userMessage]);

      // Send to API with enabled tools
      const enabledToolNames = availableTools.filter(t => t.enabled).map(t => t.name);
      const response = await sendMessage(conversationId, message, enabledToolNames);

      // Update conversation ID if new
      if (response.isNewConversation || !conversationId) {
        setConversationId(response.conversationId);
        loadConversations(); // Refresh conversation list
      }

      // Add assistant response
      const assistantMessage = {
        role: 'assistant',
        content: response.reply,
        mapData: response.mapData,
        searchResults: response.searchResults,
        id: Date.now() + 1
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Refresh conversations to get updated title
      if (response.isNewConversation) {
        setTimeout(loadConversations, 500);
      }

    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
      // Remove the user message on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadConversations, availableTools]);

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
    toggleTool
  };
}
