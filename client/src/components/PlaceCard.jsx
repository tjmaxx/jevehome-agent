import React from 'react';

function StarRating({ rating }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <span className="place-card-rating">
      {'★'.repeat(fullStars)}
      {hasHalfStar && '½'}
      {'☆'.repeat(emptyStars)}
      <span>{rating?.toFixed(1)}</span>
    </span>
  );
}

export default function PlaceCard({ place, number, onClick }) {
  const priceDisplay = place.priceLevel
    ? '$'.repeat(place.priceLevel)
    : null;

  return (
    <div className="place-card" onClick={onClick}>
      <div className="place-card-header">
        <div className="place-card-number">{number}</div>
        <div className="place-card-info">
          <h4>{place.name}</h4>
          {place.rating > 0 && <StarRating rating={place.rating} />}
        </div>
      </div>

      {place.address && (
        <p className="place-card-address">{place.address}</p>
      )}

      <div className="place-card-meta">
        {priceDisplay && (
          <span className="place-card-price">{priceDisplay}</span>
        )}
        {place.openNow !== undefined && (
          <span className={`place-card-status ${place.openNow ? 'open' : 'closed'}`}>
            {place.openNow ? 'Open' : 'Closed'}
          </span>
        )}
      </div>
    </div>
  );
}
