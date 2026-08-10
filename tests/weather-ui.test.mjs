import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const component = await readFile(new URL('../src/home/WeatherAmbient.tsx', import.meta.url), 'utf8');
const settings = await readFile(new URL('../src/settings/WeatherLocationSettings.tsx', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const weather = await readFile(new URL('../src/weather.ts', import.meta.url), 'utf8');
const storage = await readFile(new URL('../src/storage.ts', import.meta.url), 'utf8');
const css = [
  await readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  await readFile(new URL('../src/weather.css', import.meta.url), 'utf8'),
].join('\n');

test('Home greeting includes the ambient weather readout', () => {
  assert.match(app, /<WeatherAmbient locale=\{locale\} onOpenAppearanceSettings=\{onOpenAppearanceSettings\} \/>/);
  assert.match(app, /className="hero-copy"/);
});

test('weather remains opt-in and stores only rounded device coordinates', () => {
  assert.match(settings, /onClick=\{useCurrentLocation\}/);
  assert.doesNotMatch(settings, /useEffect\([^)]*navigator\.geolocation/s);
  assert.match(weather, /Math\.round\(value \* 10\) \/ 10/);
  assert.match(weather, /storageKey\('weather-location:v1'\)/);
  assert.match(storage, /STORAGE_PREFIX = 'coffee-note:'/);
  assert.match(storage, /const STORAGE_PREFIX = 'coffee-note:'/);
});

test('weather keeps a local, deduplicated recent-city history', () => {
  assert.match(weather, /storageKey\('weather-recent-locations:v1'\)/);
  assert.match(weather, /WEATHER_RECENT_LOCATIONS_LIMIT = 10/);
  assert.match(weather, /\[location, \.\.\.recent\]\.slice\(0, WEATHER_RECENT_LOCATIONS_LIMIT\)/);
  assert.match(weather, /normalizeWeatherLocationName/);
  assert.match(settings, /className="weather-recent-locations"/);
  assert.match(css, /\.weather-recent-locations button\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(settings, /weatherPrivacy/);
});

test('weather data is cached and visibly attributed in Appearance settings', () => {
  assert.match(weather, /WEATHER_CACHE_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(component, /const cached = loadCachedWeather\(nextLocation\);\s*setSnapshot\(cached\);/s);
  assert.doesNotMatch(component, /if \(cached\) setSnapshot\(cached\)/);
  assert.doesNotMatch(component, /天气数据 · Open-Meteo|open-meteo\.com/);
  assert.match(i18n, /显示在首页天气预报，数据来源 Open-Meteo/);
  assert.doesNotMatch(settings, /openExternalUrl|open-meteo\.com/);
  assert.doesNotMatch(settings, /settings-weather-attribution|settings-weather-footer/);
});

test('Home keeps weather text and provider branding inside the click panel', () => {
  assert.match(component, /className="weather-visual-trigger"/);
  assert.doesNotMatch(component, /weather-readout-copy|weather-attribution/);
});

test('Home forecast is read-only and weather setup lives in Appearance', () => {
  assert.doesNotMatch(component, /useCurrentLocation|searchCities|weather-search|weather-remove/);
  assert.match(settings, /settings-appearance-block settings-weather-section/);
  assert.match(app, /<WeatherLocationSettings locale=\{locale\} \/>/);
  assert.match(weather, /WEATHER_LOCATION_CHANGED_EVENT/);
});

test('Appearance settings use one compact group and a structured weather layout', () => {
  assert.match(app, /className="settings-appearance-group"/);
  assert.match(app, /settings-appearance-block settings-appearance-inline/);
  assert.match(settings, /className="settings-weather-header"/);
  assert.match(settings, /className="settings-weather-search-row"/);
  assert.doesNotMatch(settings, /weather-remove|weatherRemove|clearWeatherLocation/);
  assert.doesNotMatch(weather, /clearWeatherLocation/);
  assert.match(css, /\.settings-appearance-block \+ \.settings-appearance-block\s*\{[^}]*border-top:/s);
  assert.match(css, /\.settings-weather-header\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.settings-weather-search-row\s*\{[^}]*grid-template-columns:/s);
});

test('forecast header is compact and its gear opens Appearance settings', () => {
  assert.match(component, /className="weather-panel-title"/);
  assert.match(component, /<Settings2 size=\{16\}/);
  assert.match(component, /onClick=\{onOpenAppearanceSettings\}/);
  assert.match(app, /setSettingsSection\('appearance'\)/);
  assert.match(app, /initialSection=\{settingsSection\}/);
  assert.match(css, /\.weather-panel-title\s*\{[^}]*display:\s*flex;/s);
});

test('weather stays in the hero background without taking text layout space', () => {
  assert.match(css, /\.home-view \.hero\s*\{[^}]*position:\s*relative;[^}]*display:\s*block;/s);
  assert.match(css, /\.weather-ambient\s*\{[^}]*position:\s*absolute;[^}]*right:\s*10px;[^}]*bottom:\s*-7px;/s);
  assert.match(css, /\.weather-scene\s*\{[^}]*overflow:\s*visible;/s);
  assert.match(css, /\.weather-visual-trigger\s*\{[^}]*overflow:\s*visible;[^}]*background:\s*transparent;/s);
  assert.match(css, /\.weather-visual-trigger:hover,[^{]*\.weather-visual-trigger:focus-visible\s*\{[^}]*background:\s*transparent;/s);
  assert.doesNotMatch(css, /\.home-view \.hero\s*\{[^}]*grid-template-columns:/s);
});

test('ambient motion has a reduced-motion fallback and no native tooltips', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /weather-cloud-drift/);
  assert.doesNotMatch(component, /\btitle=/);
});

test('weather search uses one stable outer focus border', () => {
  assert.match(css, /\.weather-search:focus-within\s*\{[^}]*border-color:/s);
  assert.match(css, /\.weather-search input:focus,[^{]*\.weather-search input:focus-visible\s*\{[^}]*outline:\s*none;/s);
  assert.doesNotMatch(css, /\.weather-panel input:focus-visible/);
});
