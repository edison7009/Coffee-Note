import { FormEvent, useState } from 'react';
import { Check, LocateFixed, MapPin, RefreshCw, Search } from 'lucide-react';
import { translate } from '../i18n';
import type { Locale } from '../types';
import {
  deviceWeatherLocation,
  loadRecentWeatherLocations,
  loadWeatherLocation,
  saveRecentWeatherLocation,
  saveWeatherLocation,
  searchWeatherLocations,
  type WeatherLocation,
  type WeatherSearchResult,
} from '../weather';

function locationLabel(location: WeatherLocation): string {
  if (!location.region || location.region === location.name) return location.name;
  return `${location.name} · ${location.region}`;
}

export function WeatherLocationSettings({ locale }: { locale: Locale }) {
  const [location, setLocation] = useState<WeatherLocation | null>(() => loadWeatherLocation());
  const [recentLocations, setRecentLocations] = useState<WeatherLocation[]>(() => {
    const recent = loadRecentWeatherLocations();
    const stored = loadWeatherLocation();
    if (recent.length || stored?.source !== 'search') return recent;
    return saveRecentWeatherLocation(stored);
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherSearchResult[]>([]);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseLocation = (nextLocation: WeatherLocation) => {
    saveWeatherLocation(nextLocation);
    if (nextLocation.source === 'search') {
      setRecentLocations(saveRecentWeatherLocation(nextLocation));
    }
    setLocation(nextLocation);
    setResults([]);
    setQuery('');
    setError(null);
  };

  const useCurrentLocation = () => {
    setLocating(true);
    setError(null);
    if (!navigator.geolocation) {
      setLocating(false);
      setError(translate(locale, 'weatherLocationUnavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        chooseLocation(deviceWeatherLocation(
          position.coords.latitude,
          position.coords.longitude,
          translate(locale, 'weatherCurrentLocation'),
        ));
      },
      () => {
        setLocating(false);
        setError(translate(locale, 'weatherLocationDenied'));
      },
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 12_000 },
    );
  };

  const searchCities = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const nextResults = await searchWeatherLocations(query, locale);
      setResults(nextResults);
      if (!nextResults.length) setError(translate(locale, 'weatherNoCities'));
    } catch {
      setError(translate(locale, 'weatherUnavailable'));
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="settings-appearance-block settings-weather-section">
      <div className="settings-weather-header">
        <div className="settings-section-heading">
          <h2>{translate(locale, 'weatherSettingsTitle')}</h2>
          <p>{translate(locale, 'weatherSettingsSub')}</p>
        </div>
        <div className="settings-weather-current">
          <MapPin size={17} aria-hidden="true" />
          <span>
            <small>{translate(locale, 'weatherChooseCity')}</small>
            <strong>{location ? locationLabel(location) : translate(locale, 'weatherNotSet')}</strong>
          </span>
        </div>
      </div>
      <div className="settings-weather-controls">
        {recentLocations.length > 0 && (
          <div className="weather-recent-locations">
            <span>{translate(locale, 'weatherRecent')}</span>
            {recentLocations.map((recent) => (
              <button
                type="button"
                key={`${recent.latitude}:${recent.longitude}`}
                onClick={() => chooseLocation(recent)}
              >
                {recent.name}
              </button>
            ))}
          </div>
        )}
        <div className="settings-weather-search-row">
          <form className="weather-search" onSubmit={searchCities}>
            <Search size={15} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate(locale, 'weatherSearchCity')}
              aria-label={translate(locale, 'weatherSearchCity')}
            />
            <button type="submit" disabled={!query.trim() || searching}>
              {searching
                ? <RefreshCw size={15} className="is-spinning" />
                : translate(locale, 'weatherSearch')}
            </button>
          </form>
          <button
            className="weather-locate-button"
            type="button"
            disabled={locating}
            onClick={useCurrentLocation}
          >
            <LocateFixed size={16} className={locating ? 'is-pulsing' : ''} />
            {locating ? translate(locale, 'weatherLocating') : translate(locale, 'weatherUseLocation')}
          </button>
        </div>
        {results.length > 0 && (
          <div className="weather-search-results">
            {results.map((result) => (
              <button type="button" key={result.id} onClick={() => chooseLocation(result)}>
                <MapPin size={15} aria-hidden="true" />
                <span>
                  <strong>{result.name}</strong>
                  <small>{[result.region, result.country].filter(Boolean).join(' · ')}</small>
                </span>
                {location?.latitude === result.latitude && location.longitude === result.longitude && (
                  <Check size={15} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        )}
        {error && <p className="weather-error">{error}</p>}
      </div>
    </section>
  );
}
