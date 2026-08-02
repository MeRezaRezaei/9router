# THE PROTOCOL

Autonomous project management loop.

## Backlog & Execution
All execution flows must maintain project state in `.brain` trackers.
- Method: Stored in AI memory.
- State: Stored in git.

## Release Verification Methodology
Before any release:
- Execute complete test suite (`npx vitest run`).
- Validate module and alias resolution pathing (`@/*` vs relative pathing).
- Ensure mocked environments match code changes (Redis mock, Vault stubbing, SQLite database isolation).
- Verify dynamic model aggregation fallback edge cases and auto-switch capability detection logic.
