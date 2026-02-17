const API_BASE = '/api';

export async function sendMessage(conversationId, message) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message })
  });

  if (!response.ok) {
    let errorMessage = 'Failed to send message';
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      errorMessage = `Server error: ${response.status} ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
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
