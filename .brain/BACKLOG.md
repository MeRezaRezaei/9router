# BACKLOG

Current active tasks.

## Tasks
- [x] Fix failing tests in vitest suite
  - [x] Update snapshots matching new package version 0.5.45 in `tests/translator/golden-url-header.test.js` and `tests/translator/golden-request.test.js`
  - [x] Fix imports/paths in `tests/unit/claude-header-forwarding.test.js`, `tests/unit/codex-reset-credits.test.js`, `tests/unit/compatible-provider-connections.test.js`, `tests/unit/db-driver-chain.test.js`, `tests/unit/db-migration-chain.test.js`, `tests/unit/kiro-external-idp.test.js`, `tests/unit/model-routing.test.js`, `tests/unit/model-test-routing.test.js`, `tests/unit/provider-test-models-routing.test.js`, `tests/unit/token-refresh-generic.test.js`, `tests/unit/tunnel-pid-ownership.test.js`, `tests/unit/xai-oauth-service.test.js` (missing `open-sse/*` or `@/*` aliases/paths)
  - [x] Fix logic in `tests/unit/translator-request-normalization.test.js` (array vs string content formatting)
  - [x] Fix Cursor state database mock in `tests/unit/oauth-cursor-auto-import.test.js`
  - [x] Fix time-out and assertion in `tests/unit/kiro-terminal-integrity.test.js` and `tests/unit/mimo-free.live.test.js`
