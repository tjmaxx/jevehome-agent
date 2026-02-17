import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
  TrafficLayer,
  StreetViewPanorama
} from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = { lat: 38.9072, lng: -77.0369 }; // Washington DC

// Decode Google polyline
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export default function MapView({ mapData, apiKey, onPlaceClick }) {
  const [activeMarker, setActiveMarker] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries: ['places']
  });

  const center = useMemo(() => {
    if (mapData?.center) {
      return mapData.center;
    }
    if (mapData?.position) {
      return mapData.position;
    }
    return defaultCenter;
  }, [mapData]);

  const zoom = mapData?.zoom || 14;

  const handleMarkerClick = useCallback((marker, idx) => {
    setActiveMarker(idx);
  }, []);

  const handleInfoWindowClose = useCallback(() => {
    setActiveMarker(null);
  }, []);

  const polylinePath = useMemo(() => {
    if (mapData?.polyline) {
      return decodePolyline(mapData.polyline);
    }
    return null;
  }, [mapData?.polyline]);

  const mapRef = useRef(null);
  const polylineRef = useRef(null);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // Draw polyline directly via Google Maps API and fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !polylinePath || !window.google) return;

    // Remove previous polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }

    const path = polylinePath.map(p => new window.google.maps.LatLng(p.lat, p.lng));

    polylineRef.current = new window.google.maps.Polyline({
      path,
      strokeColor: '#4285F4',
      strokeOpacity: 1,
      strokeWeight: 5,
      map
    });

    // Fit map bounds to the route
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 50);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [polylinePath]);

  if (loadError) {
    return (
      <div className="map-error" style={{ padding: '20px', textAlign: 'center' }}>
        Error loading maps. Please check your API key.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-loading" style={{ padding: '20px', textAlign: 'center' }}>
        Loading map...
      </div>
    );
  }

  // Street View mode
  if (mapData?.type === 'streetview') {
    return (
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapData.position}
        zoom={14}
      >
        <StreetViewPanorama
          position={mapData.position}
          visible={true}
          options={{
            pov: {
              heading: mapData.heading || 0,
              pitch: mapData.pitch || 0
            },
            enableCloseButton: false
          }}
        />
      </GoogleMap>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={zoom}
      onLoad={onMapLoad}
      options={{
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#263c3f' }]
          },
          {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#6b9a76' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#38414e' }]
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#212a37' }]
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9ca5b3' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#746855' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#1f2835' }]
          },
          {
            featureType: 'road.highway',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#f3d19c' }]
          },
          {
            featureType: 'transit',
            elementType: 'geometry',
            stylers: [{ color: '#2f3948' }]
          },
          {
            featureType: 'transit.station',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#d59563' }]
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#17263c' }]
          },
          {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#515c6d' }]
          },
          {
            featureType: 'water',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#17263c' }]
          }
        ],
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: true,
        fullscreenControl: true
      }}
    >
      {/* Traffic Layer */}
      {mapData?.trafficEnabled && <TrafficLayer />}

      {/* Markers */}
      {mapData?.markers?.map((marker, idx) => (
        <Marker
          key={idx}
          position={marker.position}
          label={marker.label}
          title={marker.title}
          onClick={() => handleMarkerClick(marker, idx)}
        >
          {activeMarker === idx && marker.info && (
            <InfoWindow onCloseClick={handleInfoWindowClose}>
              <div style={{ color: '#333', maxWidth: '200px' }}>
                <h4 style={{ margin: '0 0 5px', fontSize: '14px' }}>{marker.info.name}</h4>
                {marker.info.rating && (
                  <p style={{ margin: '0 0 3px', fontSize: '12px' }}>
                    Rating: {marker.info.rating} ({marker.info.userRatingsTotal} reviews)
                  </p>
                )}
                {marker.info.address && (
                  <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                    {marker.info.address}
                  </p>
                )}
                {marker.info.placeId && (
                  <button
                    onClick={() => onPlaceClick?.(marker.info)}
                    style={{
                      marginTop: '8px',
                      padding: '4px 8px',
                      background: '#4285F4',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    View Details
                  </button>
                )}
              </div>
            </InfoWindow>
          )}
        </Marker>
      ))}
    </GoogleMap>
  );
}
