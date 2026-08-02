# Project Context & Vision

## Overview
9Router: Free AI Router & Token Saver.

## Core Vision
1. **Mock Data (MOC) & Testing Isolation**:
   - Separate request routing for local vs remote.
   - Run MITM proxy inside isolated IP to bypass main server 443 requests.
   - Maintain static/semi-static MOC files per provider for local testing.

2. **Automated & Crowdsourced MOC Upkeeps**:
   - Auto-update provider models, pricing, and transport configurations.
   - Expose endpoints to receive provider API schemas directly from active users.
   - Fast change detection using GitHub update versions.
   - AI explorer analyzes drift, suggests fixes, owner publishes schema version.

3. **Infrastructure Hardenings**:
   - **Redis Cache & Write-Through Observer**: Fast caching of configurations.
   - **Vault & SQL Key-Value Security**: Sensitive credentials stored in Vault; SQLite DB points to Vault UUIDs.
   - **Audit Logs / Stats Stack**: Separate database for audit/trash logs and isolated runtime stack for stats.

4. **Aggregation, Normalization & AI Mapping**:
   - **Model Aggregation**: Aggregates identical models offered by different providers under a single profile.
   - **API Key & Provider Sync**: Fixes failures with free providers by allowing key insertion.
   - **AI-Powered Mapping Engine**: AI models propose best mapping/grouping for aggregated models.

## Security & Operational Boundaries
- **Memory Firewall Boundary**: Shared AI Memory stores ONLY methodology (procedures, mindsets, doctrines). Project-specific dynamic context (backlogs, decisions, events) must live inside this `.brain/` directory and version-controlled via git.
