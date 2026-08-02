import { describe, it, expect, vi } from "vitest";

// The import path is relative to the test file location:
// open-sse/services/combo.js imports from '../providers/capabilities.js' -> which is open-sse/providers/capabilities.js
// So we must mock "../providers/capabilities.js" relative to open-sse/services/combo.js,
// which in Vitest mock resolution needs to match the exact string the source file imports,
// or we mock the module using the path relative to the test file.
// Wait, the combo.js file imports from `../providers/capabilities.js`.
// Let's check how Vitest handles this mock.
// We can mock "../providers/capabilities.js" since combo.js resolves it relative to its directory.
// Actually, let's mock the exact path used in combo.js or absolute-ish path.
// Let's use vi.mock representing the target path!

vi.mock("../../open-sse/providers/capabilities.js", () => ({
  getCapabilitiesForModel: vi.fn((provider, model) => {
    if (model.includes("search")) {
      return { search: true, vision: false };
    }
    if (model.includes("vision")) {
      return { search: false, vision: true };
    }
    return { search: false, vision: false };
  }),
}));

import { detectRequiredCapabilities, reorderByCapabilities } from "../../open-sse/services/combo.js";

describe("auto-switch web_search capability detection", () => {
  it("detects search capability from tools array", () => {
    const body = {
      messages: [{ role: "user", content: "hello" }],
      tools: [{ type: "web_search" }],
    };
    const caps = detectRequiredCapabilities(body);
    expect(caps.has("search")).toBe(true);
    expect(caps.has("vision")).toBe(false);
  });

  it("detects vision capability from image block in content", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image_url", image_url: { url: "data:..." } },
          ],
        },
      ],
    };
    const caps = detectRequiredCapabilities(body);
    expect(caps.has("vision")).toBe(true);
    expect(caps.has("search")).toBe(false);
  });

  it("reorders models based on required capabilities", () => {
    const models = ["provider/normal-model", "provider/search-model", "provider/vision-model"];
    const required = new Set(["search"]);
    const reordered = reorderByCapabilities(models, required);
    // search-model should come first
    expect(reordered[0]).toBe("provider/search-model");
  });
});
