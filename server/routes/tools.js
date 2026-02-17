import express from 'express';
import { tools as builtinTools } from '../services/functionCalling.js';
import { getMcpTools } from '../services/mcpClient.js';

const router = express.Router();

// Tools that require external config to work
const CONFIG_CHECKS = {
  send_email: () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  show_map: () => !!process.env.GOOGLE_MAPS_API_KEY,
  show_traffic: () => !!process.env.GOOGLE_MAPS_API_KEY,
  search_places: () => !!process.env.GOOGLE_MAPS_API_KEY,
  get_directions: () => !!process.env.GOOGLE_MAPS_API_KEY,
  show_street_view: () => !!process.env.GOOGLE_MAPS_API_KEY,
  get_user_location: () => true,
  search_documents: () => !!process.env.GEMINI_API_KEY
};

router.get('/', (req, res) => {
  // Built-in tools
  const builtin = builtinTools.map(t => ({
    name: t.name,
    description: t.description,
    source: 'builtin',
    configured: CONFIG_CHECKS[t.name] ? CONFIG_CHECKS[t.name]() : true
  }));

  // MCP tools
  const mcp = getMcpTools().map(t => ({
    name: t.name,
    description: t.description,
    source: 'mcp',
    configured: true // MCP tools are configured if they show up
  }));

  res.json({ tools: [...builtin, ...mcp] });
});

export default router;
