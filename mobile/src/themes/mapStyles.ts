import { COLORS } from '../utils/constants';

export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#222222' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0f0f0f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#222222' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1f1f1f' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#141414' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#333333' }] },
];

/** Returns dark map style if current theme is dark (black background), otherwise empty */
export function getMapStyle() {
  // Check if current theme is dark by looking at COLORS.background
  const isDark = COLORS.background === '#000000' || COLORS.background === '#0a0a0a' || COLORS.background === '#0A0A0A';
  return isDark ? darkMapStyle : [];
}
