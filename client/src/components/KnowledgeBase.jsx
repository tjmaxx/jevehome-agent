import React, { useRef, useState } from 'react';
import { useKnowledgeBase } from '../hooks/useKnowledgeBase';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function StatusBadge({ status, errorMessage }) {
  if (status === 'processing') {
    return <span className="kb-status processing">Processing...</span>;
  }
  if (status === 'ready') {
    return <span className="kb-status ready">Ready</span>;
  }
  if (status === 'error') {
    return <span className="kb-status error" title={errorMessage}>Error</span>;
  }
  return null;
}

function FileTypeIcon({ filename }) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <span className="kb-file-icon pdf">PDF</span>;
  if (ext === 'md') return <span className="kb-file-icon md">MD</span>;
  return <span className="kb-file-icon txt">TXT</span>;
}

export default function KnowledgeBase({ onClose }) {
  const { documents, loading, uploading, error, upload, remove } = useKnowledgeBase();
  const fileInputRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await upload(file);
    } catch {
      // Error handled in hook
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (id) => {
    if (confirmDelete === id) {
      await remove(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  return (
    <div className="knowledge-base-panel">
      <div className="kb-header">
        <h2>Knowledge Base</h2>
        <button className="kb-close-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="kb-upload-area">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="kb-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
        <span className="kb-upload-hint">PDF, TXT, or Markdown (max 10MB)</span>
      </div>

      {error && <div className="kb-error">{error}</div>}

      <div className="kb-document-list">
        {loading && documents.length === 0 && (
          <div className="kb-empty">Loading documents...</div>
        )}
        {!loading && documents.length === 0 && (
          <div className="kb-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: 8 }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <p>No documents uploaded yet.</p>
            <p style={{ fontSize: '12px', opacity: 0.6 }}>Upload documents to enable AI-powered search across your files.</p>
          </div>
        )}
        {documents.map(doc => (
          <div key={doc.id} className="kb-document-item">
            <FileTypeIcon filename={doc.original_name} />
            <div className="kb-doc-info">
              <span className="kb-doc-name" title={doc.original_name}>{doc.original_name}</span>
              <div className="kb-doc-meta">
                <span>{formatFileSize(doc.file_size)}</span>
                {doc.chunk_count > 0 && <span>{doc.chunk_count} chunks</span>}
                <StatusBadge status={doc.status} errorMessage={doc.error_message} />
              </div>
            </div>
            <button
              className={`kb-delete-btn ${confirmDelete === doc.id ? 'confirm' : ''}`}
              onClick={() => handleDelete(doc.id)}
              title={confirmDelete === doc.id ? 'Click again to confirm' : 'Delete document'}
            >
              {confirmDelete === doc.id ? 'Confirm?' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
