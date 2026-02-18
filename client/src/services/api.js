import { extractArtifactFromResponse, cleanHtmlForRendering } from '../utils/artifactUtils.js';

const API_BASE = '/api';

export async function getTools() {
  const response = await fetch(`${API_BASE}/tools`);
  if (!response.ok) {
    throw new Error('Failed to fetch tools');
  }
  return response.json();
}

// SSE-based sendMessage: streams step events then resolves with the final done payload
export async function sendMessage(conversationId, message, enabledTools = null, onStep = null) {
  const body = { conversationId, message };
  if (enabledTools) body.enabledTools = enabledTools;

  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errorMessage = 'Failed to send message';
    try {
      const err = await response.json();
      errorMessage = err.error || errorMessage;
    } catch {
      errorMessage = `Server error: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by \n\n
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // keep incomplete last chunk

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }

      if (event.type === 'error') throw new Error(event.error);
      if (event.type === 'done') {
        // Extract artifact from reply if not already present
        if (!event.artifactData && event.reply) {
          const artifact = extractArtifactFromResponse(event.reply);
          if (artifact) {
            artifact.html = cleanHtmlForRendering(artifact.html);
            event.artifactData = artifact;
          }
        }
        return event; // final payload
      }
      onStep?.(event); // tool_call, tool_result, web_search, retry, etc.
    }
  }

  throw new Error('Stream ended without a done event');
}

export async function getConversations() {
  const response = await fetch(`${API_BASE}/conversations`);

  if (!response.ok) {
    throw new Error('Failed to fetch conversations');
  }

  return response.json();
}

export async function getConversation(id) {
  const response = await fetch(`${API_BASE}/conversations/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error('Failed to fetch conversation');
  }

  return response.json();
}

export async function createConversation(title) {
  const response = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });

  if (!response.ok) {
    throw new Error('Failed to create conversation');
  }

  return response.json();
}

export async function deleteConversation(id) {
  const response = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error('Failed to delete conversation');
  }

  return response.json();
}

export async function getPlaceDetails(placeId) {
  const response = await fetch(`${API_BASE}/maps/places/${placeId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch place details');
  }

  return response.json();
}

// --- Knowledge Base / RAG ---

export async function getKBDocuments() {
  const response = await fetch(`${API_BASE}/rag/documents`);
  if (!response.ok) throw new Error('Failed to fetch documents');
  return response.json();
}

export async function uploadKBDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE}/rag/documents`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    let errorMessage = 'Failed to upload document';
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function deleteKBDocument(id) {
  const response = await fetch(`${API_BASE}/rag/documents/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete document');
  return response.json();
}

// --- MCP Server Admin ---

export async function getMcpServers() {
  const response = await fetch(`${API_BASE}/admin/mcp-servers`);
  if (!response.ok) throw new Error('Failed to fetch MCP servers');
  return response.json();
}

export async function createMcpServer(data) {
  const response = await fetch(`${API_BASE}/admin/mcp-servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create MCP server');
  }
  return response.json();
}

export async function updateMcpServer(id, data) {
  const response = await fetch(`${API_BASE}/admin/mcp-servers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to update MCP server');
  return response.json();
}

export async function deleteMcpServer(id) {
  const response = await fetch(`${API_BASE}/admin/mcp-servers/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete MCP server');
  return response.json();
}

export async function connectMcpServer(id) {
  const response = await fetch(`${API_BASE}/admin/mcp-servers/${id}/connect`, {
    method: 'POST'
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to connect');
  }
  return response.json();
}

export async function disconnectMcpServer(id) {
  const response = await fetch(`${API_BASE}/admin/mcp-servers/${id}/disconnect`, {
    method: 'POST'
  });
  if (!response.ok) throw new Error('Failed to disconnect');
  return response.json();
}

export async function getMcpServerStatus(id) {
  const response = await fetch(`${API_BASE}/admin/mcp-servers/${id}/status`);
  if (!response.ok) throw new Error('Failed to get status');
  return response.json();
}

// --- Agent Settings ---

export async function getAgentSettings() {
  const response = await fetch(`${API_BASE}/admin/settings`);
  if (!response.ok) throw new Error('Failed to fetch settings');
  return response.json();
}

export async function updateAgentSettings(settings) {
  const response = await fetch(`${API_BASE}/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  if (!response.ok) throw new Error('Failed to update settings');
  return response.json();
}
