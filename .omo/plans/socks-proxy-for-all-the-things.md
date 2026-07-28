# socks-proxy-for-all-the-things - Work Plan

## TL;DR (For humans)

**What you get**: Per-connection SOCKS proxy (from provider credential settings) applied to ALL non-local media abilities — embeddings, image generation, TTS, STT, web search. Fix quota tracker showing stale totals. Fork synced with decolua/9router upstream.

**Why this approach**: Chat/LLM handlers already proxy correctly via `chatCore.js:205-210`. Media handlers bypass per-connection proxy because they use raw `fetch()` instead of `proxyAwareFetch()`. Fix = replicate proven pattern in each handler. Quota bug = client ignores totals from SSE stream.

**What it will NOT do**: Touch live server, modify Ollama/local handlers, change global `fetch` patch, add dependencies, or deploy.

**Effort**: ~8 implementation tasks + 1 verification wave. Each handler ~20-30 lines changed.

**Risk**: Low — isolated feature branch, no server restart. TTS providers need proxyOptions threaded through 16 fetch sites across 7 files.

**Decision summary**:
- `decolua/9router` master as upstream merge target
- Build proxyOptions from `credentials.providerSpecificData` (same as chatCore.js)
- Pass proxyOptions through handler chains into every fetch call

## Scope

1. Add decolua/9router upstream, fetch, merge latest master
2. Per-connection proxy for **embeddings** (embeddingsCore.js + embeddings.js)
3. Per-connection proxy for **image generation** (imageGenerationCore.js + imageGeneration.js)
4. Per-connection proxy for **TTS** (ttsCore.js → all 7 adapter files + genericFormats.js)
5. Per-connection proxy for **STT** (sttCore.js — 6 transcribe functions)
6. Per-connection proxy for **web search** (search/index.js + search.js)
7. Fix quota tracker stale totals (UsageStats.js SSE merge)
8. Automated mock-data verification for each changed endpoint

## Verification strategy

**Method**: All verification uses isolated mock data + test fixtures. Zero live API calls. Zero server deployment.

**Per-handler verification**: Inject a mock `proxyAwareFetch` that records calls → assert proxyOptions appear in the call list for each fetch site. Or simpler: wrap proxyAwareFetch with a spy, call the handler, verify proxyAwareFetch was called with expected proxyOptions shape.

**Quota verification**: Mock `setInterval` + `fetch` to simulate 30s re-fetch cycle → assert state updates with period-correct totals. Simulate fetch failure → assert previous totals preserved.

**Fork sync verification**: `git log --oneline origin/master..decolua/master` confirms upstream commits merged.

## Execution strategy

**Order**: Fork sync first (avoids merge conflicts with proxy changes). Then proxy handlers in ascending complexity (embeddings → image generation → search → STT → TTS last — TTS touches most files). Quota fix independent. Verification last.

**Model config**: Before running, create `.opencode/opencode.json` at project root:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "gc/gemini-2.5-pro"
}
```
This ensures worker uses `gc/gemini-2.5-pro`. This file stays on the feature branch; remove or revert after execution if not desired permanently.

**Branch**: `feat/proxy-media-handlers` from master.

**No implementation subagents**: All edits are direct file modifications following the proven chatCore.js pattern, small enough for sequential application.

## Todos

### Phase 1 — Fork sync

- [x] 1. Add decolua/9router upstream and merge

    **References**:
    - `.git/config` — current remotes: `origin` (MeRezaRezaei), `upstream` (vheins)
    - README — identifies `decolua/9router` as official

    **Actions**:
    1. `git checkout master`
    2. `git remote add decolua https://github.com/decolua/9router.git`
    3. `git fetch decolua`
    4. `git merge decolua/master`
    5. Resolve any conflicts (SOCKS additions are only in fork's master, no expected conflicts with decolua)
    6. `git checkout -b feat/proxy-media-handlers` — feature branch from updated master

    **Acceptance**: `git log --oneline master ^origin/master ^decolua/master` shows only local commits. `git branch --show-current` = `feat/proxy-media-handlers`.
    
    **QA**: 
    - Happy: merge clean, no conflicts
    - Failure: `git status` shows no uncommitted changes

    **Commit**: `chore(git): add decolua/9router upstream and merge master`

### Phase 2 — Proxy for embeddings

- [x] 2. Inject proxyOptions into embeddings handler chain

    **References**:
    - `open-sse/handlers/chatCore.js:205-210` — canonical proxyOptions building pattern
    - `src/sse/handlers/embeddings.js` — entry point, already has `credentials` from credential loop (line 108-113)
    - `open-sse/handlers/embeddingsCore.js:53,85` — two raw `fetch()` calls
    - `open-sse/utils/proxyFetch.js:294` — `proxyAwareFetch(url, options, proxyOptions)`

    **Actions**:
    1. **`src/sse/handlers/embeddings.js`**: Inside the credential fallback loop (the while-true at line 82), AFTER getting `refreshedCredentials` (line 108) and BEFORE calling `handleEmbeddingsCore`, build proxyOptions:
       ```js
       const proxyOptions = {
         connectionProxyEnabled: refreshedCredentials?.providerSpecificData?.connectionProxyEnabled === true,
         connectionProxyUrl: refreshedCredentials?.providerSpecificData?.connectionProxyUrl || "",
         connectionNoProxy: refreshedCredentials?.providerSpecificData?.connectionNoProxy || "",
         vercelRelayUrl: refreshedCredentials?.providerSpecificData?.vercelRelayUrl || "",
       };
       ```
       Add `proxyOptions` to the options object passed to `handleEmbeddingsCore` (line 110-114).
       Note: proxyOptions must be built INSIDE the loop after each credential refresh — each connection may have different proxy config.
    2. **`open-sse/handlers/embeddingsCore.js`**: 
       a. Add `proxyOptions` to destructured params (line 13)
       b. Import `proxyAwareFetch` from `../utils/proxyFetch.js`
       c. Replace `fetch(url, {...})` (line 53) with `proxyAwareFetch(url, {...}, proxyOptions)`
       d. Replace `fetch(retryUrl, {...})` (line 85) with `proxyAwareFetch(retryUrl, {...}, proxyOptions)`

    **Acceptance**: All `fetch()` calls in embeddingsCore.js are replaced with `proxyAwareFetch()` receiving proxyOptions. The function signature accepts proxyOptions.
    
    **QA**:
    - Happy: Unit test with mock proxyAwareFetch spy asserts proxyOptions passed to both original and retry calls
    - Failure: Test with null credentials asserts proxyOptions uses empty strings/false (no crash)

    **Commit**: `feat(proxy): add per-connection proxy to embeddings handler`

### Phase 3 — Proxy for image generation

- [x] 3. Inject proxyOptions into image generation handler chain

    **References**:
    - `src/sse/handlers/imageGeneration.js:110` — calls handleImageGenerationCore with credentials
    - `open-sse/handlers/imageGenerationCore.js:110,146` — two raw fetch() calls
    - `open-sse/handlers/imageGenerationCore.js:57` — adapter.executeViaExecutor path (may also need proxy)
    - Same proxyOptions building pattern as Todo 2

    **Actions**:
    1. **`src/sse/handlers/imageGeneration.js`**: Two paths:
       a. **NoAuth path** (line 77-86, sdwebui/comfyui): calls `handleImageGenerationCore` without credentials. Pass `proxyOptions: null` — global fetch patch handles env proxy.
       b. **Credentialed path** (line 108-127): Inside credential fallback loop, AFTER `refreshedCredentials` (line 108) and BEFORE calling `handleImageGenerationCore`, build proxyOptions same pattern as Todo 2. Pass to `handleImageGenerationCore`
    2. **`open-sse/handlers/imageGenerationCore.js`**:
       a. Add `proxyOptions` to destructured params (line 29-40)
       b. Import `proxyAwareFetch`
       c. Replace `fetch(url, {...})` (line 110) with `proxyAwareFetch(url, {...}, proxyOptions)`
       d. Replace `fetch(retryUrl, {...})` (line 146) with `proxyAwareFetch(retryUrl, {...}, proxyOptions)`
       e. `adapter.executeViaExecutor` path (line 57): the executor already uses proxyAwareFetch (via base.js) with its own proxyOptions resolution — no change needed here

    **Acceptance**: All fetch() calls in imageGenerationCore.js use proxyAwareFetch with proxyOptions.
    
    **QA**:
    - Happy: Spy on proxyAwareFetch, verify proxyOptions passed with correct shape
    - Failure: Test binaryOutput path still works (line 198-219)

    **Commit**: `feat(proxy): add per-connection proxy to image generation handler`

### Phase 4 — Proxy for web search

- [x] 4. Inject proxyOptions into search handler chain

    **References**:
    - `src/sse/handlers/search.js:173-178` — calls handleSearchCore with credentials
    - `open-sse/handlers/search/index.js:103` — `fetch(url, {...})` in tryDedicatedProvider
    - Similar pattern to Todos 2-3

    **Actions**:
    1. **`src/sse/handlers/search.js`**: Two paths:
       a. **NoAuth path** (line 133-144): calls `handleSearchCore` without credentials. Pass `proxyOptions: null` — global fetch patch handles env proxy.
       b. **Credentialed path** (line 173): Inside credential fallback loop, AFTER `refreshedCredentials` (line 171) and BEFORE calling `handleSearchCore`, build proxyOptions from `refreshedCredentials.providerSpecificData` — same pattern as Todo 2
    2. **`open-sse/handlers/search/index.js`**:
       a. Add `proxyOptions` parameter to `handleSearchCore` export and `tryDedicatedProvider`
       b. Import `proxyAwareFetch` from `open-sse/utils/proxyFetch.js`
       c. Replace `fetch(url, {...})` (line 103) with `proxyAwareFetch(url, {...}, proxyOptions)`

    **Acceptance**: search/index.js uses proxyAwareFetch with proxyOptions for the upstream provider call.
    
    **QA**:
    - Happy: Spy proxyAwareFetch, verify proxyOptions present
    - Failure: Test sanitizeQuery still rejects control chars

    **Commit**: `feat(proxy): add per-connection proxy to web search handler`

### Phase 5 — Proxy for STT

- [x] 5. Inject proxyOptions into STT handler chain

    **References**:
    - `src/sse/handlers/stt.js:75` — calls handleSttCore with credentials
    - `open-sse/handlers/sttCore.js` — 6 async transcribe* functions, all use raw fetch():
      - `transcribeDeepgram` (line 46)
      - `transcribeAssemblyAI` (lines 61, 67, 78)
      - `transcribeNvidia` (line 92)
      - `transcribeGemini` (line 111)
      - `transcribeHuggingFace` (line 129)
      - `transcribeOpenAICompatible` (line 148)

    **Actions**:
    1. **`src/sse/handlers/stt.js`**: Two paths:
       a. **NoAuth path** (line 49-53): calls `handleSttCore` without credentials. Pass `proxyOptions: null` — global fetch patch handles env proxy.
       b. **Credentialed path** (line 75): builds proxyOptions from `credentials.providerSpecificData`, passes to `handleSttCore`
    2. **`open-sse/handlers/sttCore.js`**:
       a. Add `proxyOptions` to handleSttCore params (line 169)
       b. Import `proxyAwareFetch`
       c. Add `proxyOptions` param to each transcribe* function signature (default `null` so noAuth paths work)
       d. Replace every `fetch(...)` with `proxyAwareFetch(..., proxyOptions)` in all 6 functions (8 fetch sites total)

    **Acceptance**: All 8 fetch() calls in sttCore.js use proxyAwareFetch with proxyOptions.
    
    **QA**:
    - Happy: Spy proxyAwareFetch on each transcribe function path
    - Failure: Test authType === "none" path (no token) still returns correct error

    **Commit**: `feat(proxy): add per-connection proxy to STT handler`

### Phase 6 — Proxy for TTS (most files)

> **Order**: Todo 6 in full first (ttsCore.js + all special adapters), then Todo 7 (config-driven). The ttsCore.js changes (step 2 below) are shared — both special adapters and config-driven handlers depend on proxyOptions flowing from handleTtsCore.

- [x] 6. Inject proxyOptions into TTS handler chain — special adapters

    **References**:
    - `src/sse/handlers/tts.js:76,101` — calls handleTtsCore with credentials
    - `open-sse/handlers/ttsCore.js:58-63` — SPECIAL_ADAPTERS dispatch to adapter.synthesize(..., credentials)
    - `open-sse/handlers/ttsProviders/openai.js:21` — raw fetch()
    - `open-sse/handlers/ttsProviders/elevenlabs.js:13,31` — raw fetch() (voices + synthesize)
    - `open-sse/handlers/ttsProviders/edgeTts.js:15,38,55` — raw fetch() (token + ttsRequest + voices)
    - `open-sse/handlers/ttsProviders/gemini.js:66` — raw fetch()

    **Actions**:
    1. **`src/sse/handlers/tts.js`**: Two paths to handle:
       a. **NoAuth path** (line 75-78): calls `handleTtsCore` without credentials. Pass `proxyOptions: null` — the global fetch patch handles env proxy.
       b. **Credentialed path** (line 101): builds proxyOptions from `credentials.providerSpecificData` matching Todo 2 pattern, passes to `handleTtsCore`.
    2. **`open-sse/handlers/ttsCore.js`** (shared — this change used by both Todo 6 and 7):
       a. Add `proxyOptions` to handleTtsCore destructured params (line 51): `{ provider, model, input, credentials, proxyOptions, responseFormat = "mp3", language }`
       b. Pass `proxyOptions` to `adapter.synthesize(input, model, credentials, responseFormat, { language, proxyOptions })` on line 60
       c. Also pass `proxyOptions` to `synthesizeViaConfig(provider, input, model, credentials, proxyOptions)` on line 67
    3. **Each provider file**: Add `proxyOptions` extraction from the 5th arg options object, import `proxyAwareFetch`, replace `fetch()`:
       - `openai.js`: replace fetch (line 21) with proxyAwareFetch
       - `elevenlabs.js`: replace both fetches (lines 13, 31) with proxyAwareFetch
       - `edgeTts.js`: replace three fetches (lines 15, 38, 55) with proxyAwareFetch
       - `gemini.js`: replace fetch (line 66) with proxyAwareFetch
       - `_base.js`: check if responseToBase64/throwUpstreamError use fetch

    **Acceptance**: All special TTS adapter fetch calls use proxyAwareFetch with proxyOptions.
    
    **QA**:
    - Happy: Spy on proxyAwareFetch per provider path, verify proxyOptions shape
    - Failure: Test noAuth provider path (edge-tts) still works without credentials

    **Commit**: `feat(proxy): add per-connection proxy to TTS special adapters`

- [x] 7. Inject proxyOptions into TTS config-driven handlers (genericFormats.js)

    **References**:
    - `open-sse/handlers/ttsProviders/index.js:28-40` — synthesizeViaConfig dispatches to FORMAT_HANDLERS with { baseUrl, apiKey, text, modelId, voiceId }
    - `open-sse/handlers/ttsProviders/genericFormats.js` — 10 format handlers all use raw fetch()

    **Actions**:
    1. **`open-sse/handlers/ttsProviders/index.js`**:
       a. Add `proxyOptions` param to `synthesizeViaConfig` (line 28): `async function synthesizeViaConfig(provider, text, model, credentials, proxyOptions)`
       b. Pass `proxyOptions` through to each FORMAT_HANDLERS entry: `handler({ baseUrl, apiKey, text, modelId, voiceId, proxyOptions })`
    2. **`open-sse/handlers/ttsProviders/genericFormats.js`**:
       a. Import `proxyAwareFetch` from `open-sse/utils/proxyFetch.js`
       b. Add `proxyOptions` to each handler's destructured params (all 10 handlers — even local ones for interface consistency)
       c. External API handlers (hyperbolic, deepgram, nvidia, huggingface, inworld, cartesia, playht, openaiCompat/minimax): replace `fetch(...)` with `proxyAwareFetch(..., proxyOptions)`
       d. Local/noAuth handlers (coqui, tortoise): keep raw `fetch()` — proxyOptions param received but unused. `_base.js`: confirmed no fetch calls, no change needed.

    **Acceptance**: All non-local format handlers use proxyAwareFetch. Local handlers (coqui, tortoise) unchanged.
    
    **QA**:
    - Happy: Spy proxyAwareFetch for hyperbolic/deepgram/nvidia paths with proxyOptions
    - Failure: Test coqui local handler still uses raw fetch

    **Commit**: `feat(proxy): add per-connection proxy to TTS config-driven handlers`

### Phase 7 — Quota tracker fix

- [x] 8. Fix quota tracker static totals in UsageStats.js

    **References**:
    - `src/shared/components/UsageStats.js:285-293` — SSE onmessage discards totals
    - `src/app/api/usage/stream/route.js:12-24,34-39` — SSE actually pushes full stats

    **⚠️ Root cause nuance**: SSE stream (`stream/route.js:22`) calls `getUsageStats()` with NO period arg → defaults to `period="all"`. But client REST fetch uses `?period=${period}` (e.g. "today", "7d"). Merging SSE totals directly would mix all-time totals with period-specific breakdowns → wrong. Fix: add periodic REST re-fetch, don't rely on SSE for totals.

    **Actions**:
    1. **`src/shared/components/UsageStats.js`**: After the existing SSE `useEffect` (lines 278-304), add a second `useEffect` with a `setInterval` that re-fetches `/api/usage/stats?period=${period}` every 30 seconds:
       ```js
       // Periodic REST re-fetch to update totals for current period
       useEffect(() => {
         const timer = setInterval(() => {
           fetch(`/api/usage/stats?period=${period}`)
             .then((r) => r.ok ? r.json() : null)
             .then((data) => {
               if (data) setStats((prev) => ({ ...prev, ...data }));
             })
             .catch(() => {});
         }, 30000);
         return () => clearInterval(timer);
       }, [period]);
       ```
    2. Keep SSE handler unchanged — it still handles real-time fields (activeRequests, recentRequests, errorProvider, pending).
    3. The periodic timer ensures totals update within 30s of any usage change, using the CORRECT period.

    **Acceptance**: Every 30 seconds, OverviewCards shows updated totals matching the current period selection. No period-mixing.
    
    **QA**:
    - Happy: Mock clock → advance 30s → assert setStats called with period-correct totals
    - Failure: Mock fetch failure → assert previous totals preserved (no crash)
    - Edge: Period changed while timer active → clear old interval, start new one with correct period

    **Commit**: `fix(usage): merge full stats from SSE stream to update totals in real-time`

### Phase 8 — Verification

- [x] 9. Write mock-data verification tests for proxy flow

    **References**:
    - `tests/` directory — vitest framework
    - `tests/vitest.config.js` — resolves `open-sse/` and `@/` aliases
    - Each handler's existing test patterns in `tests/`

    **Actions**:
    1. Create `tests/unit/proxy-media-handlers.test.js`
    2. For each handler, write a test that:
       a. Imports the handler with proxyAwareFetch mocked/spied
       b. Calls it with mock credentials containing providerSpecificData with proxy config
       c. Asserts proxyAwareFetch was called with the expected proxyOptions shape
    3. For quota: write test that simulates SSE data with/without totals and asserts correct merge behavior
    4. Verify tests pass: `cd tests && npx vitest run unit/proxy-media-handlers.test.js`

    **Acceptance**: All proxy tests pass, confirming proxyOptions flow for every handler path.
    
    **QA**:
    - Happy: All assertions pass
    - Failure: Test missing proxyOptions in any handler path fails with clear error

    **Commit**: `test(proxy): add mock-data verification for media handler proxy flow`

## Final verification wave

- [x] F1. Plan compliance audit: Verify every todo is implemented, all referenced files modified, no Scope OUT items touched
- [x] F2. Code quality review: No console.log left, no dead code, no unused imports
- [x] F3. Full verification run: `cd tests && npx vitest run` — verify no regression vs baseline
- [x] F4. Scope fidelity: Confirm no changes to proxyFetch.js, no new dependencies, no live server modifications

## Commit strategy

| # | Scope | Commit message |
|---|-------|----------------|
| 1 | Git | `chore(git): add decolua/9router upstream and merge master` |
| 2 | Embeddings | `feat(proxy): add per-connection proxy to embeddings handler` |
| 3 | Image gen | `feat(proxy): add per-connection proxy to image generation handler` |
| 4 | Search | `feat(proxy): add per-connection proxy to web search handler` |
| 5 | STT | `feat(proxy): add per-connection proxy to STT handler` |
| 6 | TTS special | `feat(proxy): add per-connection proxy to TTS special adapters` |
| 7 | TTS config | `feat(proxy): add per-connection proxy to TTS config-driven handlers` |
| 8 | Quota | `fix(usage): merge full stats from SSE stream to update totals in real-time` |
| 9 | Tests | `test(proxy): add mock-data verification for media handler proxy flow` |

## Success criteria

1. Per-connection proxy from credential settings applies to ALL five media modalities
2. Quota tracker dashboard shows live-updating totals without manual period re-fetch
3. All tests pass with mock data — no live API calls
4. Live server untouched — all changes in `feat/proxy-media-handlers` branch only
5. No new dependencies
