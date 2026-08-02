# 9Router Control System

Applied methodology: management-control-protocol (Mem skill skill_c914f42897cf). Control = closing the plan-vs-reality gap, NOT blaming. For each responsibility center: measurable output, indicators (max 7-10), key variables (leading), cadence, thresholds, feedback/feedforward.

## RC-A · Model routing & aggregation (src/app/router, src/lib/headroom)
- Output: per-request model decision + RTK saved
- Indicators: RTK saved/request, fallback rate, decision latency p95, model utilization %, cost/1M tokens by route
- Key vars (leading): provider health score, queue depth, cache hit ratio forecast
- Cadence: daily (latency/fallback), weekly (RTK/cost mix), monthly (provider mix strategy)
- Thresholds: fallback rate > 5% → escalate; latency p95 > 2s → route tuning
- Feedforward: when provider health dips, pre-move traffic before failure

## RC-B · Provider connections & credentials (src/lib/auth, oauth, network, vault)
- Output: providers usable without auth failures
- Indicators: auth failure rate, credential expiry count, connection uptime %, rate-limit hits/1k requests
- Key vars: token TTLs, provider-side quotas, OAuth refresh failures
- Cadence: daily auto-check + weekly report
- Thresholds: refresh failure > 2/day → alert; credential < 7d to expiry → rotate
- Control aligns with reward: don't measure connection count, measure healthy connections

## RC-C · Cache & usage records (src/app/redis, src/app/sqlite, usageRepo)
- Output: tokens served from cache + complete usage ledger
- Indicators: cache hit %, cache staleness, DB write latency, usage record completeness (missing rows = 0)
- Key vars: cache churn, retention drift
- Cadence: weekly; monthly ledger reconciliation
- Thresholds: hit < 60% → tune TTL; missing records > 0.1% → fix pipeline

## RC-D · Gateway & MITM (proxy.js, src/mitm)
- Output: all tool traffic proxied intact
- Indicators: proxy uptime %, TLS/DNS errors, handshake latency, bytes through
- Key vars: cert expiry (always < 30d), DNS resolution failures
- Cadence: daily
- Thresholds: uptime < 99.5% → incident; cert < 30d → renew now

## RC-E · Cost & observability (usageRepo, dashboard)
- Output: monthly cost + token burn report each period end
- Indicators: $/month by provider, tokens/active user, $/RTK-saved, forecast vs actual
- Key vars: new provider pricing changes, user activity growth
- Cadence: monthly report; weekly preview
- Rule: report thresholds preset; never rely on claims — pull from usageRepo

## Global rules
1. Indicators capped at 7-10 per center; precision only where it changes a decision
2. Gap analysis first on plan/process, never person
3. Delegation with missing data is suicide — RC-B/D data precedes RC-A changes
4. Goal: self-controlling — alerts auto-remediate where possible (auto provider failover already exists = effector)
