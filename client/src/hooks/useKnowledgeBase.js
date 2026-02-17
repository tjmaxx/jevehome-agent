import { useState, useCallback, useEffect, useRef } from 'react';
import { getKBDocuments, uploadKBDocument, deleteKBDocument } from '../services/api';

export function useKnowledgeBase() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const pollTimers = useRef([]);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const { documents } = await getKBDocuments();
      setDocuments(documents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    return () => {
      pollTimers.current.forEach(clearInterval);
    };
  }, [loadDocuments]);

  const upload = useCallback(async (file) => {
    try {
      setUploading(true);
      setError(null);
      const doc = await uploadKBDocument(file);
      setDocuments(prev => [doc, ...prev]);

      // Poll for status updates
      const interval = setInterval(async () => {
        try {
          const { documents } = await getKBDocuments();
          setDocuments(documents);
          const updated = documents.find(d => d.id === doc.id);
          if (updated && updated.status !== 'processing') {
            clearInterval(interval);
          }
        } catch {
          clearInterval(interval);
        }
      }, 2000);

      pollTimers.current.push(interval);
      setTimeout(() => clearInterval(interval), 300000);

      return doc;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const remove = useCallback(async (id) => {
    try {
      setError(null);
      await deleteKBDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { documents, loading, uploading, error, upload, remove, refresh: loadDocuments };
}
