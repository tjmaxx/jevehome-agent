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

export default db;
