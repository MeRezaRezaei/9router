// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes, getSettings } from "@/lib/localDb";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";
import REGISTRY from "open-sse/providers/registry/index.js";

// Local provider alias overrides (HMR-friendly, applied on top of open-sse map)
const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

const RESERVED_PROVIDER_PREFIXES = new Set(Object.keys(LOCAL_PROVIDER_ALIASES));
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);
  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Resolve aggregated model to the best provider/model based on config, priorities or similarity mappings
 */
async function resolveAggregatedModel(modelStr) {
  try {
    const s = await getSettings();
    if (s.modelAggregationEnabled !== true) return null;
    
    // modelStr is e.g. "aggregated/gpt-4o" or just "gpt-4o" if parsed as alias
    const normalizedName = modelStr.replace(/^aggregated\//, "").toLowerCase().replace(/[^a-z0-9]/g, "");

    // Look up the active connections, find providers that offer this normalized model name
    const { getProviderConnections } = await import("@/lib/localDb");
    const connections = (await getProviderConnections()).filter(c => c.isActive !== false);

    // Simple matching of available model names under each provider
    const { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } = await import("@/shared/constants/models");
    const { getProviderAlias } = await import("@/shared/constants/providers");
    const { getMocData } = await import("@/lib/localDb");
    const mocDataList = await getMocData();

    const candidates = [];
    const customMap = s.modelAggregationMap || {};

    for (const conn of connections) {
      const providerId = conn.provider;
      const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
      const outputAlias = (
        conn?.providerSpecificData?.prefix
        || getProviderAlias(providerId)
        || staticAlias
      ).trim();

      const dynamicMoc = mocDataList[providerId] || mocDataList[staticAlias];
      const providerModels = dynamicMoc?.models?.length
        ? dynamicMoc.models
        : (PROVIDER_MODELS[staticAlias] || []);

      for (const m of providerModels) {
        const fullId = `${outputAlias}/${m.id}`;
        
        let norm = m.id.toLowerCase()
          .replace(/^(google|openai|anthropic|meta|mistral|deepseek|cohere)\//, "")
          .replace(/^(zen|or|ag|gc|kc|cl|bpm|cf|gh|cc|cx)\//, "")
          .replace(/-(preview|latest|stable|v[0-9]|instruct|chat|online)$/g, "")
          .replace(/[^a-z0-9]/g, "");

        let targetNorm = normalizedName;

        if (customMap[fullId]) {
          norm = customMap[fullId].toLowerCase().replace(/[^a-z0-9]/g, "");
        } else if (customMap[m.id]) {
          norm = customMap[m.id].toLowerCase().replace(/[^a-z0-9]/g, "");
        } else {
          // Check if there is an inverse mapping in customMap (e.g. mapping "deepseek-chat" to "deepseek-v3")
          // Let's support mapping original names/IDs to a canonical name.
          for (const [orig, canonical] of Object.entries(customMap)) {
            const origNorm = orig.toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanId = m.id.replace(/^(google|openai|anthropic|meta|mistral|deepseek|cohere)\//, "");
            if (origNorm === m.id.toLowerCase().replace(/[^a-z0-9]/g, "") || 
                origNorm === cleanId.toLowerCase().replace(/[^a-z0-9]/g, "") ||
                origNorm === fullId.toLowerCase().replace(/[^a-z0-9]/g, "")) {
              norm = canonical.toLowerCase().replace(/[^a-z0-9]/g, "");
              break;
            }
          }
        }

        if (norm === targetNorm) {
          candidates.push({
            provider: providerId,
            model: m.id,
            priority: conn.priority || 999,
          });
        }
      }
    }

    if (candidates.length > 0) {
      // Sort by connection priority (lowest first)
      candidates.sort((a, b) => a.priority - b.priority);
      return candidates[0];
    }
  } catch (e) {
    console.error("Failed resolving aggregated model:", e);
  }
  return null;
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr) {
  // Check if it's an aggregated model first
  if (modelStr.startsWith("aggregated/") || !modelStr.includes("/")) {
    const resolvedAgg = await resolveAggregatedModel(modelStr);
    if (resolvedAgg) return resolvedAgg;
  }

  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    // Provider-node prefixes are user-defined. They must not override built-in
    // provider ids/aliases such as `cf`, `cloudflare-ai`, `openai`, or `hf`.
    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
      const matchedOpenAI = openaiNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedOpenAI) {
        return { provider: matchedOpenAI.id, model: parsed.model };
      }

      const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
      const matchedAnthropic = anthropicNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedAnthropic) {
        return { provider: matchedAnthropic.id, model: parsed.model };
      }

      const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
      const matchedEmbedding = embeddingNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedEmbedding) {
        return { provider: matchedEmbedding.id, model: parsed.model };
      }
    }
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name before resolving as alias
  // This prevents combo names from being incorrectly routed to providers
  const combo = await getComboByName(parsed.model);
  if (combo) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  return getModelInfoCore(modelStr, getModelAliases);
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr) {
  // Only check if it's not in provider/model format
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}
