import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SkeletonCard } from "../components/Skeleton";
import { AirportSearch, AirportResult } from "../components/AirportSearch";
import { useApi } from "../hooks/useApi";

function useGeolocation() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Unable to retrieve your location");
        setLoading(false);
      }
    );
  };

  return { location, loading, error, requestLocation };
}

export default function Search() {
  const navigate = useNavigate();

  const {
    location,
    loading: geoLoading,
    error: geoError,
    requestLocation,
  } = useGeolocation();

  // Build geolocation-based URL when location is available
  const [geoUrl, setGeoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (location) {
      setGeoUrl(`/api/airports?lat=${location.lat}&lng=${location.lng}&radiusMiles=25`);
    }
  }, [location]);

  const { data: nearbyResults, loading: nearbyLoading, error: nearbyError } = useApi<AirportResult[]>(geoUrl, [geoUrl]);

  const handleSelect = useCallback(
    (airport: AirportResult) => {
      void navigate(`/airport/${airport.code.toLowerCase()}`);
    },
    [navigate]
  );

  const hasNearbyResults = geoUrl !== null;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Search Airports</h2>

      <div className="mb-4">
        <AirportSearch
          placeholder="Airport code, name, city..."
          onSelect={handleSelect}
        />
      </div>

      <div className="mb-6">
        <button
          onClick={requestLocation}
          disabled={geoLoading || !navigator.geolocation}
          className="w-full bg-gray-100 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {geoLoading ? "Locating..." : "📍 Find nearby airports"}
        </button>
        {geoError && <p className="text-red-600 text-sm mt-1">{geoError}</p>}
      </div>

      {nearbyLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {nearbyError && <p className="text-red-600 text-sm">{nearbyError}</p>}
      {!nearbyLoading && hasNearbyResults && (nearbyResults?.length ?? 0) === 0 && (
        <p className="text-gray-500">No airports found nearby.</p>
      )}
      {hasNearbyResults && (
        <div className="space-y-3" data-testid="nearby-results">
          {(nearbyResults ?? []).map((airport) => (
            <Link
              key={airport.id}
              to={`/airport/${airport.code.toLowerCase()}`}
              className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition"
            >
              <p className="text-lg font-semibold">
                {airport.name} <span className="text-gray-500 font-normal">({airport.code})</span>
              </p>
              <p className="text-sm text-gray-500">
                {airport.city}{airport.state ? `, ${airport.state}` : ""} — {airport.country}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
