import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
const dbPath = process.env.DATABASE_PATH || './data/agent.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migration: add search_results column if missing
try {
  db.exec('ALTER TABLE messages ADD COLUMN search_results JSON');
} catch (e) {
  // Column already exists, ignore
}

// Migration: add OAuth endpoint columns to mcp_servers
try { db.exec('ALTER TABLE mcp_servers ADD COLUMN authorization_url TEXT'); } catch {}
try { db.exec('ALTER TABLE mcp_servers ADD COLUMN token_url TEXT'); } catch {}

// Migration: settings table
db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
// Insert defaults if not present
const settingsDefaults = { max_steps: '10', max_retries: '2' };
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(settingsDefaults)) insertSetting.run(k, v);

// Conversation operations
export function createConversation(id, title = 'New Chat') {
  const stmt = db.prepare('INSERT INTO conversations (id, title) VALUES (?, ?)');
  stmt.run(id, title);
  return { id, title };
}

export function getConversations() {
  const stmt = db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    ORDER BY c.updated_at DESC
  `);
  return stmt.all();
}

export function getConversation(id) {
  const convStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
  const conversation = convStmt.get(id);

  if (!conversation) return null;

  const msgStmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
  const messages = msgStmt.all(id);

  return { ...conversation, messages };
}

export function updateConversationTitle(id, title) {
  const stmt = db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(title, id);
}

export function deleteConversation(id) {
  const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
  stmt.run(id);
}

// Message operations
export function addMessage(conversationId, role, content, mapData = null, searchResults = null) {
  // Update conversation timestamp
  const updateStmt = db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  updateStmt.run(conversationId);

  const stmt = db.prepare(`
    INSERT INTO messages (conversation_id, role, content, map_data, search_results)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    conversationId, role, content,
    mapData ? JSON.stringify(mapData) : null,
    searchResults ? JSON.stringify(searchResults) : null
  );
  return { id: result.lastInsertRowid, conversationId, role, content, mapData, searchResults };
}

export function getMessages(conversationId) {
  const stmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
  const messages = stmt.all(conversationId);
  return messages.map(m => ({
    ...m,
    map_data: m.map_data ? JSON.parse(m.map_data) : null,
    search_results: m.search_results ? JSON.parse(m.search_results) : null
  }));
}

// Document operations
export function createDocument(id, filename, originalName, fileType, fileSize) {
  const stmt = db.prepare(
    'INSERT INTO documents (id, filename, original_name, file_type, file_size) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, filename, originalName, fileType, fileSize);
  return { id, filename, original_name: originalName, file_type: fileType, file_size: fileSize, status: 'processing', chunk_count: 0 };
}

export function getDocuments() {
  return db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
}

export function getDocument(id) {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

export function updateDocumentStatus(id, status, chunkCount = null, errorMessage = null) {
  const stmt = db.prepare(
    'UPDATE documents SET status = ?, chunk_count = COALESCE(?, chunk_count), error_message = ? WHERE id = ?'
  );
  stmt.run(status, chunkCount, errorMessage, id);
}

export function deleteDocument(id) {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
}

export function insertChunksBatch(chunks) {
  const stmt = db.prepare(
    'INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const c of items) {
      stmt.run(c.id, c.documentId, c.chunkIndex, c.content, JSON.stringify(c.embedding));
    }
  });
  insertMany(chunks);
}

export function getAllChunksWithEmbeddings() {
  return db.prepare(`
    SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, dc.embedding,
           d.original_name as document_name
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE d.status = 'ready'
  `).all();
}

// MCP server operations
export function getMcpServers() {
  return db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all();
}

export function getMcpServer(id) {
  return db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
}

export function createMcpServer(id, name, url, clientId, clientSecret, authorizationUrl, tokenUrl) {
  db.prepare(
    'INSERT INTO mcp_servers (id, name, url, client_id, client_secret, authorization_url, token_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, url, clientId || null, clientSecret || null, authorizationUrl || null, tokenUrl || null);
  return getMcpServer(id);
}

export function updateMcpServer(id, name, url, clientId, clientSecret, authorizationUrl, tokenUrl) {
  db.prepare(
    'UPDATE mcp_servers SET name = ?, url = ?, client_id = ?, client_secret = ?, authorization_url = ?, token_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(name, url, clientId || null, clientSecret || null, authorizationUrl || null, tokenUrl || null, id);
}

export function deleteMcpServer(id) {
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

export function updateMcpServerToken(id, { accessToken, refreshToken, expiresAt }) {
  db.prepare(
    'UPDATE mcp_servers SET access_token = ?, refresh_token = ?, token_expires_at = ?, status = \'connected\', updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(accessToken || null, refreshToken || null, expiresAt || null, id);
}

export function updateMcpServerStatus(id, status, errorMessage = null) {
  db.prepare(
    'UPDATE mcp_servers SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(status, errorMessage, id);
}

// Settings operations
export function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function getAllSettings() {
  return db.prepare('SELECT key, value FROM settings').all().reduce((acc, r) => {
    acc[r.key] = r.value;
    return acc;
  }, {});
}

export default db;
