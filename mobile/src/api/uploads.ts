import apiClient from './client';
import { API_BASE_URL } from '../utils/constants';

export interface LibraryImage {
  url: string;
  make: string;
  filename: string;
}

/** Upload vehicle images from device (camera/gallery) */
export async function uploadVehicleImages(imageUris: string[]): Promise<string[]> {
  const formData = new FormData();

  for (const uri of imageUris) {
    const filename = uri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    formData.append('images', {
      uri,
      name: filename,
      type,
    } as unknown as Blob);
  }

  const { data } = await apiClient.post('/uploads/vehicle-images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });

  return data.urls;
}

/** Get all stock library images */
export async function getLibraryImages(): Promise<{ images: LibraryImage[]; makes: string[] }> {
  const { data } = await apiClient.get('/uploads/library');
  // Convert relative URLs to full URLs
  return {
    makes: data.makes,
    images: data.images.map((img: LibraryImage) => ({
      ...img,
      url: img.url.startsWith('http') ? img.url : API_BASE_URL.replace('/v1', '') + img.url,
    })),
  };
}
