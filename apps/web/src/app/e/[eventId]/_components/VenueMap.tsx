'use client';

import { useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { ExternalLink } from 'lucide-react';
import type { EventDetail } from '@troptix/api';
import { cn } from '@/lib/utils';

// Venue map for the public event page. Uses the current
// @vis.gl/react-google-maps APIs — `colorScheme="LIGHT"` (the app is light-only)
// and `AdvancedMarker` for the orange pin (the legacy `Marker` is deprecated).
// Gestures are disabled so it never hijacks scroll; the marker / button opens
// the exact venue in Google Maps.

const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// AdvancedMarker requires a Map ID; DEMO_MAP_ID is Google's reserved fallback
// for local dev. Leave the cloud map style default so `colorScheme` controls it.
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID';

/** Documented Maps URL. Queries by the named venue/address when we have it so
 *  the result shows a labelled place; falls back to coordinates otherwise. */
function googleMapsUrl(event: EventDetail, lat: number, lng: number): string {
  const query = event.venue
    ? `${event.venue}, ${event.address}`
    : event.address || `${lat},${lng}`;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

export default function VenueMap({ event }: { event: EventDetail }) {
  const { latitude: lat, longitude: lng } = event;

  // No real location — null, or the 0,0 "null island" from the legacy form bug.
  const hasLocation = lat != null && lng != null && !(lat === 0 && lng === 0);
  // hasLocation rules out null before we render; the ?? only keeps the hook
  // unconditional (Rules of Hooks forbid it after the early return below).
  const center = useMemo(() => ({ lat: lat ?? 0, lng: lng ?? 0 }), [lat, lng]);

  if (!hasLocation) return null;

  const mapsLink = (
    <a
      href={googleMapsUrl(event, center.lat, center.lng)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted',
        // Overlaid on the map when it renders; a plain chip when it doesn't.
        apiKey && 'absolute left-3 top-3'
      )}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Open in Google Maps
    </a>
  );

  return (
    <div className="relative mt-4">
      {apiKey && (
        <APIProvider apiKey={apiKey}>
          <Map
            mapId={mapId}
            colorScheme="LIGHT"
            defaultCenter={center}
            defaultZoom={15}
            gestureHandling="none"
            disableDefaultUI
            className="h-60 w-full overflow-hidden rounded-2xl border border-border"
          >
            <AdvancedMarker position={center}>
              <span className="block h-4 w-4 rounded-full bg-orange-500 ring-4 ring-orange-500/30" />
            </AdvancedMarker>
          </Map>
        </APIProvider>
      )}

      {mapsLink}
    </div>
  );
}
