import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { chat, generateTitle } from '../services/gemini.js';
import { extractClientIP, getLocationFromIP } from '../services/geolocation.js';
import {
  createConversation,
  getConversation,
  addMessage,
  updateConversationTitle,
  getMessages
} from '../db/index.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { conversationId, message, enabledTools } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let convId = conversationId;
    let isNewConversation = false;

    // Create new conversation if needed
    if (!convId) {
      convId = uuidv4();
      createConversation(convId);
      isNewConversation = true;
    }

    // Get conversation history
    const history = getMessages(convId);

    // Save user message
    addMessage(convId, 'user', message);

    // Get user location from IP
    const clientIP = extractClientIP(req);
    const userLocation = await getLocationFromIP(clientIP);

    // Get response from Gemini
    const messages = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }];
    const { reply, mapData, searchResults } = await chat(messages, history, userLocation, enabledTools);

    // Save assistant response
    addMessage(convId, 'assistant', reply, mapData, searchResults);

    // Generate title for new conversations after first exchange
    if (isNewConversation) {
      try {
        const title = await generateTitle(message, reply);
        updateConversationTitle(convId, title);
      } catch (e) {
        console.error('Error generating title:', e);
      }
    }

    res.json({
      conversationId: convId,
      reply,
      mapData,
      searchResults,
      isNewConversation
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
