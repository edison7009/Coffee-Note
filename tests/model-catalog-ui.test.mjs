import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const catalogSource = readFileSync(new URL('../src/modelCatalog.ts', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/modelSettings.ts', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');
const rustSource = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../src-tauri/src/dsh_runtime.rs', import.meta.url), 'utf8');

test('models.dev catalog and logos feed the provider settings workspace', () => {
  assert.match(apiSource, /loadModelCatalog/);
  assert.match(catalogSource, /PROVIDER_LOGO_ROOT\s*=\s*'\/providers'/);
  assert.doesNotMatch(catalogSource, /https:\/\/models\.dev/);
  assert.match(appSource, /function ModelSettingsSection/);
  assert.match(appSource, /Anthropic always uses its native Messages API protocol/);
  assert.doesNotMatch(appSource, /settings-protocol-switch|Use native Anthropic protocol/);
  assert.match(appSource, /function ProviderMark/);
  assert.match(appSource, /providerLogoUrl\(providerId\)/);
  assert.doesNotMatch(appSource, /<span>\{selectedCatalogProvider\.id\}<\/span>/);
  assert.match(appSource, /modelCatalog\[provider\.providerId\]\?\.name \|\| provider\.name/);
  assert.match(appSource, /模型的规划决定输出结果和运行上下文，以及不同的价格/);
  assert.match(appSource, /设为默认/);
  assert.doesNotMatch(appSource, /设为当前|正在使用/);
  assert.equal((appSource.match(/className="settings-search-clear"/g) || []).length, 2);
  assert.match(appSource, /onClick=\{\(\) => setProviderSearch\(''\)\}/);
  assert.match(appSource, /onClick=\{\(\) => setModelSearch\(''\)\}/);
  assert.match(appSource, /providerId === defaultProviderId\) return 1/);
  assert.match(appSource, /configuredProviderModels\(configured\)\.length/);
  assert.match(appSource, /const selectedModelCount = entry[\s\S]*configuredProviderModels\(entry\[1\]\)\.length/);
  assert.match(appSource, /selectedModelCount > 0 \?/);
  assert.match(appSource, /className="settings-currency-control"/);
  assert.doesNotMatch(appSource, /settings-model-heading-actions/);
  assert.match(appSource, /\{\(\['CNY', 'USD'\] as const\)\.map/);
  assert.doesNotMatch(appSource, /pricingCurrency|currencyAutoHint|currencyCny|currencyUsd/);
  assert.match(i18nSource, /currencyUnit: '货币单位'/);
  assert.match(i18nSource, /settingsModel: '模型'/);
  assert.match(i18nSource, /settingsModel: 'Models'/);
  assert.doesNotMatch(i18nSource, /pricingCurrency|currencyAutoHint|currencyCny|currencyUsd/);
  assert.match(appSource, /添加自定义/);
  assert.match(appSource, /placeholder=\{locale === 'zh' \? '自定义名称' : 'Custom name'\}/);
  assert.match(appSource, /if \(isCustomProviderId\(providerId\)\) return 0/);
  assert.match(appSource, /<Box className="provider-mark provider-custom-mark"/);
  assert.match(appSource, /settings-delete-provider/);
  assert.match(appSource, /delete providers\[configuredKey\]/);
  assert.match(appSource, /const deleteCustomProvider = \(\) =>/);
  assert.match(appSource, /onClick=\{deleteCustomProvider\}/);
  assert.match(appSource, /const localModelIds = Array\.from\(new Set/);
  assert.match(appSource, /model\.status !== 'deprecated' \|\| enabled\.has\(model\.id\)/);
  assert.match(appSource, /const isManualModel = !Object\.prototype\.hasOwnProperty\.call/);
  assert.match(appSource, /settings-model-row settings-custom-model-row\$\{enabled \? ' selected'/);
  assert.match(appSource, /className="settings-custom-model-toggle"/);
  assert.doesNotMatch(appSource, /settings-custom-model-icon/);
  assert.match(appSource, /className="settings-custom-model-delete"/);
  assert.match(appSource, /const deleteManualModel = \(modelId: string\)/);
  assert.match(settingsSource, /customModels/);
  assert.match(rustSource, /custom_models: Vec<String>/);
});

test('only Anthropic uses the Anthropic wire protocol by default', () => {
  assert.match(catalogSource, /providerId === 'anthropic' \? 'anthropic' : 'openai'/);
  assert.match(settingsSource, /protocol: defaultProtocolForProvider\(providerId\)/);
  assert.match(catalogSource, /deepseek: 'https:\/\/api\.deepseek\.com'/);
  assert.match(settingsSource, /https:\/\/api\.deepseek\.com\/anthropic/);
});

test('duplicate legacy provider records merge before counts and defaults are rendered', () => {
  assert.match(settingsSource, /function mergeDuplicateProviderConfigs/);
  assert.match(settingsSource, /entries\.find\(\(\[key\]\) => key === requestedActive\)/);
  assert.match(settingsSource, /entries\.flatMap\(\(\[, provider\]\) => configuredProviderModels\(provider\)\)/);
  assert.match(appSource, /selectedModelCount > 0 \?/);
  assert.match(appSource, /const normalized = normalizeModelSettings\(config\)/);
});

test('legacy seeded DeepSeek model never acts as a composer fallback', () => {
  assert.match(settingsSource, /legacySeededDeepSeekModel/);
  assert.match(settingsSource, /hasExplicitModelList \? configuredModels : \[model\]/);
  assert.match(settingsSource, /filter\(\(item\) => !legacySeededDeepSeekModel \|\| item !== 'deepseek-v4-flash'\)/);
  assert.match(settingsSource, /const model = models\.includes\(config\.model\) \? config\.model : ''/);
  assert.doesNotMatch(appSource, /deepseek-v4-flash/);
});

test('desktop catalog loads the bundled local data, never models.dev', () => {
  assert.match(rustSource, /include_str!\("\.\.\/\.\.\/public\/model-catalog\.json"\)/);
  assert.doesNotMatch(rustSource, /MODELS_DEV_CATALOG_URL|models\.dev\/api\.json/);
  assert.doesNotMatch(rustSource, /MODEL_CATALOG_MAX_BYTES|MODEL_CATALOG_CACHE_TTL|models-dev-catalog\.json/);
  assert.match(apiSource, /fetch\('\/model-catalog\.json'\)/);
  assert.doesNotMatch(apiSource, /models\.dev\/api\.json/);
});

test('composer selections reach the actual model request', () => {
  assert.match(appSource, /onModelChange\(providerKey, model\)/);
  assert.match(appSource, /reasoningLevels = configuredModel \? COMPOSER_REASONING_LEVELS : \[\]/);
  assert.doesNotMatch(settingsSource, /getCatalogModel|modelMeta\?\.reasoning/);
  assert.match(appSource, /reasoningEffort: modelConfig\.reasoningEffort/);
  assert.match(appSource, /modelContextWindow: catalogModel\?\.limit\?\.context/);
  assert.match(appSource, /modelMaxOutputTokens: catalogModel\?\.limit\?\.output/);
  assert.match(appSource, /modelReasoningEfforts/);
  assert.doesNotMatch(appSource, /clampReasoningEffort|availableReasoningEfforts/);
  assert.doesNotMatch(catalogSource, /function clampReasoningEffort|function availableReasoningEfforts/);
  assert.match(runtimeSource, /profile\["reasoning"\]/);
  assert.match(runtimeSource, /"reasoningEfforts"/);
  assert.match(runtimeSource, /"model": request\.model/);
  assert.match(runtimeSource, /"provider": provider_route\(request\)/);
});

test('custom models never inherit guessed or catalog pricing', () => {
  assert.match(appSource, /const catalogModel = getCatalogModel\(catalog, config\.providerId, config\.model\)/);
  assert.match(appSource, /if \(config\.customModels\.includes\(config\.model\) \|\| !catalogModel\) return null/);
  assert.match(appSource, /const cost = catalogModel\.cost/);
});

test('AI entry points reject incomplete provider configuration before invoking Rust', () => {
  assert.match(
    appSource,
    /if \(\s*isTauri\s*&& \(\s*!modelConfig\.apiKey\.trim\(\)[\s\S]{0,160}!modelConfig\.baseUrl\.trim\(\)[\s\S]{0,160}!modelConfig\.model\.trim\(\)/,
  );
  assert.match(
    appSource,
    /if \(\s*isTauri\s*&& \(\s*!config\.apiKey\.trim\(\)[\s\S]{0,160}!config\.baseUrl\.trim\(\)[\s\S]{0,160}!config\.model\.trim\(\)/,
  );
});
