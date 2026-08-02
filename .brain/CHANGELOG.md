# Changelog

## Unreleased

### Added
- `tests/unit/usage-repo.test.js` — usageRepo behavior tests (dedup, cost calc from pricing defaults + user override, daily aggregation, history window/masking, chart + recent-log reads)
- `tests/unit/capabilities.test.js` — gemini-generation-model reasoning/thinkingFormat assertions for `*gemini-2*` and `*gemini*` patterns
- `open-sse/providers/capabilities.js` — bare gemini-2 and gemini patterns now report `reasoning: true` + `thinkingFormat: "gemini-budget"` instead of silently downgrading to text-only inference
- `CONTROL.md` — management-control methodology (RC-A..RC-E responsibility centers) applied to 9router

### Fixed
- `tests/unit/usage-repo.test.js` — cost calc test used stale `PROVIDER_PRICING.openai["gpt-4o"]` (no longer exists) and wrong override field names (`cacheWriteInput`/`cacheReadInput` → `cached`/`cache_creation`); fixed to use `getPricingForModel()` + correct schema
- Removed throwaway `tests/unit/zz-debug.test.js` (scratch file fully redundant with usage-repo test)

### Commits
- `be31c840` feat(capabilities): add reasoning/thinkingFormat to bare gemini patterns + tests
- `45b33f33` docs(brain): record usageRepo + gemini capability tests and feat commit
- `5ad28b75` docs(control): add management-control methodology (RC-A..RC-E responsibility centers)
- `ab623a19` chore(opencode): remove obsolete per-project opencode config (global config supersedes)