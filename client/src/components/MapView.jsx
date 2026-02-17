import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  TrafficLayer,
  StreetViewPanorama
} from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = { lat: 38.9072, lng: -77.0369 }; // Washington DC

const LIBRARIES = ['places', 'marker'];

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

// Create a styled pin element for AdvancedMarkerElement
function createMarkerContent(label) {
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #4285F4;
    border: 2px solid #fff;
    border-radius: 50%;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: pointer;
  `;
  container.textContent = label || '';
  return container;
}

export default function MapView({ mapData, apiKey, onPlaceClick }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries: LIBRARIES
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

  const polylinePath = useMemo(() => {
    if (mapData?.polyline) {
      return decodePolyline(mapData.polyline);
    }
    return null;
  }, [mapData?.polyline]);

  const [mapInstance, setMapInstance] = useState(null);
  const polylineRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const onMapLoad = useCallback((map) => {
    setMapInstance(map);
  }, []);

  // Clean up markers and info window
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }
  }, []);

  // Create AdvancedMarkerElement instances
  useEffect(() => {
    if (!mapInstance || !window.google?.maps?.marker?.AdvancedMarkerElement) return;
    if (!mapData?.markers?.length) {
      clearMarkers();
      return;
    }

    clearMarkers();

    const infoWindow = new window.google.maps.InfoWindow();
    infoWindowRef.current = infoWindow;

    mapData.markers.forEach((markerData, idx) => {
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapInstance,
        position: markerData.position,
        title: markerData.title || '',
        content: markerData.label ? createMarkerContent(markerData.label) : undefined
      });

      marker.addListener('click', () => {
        if (markerData.info) {
          const ratingHtml = markerData.info.rating
            ? `<p style="margin:0 0 3px;font-size:12px">Rating: ${markerData.info.rating} (${markerData.info.userRatingsTotal} reviews)</p>`
            : '';
          const addressHtml = markerData.info.address
            ? `<p style="margin:0;font-size:12px;color:#666">${markerData.info.address}</p>`
            : '';
          const buttonHtml = markerData.info.placeId
            ? `<button id="info-details-btn-${idx}" style="margin-top:8px;padding:4px 8px;background:#4285F4;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">View Details</button>`
            : '';

          infoWindow.setContent(`
            <div style="color:#333;max-width:200px">
              <h4 style="margin:0 0 5px;font-size:14px">${markerData.info.name}</h4>
              ${ratingHtml}
              ${addressHtml}
              ${buttonHtml}
            </div>
          `);
          infoWindow.open({ map: mapInstance, anchor: marker });

          // Attach click handler for View Details button after info window opens
          if (markerData.info.placeId) {
            window.google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
              const btn = document.getElementById(`info-details-btn-${idx}`);
              if (btn) {
                btn.addEventListener('click', () => {
                  onPlaceClick?.(markerData.info);
                });
              }
            });
          }
        } else {
          infoWindow.setContent(`<div style="color:#333;font-size:14px">${markerData.title || 'Location'}</div>`);
          infoWindow.open({ map: mapInstance, anchor: marker });
        }
      });

      markersRef.current.push(marker);
    });

    return () => {
      clearMarkers();
    };
  }, [mapInstance, mapData?.markers, clearMarkers, onPlaceClick]);

  // Draw polyline directly via Google Maps API and fit bounds
  useEffect(() => {
    if (!mapInstance || !polylinePath || !window.google) return;

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
      map: mapInstance
    });

    // Fit map bounds to the route
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    mapInstance.fitBounds(bounds, 50);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [mapInstance, polylinePath]);

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

  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={zoom}
      onLoad={onMapLoad}
      options={{
        mapId,
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
    </GoogleMap>
  );
}
