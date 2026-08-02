# BACKLOG

Current active tasks.

## Tasks
- [x] Fix failing tests in vitest suite
  - [x] Update snapshots matching new package version 0.5.45 in `tests/translator/golden-url-header.test.js` and `tests/translator/golden-request.test.js`
  - [x] Fix imports/paths in `tests/unit/claude-header-forwarding.test.js`, `tests/unit/codex-reset-credits.test.js`, `tests/unit/compatible-provider-connections.test.js`, `tests/unit/db-driver-chain.test.js`, `tests/unit/db-migration-chain.test.js`, `tests/unit/kiro-external-idp.test.js`, `tests/unit/model-routing.test.js`, `tests/unit/model-test-routing.test.js`, `tests/unit/provider-test-models-routing.test.js`, `tests/unit/token-refresh-generic.test.js`, `tests/unit/tunnel-pid-ownership.test.js`, `tests/unit/xai-oauth-service.test.js` (missing `open-sse/*` or `@/*` aliases/paths)
  - [x] Fix logic in `tests/unit/translator-request-normalization.test.js` (array vs string content formatting)
  - [x] Fix Cursor state database mock in `tests/unit/oauth-cursor-auto-import.test.js`
  - [x] Fix time-out and assertion in `tests/unit/kiro-terminal-integrity.test.js` and `tests/unit/mimo-free.live.test.js`
- [x] Maintain and ensure full MOC Data Index coverage for all providers - verified registry, configs, and fixtures, keeping the MOC index up to date.
- [x] Implement MOC tests and separate local/remote request routing with MITM IP isolation (no main server 443 requests)
- [x] Implement provider data auto-update & API collection endpoint for crowdsourced MOC updates
- [x] Implement GitHub-based fast change detection & AI suggestion loop for data structure drift
- [x] Integrate Redis for configuration/route caching and speed optimization
- [x] Integrate Vault for secure provider credentials/data storage
- [x] Split off statistics stack and implement audit/trash logs database with enhanced logging
- [x] Implement Vault-only sensitive fields storage (apiKey, accessToken, refreshToken, idToken) referencing UUIDs from SQLite DB (with Redis write-through cache observer)
- [x] Implement provider model aggregation and de-duplication based on similarity matching (OpenRouter, DeepSeek direct, Zen DeepSeek)
- [x] Enrich provider data structures (send/receive/offers) to support aggregation, and allow free providers key insertion without crashes
- [x] Add an AI aggregation/mapping optimization button to the dashboard using an LLM to recommend groupings
- [x] Verify outbound SOCKS proxy settings are properly cached and handled dynamically in Redis

## Testing Backlog
- [x] Add unit tests for Redis caching functionality (`src/lib/redis.js` and DB repository cached wrappers)
- [x] Add unit tests for Vault secure credentials storage (`src/lib/vault.js` and DB repository Vault integration)
- [x] Add unit tests for Logs and Stats DB separation (verifying correct SQLite file isolation and repo routing)
- [x] Add unit tests for auto-switch web_search capability detection (`open-sse/services/combo.js`)
- [ ] Expand unit tests for model aggregation route/resolver edge cases (priority fallbacks, offline combos)
