export type WeatherKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export interface WeatherLocation {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  source: 'search' | 'device';
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbability: number;
}

export interface WeatherSnapshot {
  location: WeatherLocation;
  fetchedAt: string;
  weatherCode: number;
  temperature: number;
  apparentTemperature: number;
  isDay: boolean;
  nextSixHourPrecipitation: number;
  days: WeatherDay[];
}

export interface WeatherSearchResult extends WeatherLocation {
  id: number;
}

const LOCATION_KEY = 'tiernote:weather-location:v1';
const CACHE_KEY = 'tiernote:weather-cache:v1';
const RECENT_LOCATIONS_KEY = 'tiernote:weather-recent-locations:v1';
export const WEATHER_LOCATION_CHANGED_EVENT = 'tiernote:weather-location-changed';
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
export const WEATHER_RECENT_LOCATIONS_LIMIT = 10;

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeWeatherLocationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseLocation(value: unknown): WeatherLocation | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== 'string' ||
    !finiteNumber(record.latitude) ||
    !finiteNumber(record.longitude) ||
    (record.source !== 'search' && record.source !== 'device')
  ) {
    return null;
  }
  const name = normalizeWeatherLocationName(record.name);
  if (!name) return null;
  return {
    name,
    region: typeof record.region === 'string' ? record.region : undefined,
    country: typeof record.country === 'string' ? record.country : undefined,
    latitude: record.latitude,
    longitude: record.longitude,
    timezone: typeof record.timezone === 'string' ? record.timezone : undefined,
    source: record.source,
  };
}

export function loadWeatherLocation(): WeatherLocation | null {
  try {
    return parseLocation(JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null'));
  } catch {
    return null;
  }
}

export function saveWeatherLocation(location: WeatherLocation): void {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
  window.dispatchEvent(new Event(WEATHER_LOCATION_CHANGED_EVENT));
}

export function loadRecentWeatherLocations(): WeatherLocation[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_LOCATIONS_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((entry) => {
      const location = parseLocation(entry);
      return location?.source === 'search' ? [location] : [];
    }).slice(0, WEATHER_RECENT_LOCATIONS_LIMIT);
  } catch {
    return [];
  }
}

export function saveRecentWeatherLocation(location: WeatherLocation): WeatherLocation[] {
  if (location.source !== 'search') return loadRecentWeatherLocations();
  const recent = loadRecentWeatherLocations().filter((entry) => (
    entry.latitude !== location.latitude || entry.longitude !== location.longitude
  ));
  const next = [location, ...recent].slice(0, WEATHER_RECENT_LOCATIONS_LIMIT);
  localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(next));
  return next;
}

export function loadCachedWeather(location: WeatherLocation): WeatherSnapshot | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as WeatherSnapshot | null;
    if (!cached || !cached.location || !Array.isArray(cached.days)) return null;
    if (
      cached.location.latitude !== location.latitude ||
      cached.location.longitude !== location.longitude ||
      !finiteNumber(cached.temperature) ||
      !finiteNumber(cached.weatherCode)
    ) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function saveWeatherCache(snapshot: WeatherSnapshot): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}

export function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloudy';
}

export function weatherCondition(locale: 'zh' | 'en', code: number): string {
  const kind = weatherKind(code);
  const labels = {
    zh: {
      clear: '晴朗',
      'partly-cloudy': '多云间晴',
      cloudy: '阴天',
      fog: '有雾',
      drizzle: '细雨',
      rain: '有雨',
      snow: '有雪',
      storm: '雷暴',
    },
    en: {
      clear: 'Clear',
      'partly-cloudy': 'Partly cloudy',
      cloudy: 'Cloudy',
      fog: 'Foggy',
      drizzle: 'Drizzle',
      rain: 'Rain',
      snow: 'Snow',
      storm: 'Thunderstorm',
    },
  } as const;
  return labels[locale][kind];
}

export async function searchWeatherLocations(
  query: string,
  locale: 'zh' | 'en',
  signal?: AbortSignal,
): Promise<WeatherSearchResult[]> {
  const params = new URLSearchParams({
    name: query.trim(),
    count: '6',
    language: locale,
    format: 'json',
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
    signal,
  });
  if (!response.ok) throw new Error(`Weather geocoding returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  return (payload.results || []).flatMap((result) => {
    if (
      !finiteNumber(result.id) ||
      typeof result.name !== 'string' ||
      !finiteNumber(result.latitude) ||
      !finiteNumber(result.longitude)
    ) {
      return [];
    }
    return [{
      id: result.id,
      name: normalizeWeatherLocationName(result.name),
      region: typeof result.admin1 === 'string' ? result.admin1 : undefined,
      country: typeof result.country === 'string' ? result.country : undefined,
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: typeof result.timezone === 'string' ? result.timezone : undefined,
      source: 'search' as const,
    }];
  });
}

export async function fetchWeather(
  location: WeatherLocation,
  signal?: AbortSignal,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,is_day,weather_code',
    hourly: 'precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '4',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error(`Weather forecast returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    current?: Record<string, unknown>;
    hourly?: Record<string, unknown>;
    daily?: Record<string, unknown>;
  };
  const current = payload.current || {};
  const hourly = payload.hourly || {};
  const daily = payload.daily || {};
  if (
    !finiteNumber(current.temperature_2m) ||
    !finiteNumber(current.apparent_temperature) ||
    !finiteNumber(current.weather_code) ||
    !finiteNumber(current.is_day)
  ) {
    throw new Error('Weather forecast response is incomplete');
  }

  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  const hourlyPrecipitation = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];
  const currentTime = typeof current.time === 'string' ? current.time : '';
  const startIndex = Math.max(0, hourlyTimes.findIndex((time) => String(time) >= currentTime));
  const nextSixHourPrecipitation = hourlyPrecipitation
    .slice(startIndex, startIndex + 6)
    .filter(finiteNumber)
    .reduce((maximum, value) => Math.max(maximum, value), 0);

  const dates = Array.isArray(daily.time) ? daily.time : [];
  const weatherCodes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const maximums = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const minimums = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const precipitation = Array.isArray(daily.precipitation_probability_max)
    ? daily.precipitation_probability_max
    : [];
  const days: WeatherDay[] = dates.flatMap((date, index) => {
    if (
      typeof date !== 'string' ||
      !finiteNumber(weatherCodes[index]) ||
      !finiteNumber(maximums[index]) ||
      !finiteNumber(minimums[index])
    ) {
      return [];
    }
    return [{
      date,
      weatherCode: weatherCodes[index],
      temperatureMax: maximums[index],
      temperatureMin: minimums[index],
      precipitationProbability: finiteNumber(precipitation[index]) ? precipitation[index] : 0,
    }];
  });
  if (!days.length) throw new Error('Weather forecast has no daily data');

  const snapshot: WeatherSnapshot = {
    location,
    fetchedAt: new Date().toISOString(),
    weatherCode: current.weather_code,
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    isDay: current.is_day === 1,
    nextSixHourPrecipitation,
    days,
  };
  saveWeatherCache(snapshot);
  return snapshot;
}

export function deviceWeatherLocation(
  latitude: number,
  longitude: number,
  name: string,
): WeatherLocation {
  const cityPrecision = (value: number) => Math.round(value * 10) / 10;
  return {
    name,
    latitude: cityPrecision(latitude),
    longitude: cityPrecision(longitude),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    source: 'device',
  };
}
