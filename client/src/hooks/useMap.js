import { useState, useCallback } from 'react';

export function useMap() {
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [activeInfoWindow, setActiveInfoWindow] = useState(null);

  const selectPlace = useCallback((place) => {
    setSelectedPlace(place);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlace(null);
    setActiveInfoWindow(null);
  }, []);

  const openInfoWindow = useCallback((markerId) => {
    setActiveInfoWindow(markerId);
  }, []);

  const closeInfoWindow = useCallback(() => {
    setActiveInfoWindow(null);
  }, []);

  return {
    selectedPlace,
    activeInfoWindow,
    selectPlace,
    clearSelection,
    openInfoWindow,
    closeInfoWindow
  };
}
