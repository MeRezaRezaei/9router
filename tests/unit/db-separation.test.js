import { describe, it, expect, vi } from "vitest";

// Vitest needs path alias resolution or we must mock it or configure vitest aliases.
// Since vitest config isn't fully configured with @/ in ESM without next support,
// we can stub/mock module import matching '@/lib/dataDir.js' or paths.js directly.
// Let's mock "@/lib/dataDir.js"
vi.mock("@/lib/dataDir.js", () => ({
  DATA_DIR: "/tmp/fake-data-dir",
}));

// Mock the paths/files to use memory or temporary file paths
vi.mock("../../src/lib/db/paths.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    DATA_FILE: ":memory:",
    LOGS_FILE: ":memory:",
    ensureDirs: vi.fn(),
  };
});

// Import driver to test isolation and adapters
import { getAdapter, getLogsAdapter } from "../../src/lib/db/driver.js";

describe("Logs and Stats Database separation", () => {
  it("uses separate files/locations for main and logs adapters", async () => {
    const mainAdapter = await getAdapter();
    const logsAdapter = await getLogsAdapter();

    expect(mainAdapter).toBeDefined();
    expect(logsAdapter).toBeDefined();
    expect(mainAdapter).not.toBe(logsAdapter);
  });

  it("ensures main tables are only in main DB and log tables only in logs DB", async () => {
    const mainAdapter = await getAdapter();
    const logsAdapter = await getLogsAdapter();

    // Check tables in main adapter
    const mainTables = mainAdapter.all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
    // Check tables in logs adapter
    const logsTables = logsAdapter.all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);

    // providerConnections should only be in main adapter
    expect(mainTables).toContain("providerConnections");
    expect(logsTables).not.toContain("providerConnections");

    // usageHistory should only be in logs adapter
    expect(logsTables).toContain("usageHistory");
    expect(mainTables).not.toContain("usageHistory");
  });
});
