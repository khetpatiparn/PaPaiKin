import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PlaceResult {
  name: string;
  vicinity: string;
  rating: number;
  userRatingsTotal: number;
  placeId: string;
  priceLevel: number; // 0=ฟรี 1=ถูก 2=ปานกลาง 3=แพง 4=แพงมาก
  isOpenNow: boolean | null; // null = ไม่มีข้อมูล
  lat: number;
  lng: number;
  photoUrl: string | null; // null = ไม่มีรูป
}

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY') ?? '';
  }

  async findNearbyRestaurants(
    lat: number,
    lng: number,
    keyword?: string,
    radiusMeters = 1000,
    minRating = 0,
    openNow = false,
    maxPrice?: number,
  ): Promise<PlaceResult[]> {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radiusMeters),
      type: 'restaurant',
      key: this.apiKey,
      language: 'th',
    });
    if (keyword) params.set('keyword', keyword);
    if (openNow) params.set('opennow', 'true');
    if (maxPrice !== undefined) params.set('maxprice', String(maxPrice));

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      results: {
        name: string;
        vicinity: string;
        rating?: number;
        user_ratings_total?: number;
        place_id: string;
        price_level?: number;
        opening_hours?: { open_now: boolean };
        geometry: { location: { lat: number; lng: number } };
        photos?: { photo_reference: string }[];
      }[];
      status: string;
    };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      this.logger.error(`Google Places API error: ${data.status}`);
      return [];
    }

    return (data.results ?? [])
      .filter((r) => (r.rating ?? 0) >= minRating)
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        vicinity: r.vicinity,
        rating: r.rating ?? 0,
        userRatingsTotal: r.user_ratings_total ?? 0,
        placeId: r.place_id,
        priceLevel: r.price_level ?? 0,
        isOpenNow: r.opening_hours?.open_now ?? null,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        photoUrl: r.photos?.[0]?.photo_reference
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${r.photos[0].photo_reference}&key=${this.apiKey}`
          : null,
      }));
  }
}
