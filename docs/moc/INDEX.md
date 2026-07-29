# MOC Data Index

> Last updated: 2026-07-29
> Methodology: see [METHODOLOGY.md](./METHODOLOGY.md)

## Core Config

| File | Lines | Nature | Version | Last Investigated | Consumers | Notes |
|---|---|---|---|---|---|---|
| `open-sse/config/providerModels.js` | 106 | static | `b10b807` 2026-07-07 | 2026-07-29 | executors (grok-cli, codex, xiaomi-tokenplan), handlers (ttsProviders, chatCore), `src/shared/constants/models.js`, `src/app/api/providers/[id]/test-models/route.js`, `src/app/api/v1/models/route.js`, `src/app/api/v1beta/models/route.js`, `src/app/api/v1/models/info/route.js`, validate route, test utils | Model alias→ID matrix; high drift risk as providers add/deprecate models |
| `open-sse/config/providers.js` | 19 | static | `bb9e9aa` 2026-06-14 | 2026-07-29 | (re-exported via providers/index.js) | Provider alias shortlist |
| `open-sse/config/ttsModels.js` | 131 | static | `ce84489` 2026-06-26 | 2026-07-29 | `open-sse/providers/index.js` (buildTtsProviderModels), `src/app/api/media-providers/tts/deepgram/voices/route.js`, `src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/TtsExampleCard.js` | TTS provider→model table; re-exported via PROVIDER_MODELS |
| `open-sse/config/ollamaModels.js` | 19 | static | `e35421b` 2026-01-05 | 2026-07-29 | `src/app/api/tags/route.js` | Ollama model list sample; very stale (Jan 2026) |
| `open-sse/config/kiroConstants.js` | 358 | static | `cef5dd4` 2026-07-20 | 2026-07-29 | kiro executor, kiro translators (claude→kiro, openai→kiro), kiro usage service | Kiro-specific streaming/endpoint constants |
| `open-sse/config/models.js` | 13 | static | `401772c` 2026-04-07 | 2026-07-29 | (re-export hub) | Thin re-export index |

## Provider Registry

| File | Lines | Nature | Version | Last Investigated | Consumers | Notes |
|---|---|---|---|---|---|---|
| `open-sse/providers/registry/index.js` | 204 | synced | `55628ee` 2026-07-19 | 2026-07-29 | `open-sse/providers/index.js` | Auto-generated import list; regenerate via `scripts/migrate-registry.mjs` after adding/removing a registry entry |
| `open-sse/providers/registry/*.js` | ~101 files | static | various (oldest: `e35421b` 2026-01-05, newest: `cef5dd4` 2026-07-20) | 2026-07-29 | `registry/index.js` → `providers/index.js` → `PROVIDERS`, `PROVIDER_MODELS`, `PROVIDER_OAUTH`, `PROVIDER_MEDIA` → 50+ consumers across executors, handlers, API routes | Per-provider entry with transport, oauth, models, media config. **Highest drift risk** — each file tracks an upstream provider that may change APIs |
| `open-sse/providers/REGISTRY_TEMPLATE.js` | 98 | static | `bb9e9aa` 2026-06-14 | 2026-07-29 | (template, not imported) | Copy template when adding new provider |

## Provider Engine

| File | Lines | Nature | Version | Last Investigated | Consumers | Notes |
|---|---|---|---|---|---|---|
| `open-sse/providers/capabilities.js` | 336 | static | `79918c7` 2026-07-20 | 2026-07-29 | kiro executor, registry entries (antigravity, cloudflare-ai, black-forest-labs, codex), thinkingLevels, translators (openai→claude, claude format, paramSupport, thinkingUnified, modality), chatCore, copilotModels | Service kind capabilities per provider; affects what media/features are allowed |
| `open-sse/providers/pricing.js` | 317 | static | `68566f5` 2026-07-17 | 2026-07-29 | PricingModal, pricingRepo, usageRepo, pricing API route, thinkingLevels, capabilities | Per-model pricing; used for cost display and quota tracking. High drift risk |
| `open-sse/providers/schema.js` | 76 | static | `bb9e9aa` 2026-06-14 | 2026-07-29 | `providers/index.js`, registry entries | PROVIDER_DEFAULTS and field contract |
| `open-sse/providers/thinkingLevels.js` | 48 | static | `b9e2611` 2026-07-10 | 2026-07-29 | (imported by pricing/capabilities consumers) | Thinking budget levels per model |
| `open-sse/providers/shared.js` | shared | static | `71cd5b2` 2026-07-08 | 2026-07-29 | `src/lib/oauth/constants/oauth.js`, registry entries | Shared API headers, OAuth client configs |
| `open-sse/providers/index.js` | ~50 | synced→build | `b55cf36` 2026-06-20 | 2026-07-29 | 50+ consumers across the entire app | Builds PROVIDERS, PROVIDER_MODELS, PROVIDER_OAUTH, PROVIDER_MEDIA from registry entries + ttsModels |

## Synced / CLI Config

| File | Lines | Nature | Version | Last Investigated | Consumers | Notes |
|---|---|---|---|---|---|---|
| `cli/src/cli/menus/providers.js` | 847 | static/synced | `68566f5` 2026-07-17 | 2026-07-29 | CLI `9router` launcher | CLI provider definitions for tray/launcher; must stay in sync with open-sse registry |

## Test Fixtures

| File | Lines | Nature | Version | Last Investigated | Consumers | Notes |
|---|---|---|---|---|---|---|
| `tests/__fixtures__/provider-connections.json` | — | fixture | `cfe367a` 2026-07-29 | 2026-07-29 | Tests importing fixture in `tests/unit/cursor-models.test.js` and others | Sample provider connection shapes for OAuth/key auth |
| `tests/__fixtures__/chat-completion-sample.json` | — | fixture | `cfe367a` 2026-07-29 | 2026-07-29 | Tests importing fixture | Multi-role OpenAI chat completion request shape |
| `tests/__fixtures__/embeddings-sample.json` | — | fixture | `cfe367a` 2026-07-29 | 2026-07-29 | Tests importing fixture | OpenAI embedding response shape |
| `tests/__fixtures__/v1-models.json` | — | fixture | `cfe367a` 2026-07-29 | 2026-07-29 | Tests importing fixture | OpenAI `/v1/models` response shape |
| `tests/__fixtures__/api-error-shapes.json` | — | fixture | `cfe367a` 2026-07-29 | 2026-07-29 | Tests importing fixture | Common API error shapes for error-handling tests |

## Staleness Risk Summary

| Risk Level | Files | Action When Stale |
|---|---|---|
| **High** (provider API changes) | `providers/registry/*.js`, `providerModels.js`, `pricing.js`, `capabilities.js` | Re-check upstream docs, update file + index |
| **Medium** (versioned config) | `kiroConstants.js`, `ttsModels.js`, `thinkingLevels.js`, `schema.js` | Re-check when related provider changes |
| **Low** (templates, synced, fixtures) | `REGISTRY_TEMPLATE.js`, `registry/index.js`, `index.js`, `providers.js`, `ollamaModels.js`, `cli/src/cli/menus/providers.js`, test fixtures | Update as part of other changes |
