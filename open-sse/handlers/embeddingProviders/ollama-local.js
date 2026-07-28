import { resolveOllamaLocalHost } from '../../config/providers.js';

export default {
  buildUrl(model, creds, ctx) {
    const baseUrl = resolveOllamaLocalHost(creds);
    return `${baseUrl}/api/embed`;
  },

  buildHeaders(creds, ctx) {
    return { "Content-Type": "application/json" };
  },

  buildBody(model, { input, encoding_format, dimensions }) {
    // encoding_format and dimensions are ignored as Ollama's /api/embed does not support them
    return { model, input };
  },

  normalize(responseBody, model) {
    const data = [];
    if (Array.isArray(responseBody.embeddings)) {
      responseBody.embeddings.forEach((embedding, index) => {
        data.push({
          object: "embedding",
          index: index,
          embedding: embedding,
        });
      });
    }

    const promptTokens = responseBody.prompt_eval_count || 0;

    return {
      object: "list",
      data: data,
      model: model,
      usage: {
        prompt_tokens: promptTokens,
        total_tokens: promptTokens,
      },
    };
  },
};
