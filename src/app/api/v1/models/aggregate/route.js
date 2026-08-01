import { NextResponse } from "next/server";
import { getSettings, updateSettings, getProviderConnections, getMocData } from "@/lib/localDb";
import { parseModel } from "@/sse/services/model";
import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getProviderAlias } from "@/shared/constants/providers";
import { getModelInfo } from "@/sse/services/model";

export const dynamic = "force-dynamic";

// Standard prompt template to query mapping proposal from 9router itself or any default LLM
async function getAIMappingSuggestions(connections, mocDataList) {
  // Extract all models currently offered
  const allModels = [];
  for (const conn of connections) {
    const providerId = conn.provider;
    const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const outputAlias = (conn?.providerSpecificData?.prefix || getProviderAlias(providerId) || staticAlias).trim();
    const dynamicMoc = mocDataList[providerId] || mocDataList[staticAlias];
    const providerModels = dynamicMoc?.models?.length ? dynamicMoc.models : (PROVIDER_MODELS[staticAlias] || []);
    for (const m of providerModels) {
      allModels.push(`${outputAlias}/${m.id}`);
    }
  }

  // Construct standard rules for grouping
  const prompt = `You are a model aggregation assistant. Given the following list of active model IDs across different provider prefixes, identify duplicate or equivalent models that represent the exact same base model (e.g. DeepSeek-V3 or Claude-3.5-Sonnet) but are prefix-distinguished.
Output a JSON mapping from the original full model ID (the key) to a normalized canonical model name (the value), like:
{
  "zen/deepseek-chat": "deepseek-v3",
  "or/deepseek/deepseek-chat": "deepseek-v3"
}
Only output the JSON object, no wrapping markdown formatting or extra text.

Here is the list of models:
${JSON.stringify(allModels, null, 2)}
`;

  try {
    // Call our internal model handler to complete using the highest-priority configured model (or default)
    const { handleChat } = await import("@/sse/handlers/chat");
    const mockRequest = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "zen/deepseek-v4-flash-free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    
    // We can also execute it directly using the BaseExecutor / fetch or a fallback heuristic
    // For local resilience and speed, if the model completion fails, use a fallback local similarity clustering algorithm
    let result = {};
    try {
      const response = await fetch("http://127.0.0.1:20129/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "zen/deepseek-v4-flash-free",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      });
      if (response.ok) {
        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        if (content) {
          result = JSON.parse(content.trim().replace(/^```json/, "").replace(/```$/, ""));
        }
      }
    } catch (e) {
      console.log("LLM mapping recommendation failed, falling back to heuristic cluster:", e.message);
    }

    if (Object.keys(result).length === 0) {
      // Heuristic Fallback
      for (const id of allModels) {
        const parts = id.split("/");
        const nameOnly = parts.slice(1).join("/");
        const norm = nameOnly.toLowerCase()
          .replace(/^(google|openai|anthropic|meta|mistral|deepseek|cohere)\//, "")
          .replace(/^(zen|or|ag|gc|kc|cl|bpm|cf|gh|cc|cx)\//, "")
          .replace(/-(preview|latest|stable|v[0-9]|instruct|chat|online)$/g, "")
          .replace(/[^a-z0-9]/g, "");
        if (norm) {
          result[id] = norm;
        }
      }
    }

    return result;
  } catch (err) {
    console.error("AI aggregation optimizer error:", err);
    return {};
  }
}

export async function POST(request) {
  try {
    const connections = (await getProviderConnections()).filter(c => c.isActive !== false);
    const mocDataList = await getMocData();

    const proposal = await getAIMappingSuggestions(connections, mocDataList);

    // Save proposed map directly into settings
    const settings = await getSettings();
    const currentMap = settings.modelAggregationMap || {};
    const nextMap = { ...currentMap, ...proposal };

    await updateSettings({
      modelAggregationMap: nextMap,
      modelAggregationEnabled: true,
    });

    return NextResponse.json({ success: true, proposed: proposal, currentMap: nextMap });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
