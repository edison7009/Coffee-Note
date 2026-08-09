import '../weather.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { translate } from '../i18n';
import type { Locale } from '../types';
import {
  WEATHER_CACHE_TTL_MS,
  WEATHER_LOCATION_CHANGED_EVENT,
  fetchWeather,
  loadCachedWeather,
  loadWeatherLocation,
  weatherCondition,
  weatherKind,
  type WeatherLocation,
  type WeatherSnapshot,
} from '../weather';

function WeatherScene({ weatherCode, isDay }: { weatherCode: number; isDay: boolean }) {
  const kind = weatherKind(weatherCode);
  return (
    <span
      className={`weather-scene weather-scene-${kind} ${isDay ? 'is-day' : 'is-night'}`}
      aria-hidden="true"
    >
      <span className="weather-orb" />
      <span className="weather-cloud weather-cloud-back" />
      <span className="weather-cloud weather-cloud-front" />
      <span className="weather-fog-lines"><i /><i /></span>
      <span className="weather-rain-lines"><i /><i /><i /></span>
      <span className="weather-snow-dots"><i /><i /><i /></span>
      <span className="weather-lightning" />
    </span>
  );
}

function locationLabel(location: WeatherLocation): string {
  if (!location.region || location.region === location.name) return location.name;
  return `${location.name} · ${location.region}`;
}

function dayLabel(locale: Locale, date: string, index: number): string {
  if (index === 0) return translate(locale, 'weatherToday');
  if (index === 1) return translate(locale, 'weatherTomorrow');
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

export function WeatherAmbient({
  locale,
  onOpenAppearanceSettings,
}: {
  locale: Locale;
  onOpenAppearanceSettings: () => void;
}) {
  const [location, setLocation] = useState<WeatherLocation | null>(() => loadWeatherLocation());
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(() => {
    const storedLocation = loadWeatherLocation();
    return storedLocation ? loadCachedWeather(storedLocation) : null;
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (nextLocation: WeatherLocation) => {
    const cached = loadCachedWeather(nextLocation);
    setSnapshot(cached);
    if (
      cached &&
      Date.now() - new Date(cached.fetchedAt).getTime() < WEATHER_CACHE_TTL_MS
    ) {
      setError(null);
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    try {
      setSnapshot(await fetchWeather(nextLocation, controller.signal));
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError') {
        setError(translate(locale, 'weatherUnavailable'));
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [locale]);

  useEffect(() => {
    if (location) void refresh(location);
    return () => requestRef.current?.abort();
  }, [location, refresh]);

  useEffect(() => {
    const syncLocation = () => {
      const nextLocation = loadWeatherLocation();
      setLocation(nextLocation);
      if (!nextLocation) {
        requestRef.current?.abort();
        setSnapshot(null);
        setError(null);
      }
    };
    window.addEventListener(WEATHER_LOCATION_CHANGED_EVENT, syncLocation);
    return () => window.removeEventListener(WEATHER_LOCATION_CHANGED_EVENT, syncLocation);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [panelOpen]);

  const localHour = new Date().getHours();
  const visualWeatherCode = snapshot?.weatherCode ?? 1;
  const visualIsDay = snapshot?.isDay ?? (localHour >= 6 && localHour < 18);

  return (
    <div className="weather-ambient" ref={rootRef}>
      <button
        className="weather-visual-trigger"
        type="button"
        aria-label={snapshot
          ? `${translate(locale, 'weatherOpenForecast')}，${weatherCondition(locale, snapshot.weatherCode)}`
          : translate(locale, 'weatherOpenForecast')}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((open) => !open)}
      >
        <WeatherScene weatherCode={visualWeatherCode} isDay={visualIsDay} />
      </button>

      {panelOpen && (
        <div
          className="weather-panel"
          role="dialog"
          aria-label={translate(locale, 'weatherForecast')}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="weather-panel-header">
            <div className="weather-panel-title">
              <strong>{translate(locale, 'weatherForecast')}</strong>
              {snapshot && <span>{locationLabel(snapshot.location)}</span>}
            </div>
            <div className="weather-panel-actions">
              <button
                type="button"
                aria-label={locale === 'zh' ? '打开外观设置' : 'Open Appearance settings'}
                onClick={onOpenAppearanceSettings}
              >
                <Settings2 size={16} />
              </button>
              <button
                type="button"
                aria-label={translate(locale, 'close')}
                onClick={() => setPanelOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {snapshot ? (
            <div className="weather-panel-forecast">
              <div className="weather-panel-now">
                <WeatherScene weatherCode={snapshot.weatherCode} isDay={snapshot.isDay} />
                <strong>{Math.round(snapshot.temperature)}°</strong>
                <span>
                  {weatherCondition(locale, snapshot.weatherCode)}<br />
                  {translate(locale, 'weatherFeelsLike')} {Math.round(snapshot.apparentTemperature)}°
                </span>
              </div>
              <div className="weather-day-list">
                {snapshot.days.slice(0, 4).map((day, index) => (
                  <div className="weather-day" key={day.date}>
                    <span>{dayLabel(locale, day.date, index)}</span>
                    <span>{weatherCondition(locale, day.weatherCode)}</span>
                    <strong>{Math.round(day.temperatureMin)}° / {Math.round(day.temperatureMax)}°</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="weather-panel-empty">{translate(locale, 'weatherConfigureInAppearance')}</p>
          )}

          {error && <p className="weather-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
