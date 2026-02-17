import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  updateConversationTitle
} from '../db/index.js';

const router = express.Router();

// List all conversations
router.get('/', (req, res) => {
  try {
    const conversations = getConversations();
    res.json(conversations);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new conversation
router.post('/', (req, res) => {
  try {
    const id = uuidv4();
    const title = req.body.title || 'New Chat';
    const conversation = createConversation(id, title);
    res.json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation with messages
router.get('/:id', (req, res) => {
  try {
    const conversation = getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Parse JSON fields for each message
    conversation.messages = conversation.messages.map(m => ({
      ...m,
      map_data: m.map_data ? JSON.parse(m.map_data) : null,
      search_results: m.search_results ? JSON.parse(m.search_results) : null
    }));

    res.json(conversation);
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update conversation title
router.patch('/:id', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    updateConversationTitle(req.params.id, title);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete conversation
router.delete('/:id', (req, res) => {
  try {
    deleteConversation(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
