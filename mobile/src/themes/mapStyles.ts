import { COLORS } from '../utils/constants';

export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#020202' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#020202' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2e2e2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#454545' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#262626' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#333333' }] },
];

/** Returns dark map style if current theme is dark (black background), otherwise empty */
export function getMapStyle() {
  // Check if current theme is dark by looking at COLORS.background
  const isDark = COLORS.background === '#000000' || COLORS.background === '#0a0a0a' || COLORS.background === '#0A0A0A';
  return isDark ? darkMapStyle : [];
}
