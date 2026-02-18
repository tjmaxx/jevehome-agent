import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRoutes from './routes/chat.js';
import conversationsRoutes from './routes/conversations.js';
import mapsRoutes from './routes/maps.js';
import toolsRoutes from './routes/tools.js';
import ragRoutes from './routes/rag.js';
import adminRoutes from './routes/admin.js';
import { initializeMcpClients, shutdownMcpClients } from './services/mcpClient.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize MCP clients, then start server
initializeMcpClients()
  .catch(err => console.error('[MCP] Initialization error (non-fatal):', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  await shutdownMcpClients();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
