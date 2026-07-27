Added proxyOptions to search handler chain. Refactored src/sse/handlers/search.js and open-sse/handlers/search/index.js.
- Injected proxy configuration into STT handler chain. The  function now correctly uses  for both credentialed and non-credentialed STT providers. This was done in  and .
- Injected proxy configuration into STT handler chain. The `proxyAwareFetch` function now correctly uses `proxyOptions` for both credentialed and non-credentialed STT providers. This was done in `src/sse/handlers/stt.js` and `open-sse/handlers/sttCore.js`.

## 2026-07-27 Wave A complete
Task 1: decolua remote added, master merged, feat/proxy-media-handlers created
Task 2: embeddings proxy — embeddings.js + embeddingsCore.js
Task 3: image gen proxy — imageGeneration.js + imageGenerationCore.js
Task 4: search proxy — search.js + search/index.js
Task 5: STT proxy — stt.js + sttCore.js (all 6 transcribe functions, 8 fetch sites)
Task 6: TTS special adapters — tts.js + ttsCore.js + openai.js + elevenlabs.js + edgeTts.js + gemini.js
Task 8: quota fix — UsageStats.js (30s periodic REST re-fetch)

Bug fixes post-review:
- stt.js/tts.js: proxyOptions pattern corrected to canonical 4-field
- sttCore.js: Buffer import restored
- edgeTts.js/gemini.js: added proxy support (were missed)
