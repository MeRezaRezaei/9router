import createOpenAIEmbeddingAdapter from "./openai.js";
import gemini from "./gemini.js";
import ollamaLocal from "./ollama-local.js";

function parseModel(model) {
  const parts = model.split("/");
  if (parts.length < 3) return null;
  return {
    remoteProvider: parts[0],
    mode: parts[1],
    actualModel: parts.slice(2).join("/"),
  };
}

function getWriteAdapter(remoteProvider) {
  if (remoteProvider === "gemini" || remoteProvider === "google_ai_studio") return gemini;
  return createOpenAIEmbeddingAdapter(remoteProvider);
}

const hybrid = {
  buildUrl: (model, creds, ctx) => {
    const parsed = parseModel(model);
    if (!parsed) throw new Error(`Invalid hybrid model: ${model}`);

    if (parsed.mode === "read") {
      return ollamaLocal.buildUrl(parsed.actualModel, creds, ctx);
    } else {
      const adapter = getWriteAdapter(parsed.remoteProvider);
      return adapter.buildUrl(parsed.actualModel, creds, ctx);
    }
  },

  buildHeaders: (creds, ctx, model) => {
    const parsed = parseModel(model);
    if (!parsed) throw new Error(`Invalid hybrid model: ${model}`);

    if (parsed.mode === "read") {
      // ollamaLocal.buildHeaders takes (creds, ctx)
      return ollamaLocal.buildHeaders(creds, ctx);
    } else {
      const adapter = getWriteAdapter(parsed.remoteProvider);
      // openai/gemini buildHeaders take (creds)
      // Check if adapter.buildHeaders expects ctx
      if (adapter.buildHeaders.length === 2) { // Assuming 2 args for (creds, ctx)
        return adapter.buildHeaders(creds, ctx);
      } else { // Assuming 1 arg for (creds)
        return adapter.buildHeaders(creds);
      }
    }
  },

  buildBody: (model, params) => {
    const parsed = parseModel(model);
    if (!parsed) throw new Error(`Invalid hybrid model: ${model}`);

    if (parsed.mode === "read") {
      return ollamaLocal.buildBody(parsed.actualModel, params);
    } else {
      const adapter = getWriteAdapter(parsed.remoteProvider);
      return adapter.buildBody(parsed.actualModel, params);
    }
  },

  normalize: (responseBody, model) => {
    const parsed = parseModel(model);
    if (!parsed) throw new Error(`Invalid hybrid model: ${model}`);

    if (parsed.mode === "read") {
      return ollamaLocal.normalize(responseBody, parsed.actualModel);
    } else {
      const adapter = getWriteAdapter(parsed.remoteProvider);
      return adapter.normalize(responseBody, parsed.actualModel);
    }
  },
};

export default hybrid;
