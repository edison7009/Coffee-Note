/**
 * Builds the local model catalog and provider logos from a checkout of
 * https://github.com/anomalyco/models.dev (cloned into references/models.dev).
 *
 * The app is fully local: it must not call models.dev (or any network) for the
 * provider/model directory or logos. This script converts the upstream TOML
 * sources into:
 *   - public/model-catalog.json  (provider → { id, name, npm, api, doc, models })
 *   - public/providers/{providerId}.svg  (monochrome logo per provider)
 *
 * The JSON shape matches what src/modelCatalog.ts `normalizeModelCatalog`
 * already consumes, so the runtime keeps parsing it the same way.
 *
 * Usage: node scripts/build-local-catalog.mjs
 */

import { mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, '..');
const sourceRoot = join(projectRoot, 'references', 'models.dev');
const providersDir = join(sourceRoot, 'providers');
const outJson = join(projectRoot, 'public', 'model-catalog.json');
const outLogosDir = join(projectRoot, 'public', 'providers');

const OFFICIAL_ENDPOINTS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com',
  openrouter: 'https://openrouter.ai/api/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

function parseToml(file) {
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch (error) {
    // Git symlinks materialize as a text file whose only content is the
    // relative target path (e.g. "../../alibaba/models/qwen3-coder-plus.toml").
    const raw = readFileSync(file, 'utf8').trim();
    if (raw && !raw.includes('\n') && raw.includes('/') && !raw.includes('=')) {
      const target = join(dirname(file), raw);
      try {
        return parse(readFileSync(target, 'utf8'));
      } catch (targetError) {
        console.error(`  ! could not resolve symlink ${file} -> ${target}: ${targetError.message}`);
        return null;
      }
    }
    console.error(`  ! failed to parse ${file}: ${error.message}`);
    return null;
  }
}

function optionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeModel(modelId, raw) {
  const cost = raw.cost;
  const limit = raw.limit;
  const reasoningOptions = Array.isArray(raw.reasoning_options)
    ? raw.reasoning_options.map((opt) => {
        const type = typeof opt.type === 'string' ? opt.type : undefined;
        const out = { type };
        if (type === 'budget_tokens' && typeof opt.min === 'number') out.min = opt.min;
        if (type === 'budget_tokens' && typeof opt.max === 'number') out.max = opt.max;
        return out;
      })
    : undefined;
  return {
    id: typeof raw.id === 'string' ? raw.id : modelId,
    name: typeof raw.name === 'string' ? raw.name : modelId,
    family: typeof raw.family === 'string' ? raw.family : undefined,
    reasoning: raw.reasoning === true,
    reasoningOptions,
    toolCall: raw.tool_call === true,
    attachment: raw.attachment === true,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    releaseDate: typeof raw.release_date === 'string' ? raw.release_date : undefined,
    cost: cost
      ? {
          input: optionalNumber(cost.input),
          output: optionalNumber(cost.output),
          cacheRead: optionalNumber(cost.cache_read),
          cacheWrite: optionalNumber(cost.cache_write),
          reasoning: optionalNumber(cost.reasoning),
        }
      : undefined,
    limit: limit
      ? {
          context: optionalNumber(limit.context),
          input: optionalNumber(limit.input),
          output: optionalNumber(limit.output),
        }
      : undefined,
  };
}

function readProvider(providerId, providerDir) {
  const providerFile = join(providerDir, 'provider.toml');
  const provider = parseToml(providerFile) ?? {};
  const modelsDir = join(providerDir, 'models');
  const models = {};
  if (existsSync(modelsDir) && statSync(modelsDir).isDirectory()) {
    for (const entry of readdirSync(modelsDir)) {
      if (!entry.endsWith('.toml')) continue;
      const modelId = basename(entry, '.toml');
      const raw = parseToml(join(modelsDir, entry));
      if (!raw) continue;
      const normalized = normalizeModel(modelId, raw);
      if (normalized) models[normalized.id] = normalized;
    }
  }
  const id = typeof provider.id === 'string' ? provider.id : providerId;
  return {
    id,
    name: typeof provider.name === 'string' ? provider.name : id,
    npm: typeof provider.npm === 'string' ? provider.npm : '',
    api: typeof provider.api === 'string' ? provider.api : OFFICIAL_ENDPOINTS[id],
    doc: typeof provider.doc === 'string' ? provider.doc : undefined,
    models,
  };
}

function main() {
  if (!existsSync(providersDir)) {
    console.error(`providers dir not found: ${providersDir}`);
    console.error('Clone https://github.com/anomalyco/models.dev into references/models.dev first.');
    process.exit(1);
  }

  const catalog = {};
  let logoCount = 0;
  let missingLogo = 0;

  for (const entry of readdirSync(providersDir)) {
    const providerDir = join(providersDir, entry);
    if (!statSync(providerDir).isDirectory()) continue;
    const provider = readProvider(entry, providerDir);
    if (!Object.keys(provider.models).length) continue; // skip providers with no models
    catalog[provider.id] = provider;

    const logo = join(providerDir, 'logo.svg');
    if (existsSync(logo)) {
      mkdirSync(outLogosDir, { recursive: true });
      copyFileSync(logo, join(outLogosDir, `${provider.id}.svg`));
      logoCount += 1;
    } else {
      missingLogo += 1;
    }
  }

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(catalog, null, 2)}\n`);

  const modelCount = Object.values(catalog).reduce((sum, p) => sum + Object.keys(p.models).length, 0);
  console.log(`Wrote ${outJson}`);
  console.log(`  providers: ${Object.keys(catalog).length}`);
  console.log(`  models:    ${modelCount}`);
  console.log(`  logos:     ${logoCount} copied, ${missingLogo} missing`);
}

main();
