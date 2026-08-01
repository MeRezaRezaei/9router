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
   - **Redis**: Fast caching of dynamic routing configurations.
   - **Vault**: Secure storage for provider apiKeys/credentials.
   - **Audit Logs / Stats Stack**: Separate database for audit/trash logs with enhanced logging, and isolated runtime stack for stats.
