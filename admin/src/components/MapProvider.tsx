import { LoadScript } from '@react-google-maps/api';

const GOOGLE_MAPS_API_KEY = 'AIzaSyD5wNSv6trG1uOBHjsaXkQJzrcgpHGGJI0';
const LIBRARIES: ('places')[] = ['places'];

export default function MapProvider({ children }: { children: React.ReactNode }) {
  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} libraries={LIBRARIES}>
      {children}
    </LoadScript>
  );
}
