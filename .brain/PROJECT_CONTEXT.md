# Project Context & Vision

## Overview
9Router: Free AI Router & Token Saver.

## Core Vision
1. **Mock Data (MOC) & Testing Isolation**:
   - Separate request routing for local vs remote.
   - Run MITM proxy inside isolated IP to bypass main server 443 requests (which fail/are blocked in restricted environments).
   - Maintain static/semi-static MOC files per provider for local testing and validation.

2. **Automated & Crowdsourced MOC Upkeeps**:
   - Auto-update provider models, pricing, and transport configurations.
   - Expose endpoints to receive provider API schemas directly from active users to update local MOC files.
   - Fast change detection using GitHub update versions.
   - If an unexpected API shape is detected, notify 9router server. An AI explorer analyzes the drift, suggests fixes, and the owner publishes a new schema version.

3. **Infrastructure Hardenings**:
   - **Redis Cache & Write-Through Observer**: Fast caching of dynamic routing configurations, provider connections, and settings. Real-time usage tracking/logs streaming via Redis. Observers invalidate or update Redis on any data modifications.
   - **Vault & SQL Key-Value Security**: Sensitive data (apiKey, accessToken, refreshToken, idToken) is stored in Vault (KV engine). SQL database (`providerConnections` table) stores only the UUID metadata pointing to the Vault secrets. Data is loaded from SQL and enriched from Vault on demand, then cached in Redis for fast access.
   - **Audit Logs / Stats Stack**: Separate database for audit/trash logs with enhanced logging, and isolated runtime stack for stats.

4. **Aggregation, Normalization & AI Mapping**:
   - **Model Aggregation**: Aggregates identical models offered by different providers (e.g. DeepSeek via OpenRouter, DeepSeek direct, and Zen DeepSeek) under a single consolidated model profile for the end user.
   - **API Key & Provider Sync**: Fixes failures with free providers (which lack API keys in 9router but crash on sync) by allowing key insertion and enriching the data structures for send, receive, and offers.
   - **AI-Powered Mapping Engine**: Adds a button to trigger an AI model to find and propose the best mapping/grouping for aggregated models that are not easily mapped by standard similarity heuristics.
