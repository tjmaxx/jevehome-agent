import React, { useState, useEffect } from 'react';
import { getPlaceDetails } from '../services/api';

export default function LinkPreview({ url, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isOpen = !!url;
  const isPlaceUrl = url?.startsWith('place:');
  const placeId = isPlaceUrl ? url.replace('place:', '') : null;

  useEffect(() => {
    if (placeId) {
      setLoading(true);
      setError(null);
      getPlaceDetails(placeId)
        .then(setContent)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    } else {
      setContent(null);
    }
  }, [placeId]);

  const handleOpenExternal = () => {
    if (content?.googleMapsUrl) {
      window.open(content.googleMapsUrl, '_blank');
    } else if (url && !isPlaceUrl) {
      window.open(url, '_blank');
    }
  };

  return (
    <aside className={`link-preview ${isOpen ? 'open' : ''}`}>
      <div className="preview-header">
        <h3>{content?.name || 'Preview'}</h3>
        <div className="preview-actions">
          <button
            className="preview-btn"
            onClick={handleOpenExternal}
            title="Open in new tab"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <button className="preview-btn" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="preview-content">
        {loading && (
          <div className="preview-loading" style={{ padding: '40px', textAlign: 'center' }}>
            Loading...
          </div>
        )}

        {error && (
          <div className="preview-error">
            <p>Unable to load preview</p>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open in new tab
            </a>
          </div>
        )}

        {content && !loading && !error && (
          <div style={{ padding: '20px', overflow: 'auto', height: '100%' }}>
            {/* Photos */}
            {content.photos && content.photos.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <img
                  src={content.photos[0]}
                  alt={content.name}
                  style={{ width: '100%', borderRadius: '8px', objectFit: 'cover', maxHeight: '200px' }}
                />
              </div>
            )}

            {/* Basic Info */}
            <h2 style={{ marginBottom: '10px', fontSize: '1.3rem' }}>{content.name}</h2>

            {content.rating && (
              <div style={{ marginBottom: '10px', color: '#ffc107' }}>
                {'★'.repeat(Math.floor(content.rating))}
                <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  {content.rating} stars
                </span>
              </div>
            )}

            {content.priceLevel && (
              <p style={{ color: '#4caf50', marginBottom: '10px' }}>
                {'$'.repeat(content.priceLevel)}
              </p>
            )}

            {content.address && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '15px', fontSize: '0.9rem' }}>
                {content.address}
              </p>
            )}

            {content.phone && (
              <p style={{ marginBottom: '10px' }}>
                <a href={`tel:${content.phone}`} style={{ color: 'var(--accent-secondary)' }}>
                  {content.phone}
                </a>
              </p>
            )}

            {content.website && (
              <p style={{ marginBottom: '15px' }}>
                <a
                  href={content.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-secondary)' }}
                >
                  Visit Website
                </a>
              </p>
            )}

            {/* Opening Hours */}
            {content.openingHours && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '8px', fontSize: '0.95rem' }}>Hours</h4>
                <ul style={{ listStyle: 'none', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {content.openingHours.map((hour, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{hour}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reviews */}
            {content.reviews && content.reviews.length > 0 && (
              <div>
                <h4 style={{ marginBottom: '12px', fontSize: '0.95rem' }}>Reviews</h4>
                {content.reviews.map((review, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      padding: '12px',
                      borderRadius: '8px',
                      marginBottom: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{review.author_name}</span>
                      <span style={{ color: '#ffc107' }}>{'★'.repeat(review.rating)}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {review.text?.slice(0, 200)}{review.text?.length > 200 ? '...' : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Regular URL iframe */}
        {!isPlaceUrl && url && (
          <iframe
            className="preview-iframe"
            src={url}
            title="Link Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </aside>
  );
}
