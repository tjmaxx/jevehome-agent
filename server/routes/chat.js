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
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const emit = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { conversationId, message, enabledTools } = req.body;

    if (!message) {
      emit({ type: 'error', error: 'Message is required' });
      return res.end();
    }

    let convId = conversationId;
    let isNewConversation = false;

    if (!convId) {
      convId = uuidv4();
      createConversation(convId);
      isNewConversation = true;
    }

    const history = getMessages(convId);
    addMessage(convId, 'user', message);

    const clientIP = extractClientIP(req);
    const userLocation = await getLocationFromIP(clientIP);

    const messages = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }];

    const { reply, mapData, searchResults, artifactData } = await chat(
      messages, history, userLocation, enabledTools,
      (stepData) => emit({ type: 'step', ...stepData })
    );

    // Guard against empty replies (Gemini sometimes returns nothing after tool calls)
    const finalReply = reply || (artifactData
      ? 'Here is the visualization based on the data retrieved.'
      : 'I retrieved the information successfully.');

    addMessage(convId, 'assistant', finalReply, mapData, searchResults);

    if (isNewConversation) {
      try {
        const title = await generateTitle(message, finalReply);
        updateConversationTitle(convId, title);
      } catch (e) {
        console.error('Error generating title:', e);
      }
    }

    emit({
      type: 'done',
      conversationId: convId,
      reply: finalReply,
      mapData,
      searchResults,
      artifactData,
      isNewConversation
    });
  } catch (error) {
    console.error('Chat error:', error);
    emit({ type: 'error', error: error.message });
  } finally {
    res.end();
  }
});

export default router;
