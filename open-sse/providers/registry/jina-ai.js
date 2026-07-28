export default {
  id: "jina-ai",
  alias: "jina",
  display: {
    name: "Jina AI",
    icon: "blur_on",
    color: "#2563EB",
    textIcon: "JA",
    website: "https://jina.ai",
    notice: {
      text: "10M free tokens on signup (non-commercial), no credit card required.",
      apiKeyUrl: "https://jina.ai/?sui=apikey"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "embedding"
  ],
  embeddingConfig: {
    baseUrl: "https://api.jina.ai/v1/embeddings",
    authType: "apikey",
    authHeader: "bearer",
    models: [
      // v5 Omni (multimodal — text, image, video, audio)
      {
        id: "jina-embeddings-v5-omni-small",
        name: "Jina Embeddings v5 Omni Small",
        dimensions: 1024
      },
      {
        id: "jina-embeddings-v5-omni-nano",
        name: "Jina Embeddings v5 Omni Nano",
        dimensions: 768
      },
      // v5 Text
      {
        id: "jina-embeddings-v5-text-small",
        name: "Jina Embeddings v5 Text Small",
        dimensions: 1024
      },
      {
        id: "jina-embeddings-v5-text-nano",
        name: "Jina Embeddings v5 Text Nano",
        dimensions: 768
      },
      // v4 (multimodal — text, image)
      {
        id: "jina-embeddings-v4",
        name: "Jina Embeddings v4",
        dimensions: 2048
      },
      // v3 (text)
      {
        id: "jina-embeddings-v3",
        name: "Jina Embeddings v3",
        dimensions: 1024
      },
      // v2 Multilingual
      {
        id: "jina-embeddings-v2-base-en",
        name: "Jina Embeddings v2 Base EN",
        dimensions: 768
      },
      {
        id: "jina-embeddings-v2-base-de",
        name: "Jina Embeddings v2 Base DE",
        dimensions: 768
      },
      {
        id: "jina-embeddings-v2-base-es",
        name: "Jina Embeddings v2 Base ES",
        dimensions: 768
      },
      {
        id: "jina-embeddings-v2-base-zh",
        name: "Jina Embeddings v2 Base ZH",
        dimensions: 768
      },
      {
        id: "jina-embeddings-v2-base-code",
        name: "Jina Embeddings v2 Base Code",
        dimensions: 768
      },
      // CLIP (text + image)
      {
        id: "jina-clip-v2",
        name: "Jina CLIP v2",
        dimensions: 1024
      },
      {
        id: "jina-clip-v1",
        name: "Jina CLIP v1",
        dimensions: 768
      },
      // ColBERT (late interaction, multi-vector)
      {
        id: "jina-colbert-v2",
        name: "Jina ColBERT v2",
        dimensions: 128
      },
      // Code embeddings
      {
        id: "jina-code-embeddings-0.5b",
        name: "Jina Code Embeddings 0.5b",
        dimensions: 896
      },
      {
        id: "jina-code-embeddings-1.5b",
        name: "Jina Code Embeddings 1.5b",
        dimensions: 1536
      },
      // Legacy
      {
        id: "jina-embedding-b-en-v1",
        name: "Jina Embedding B EN v1",
        dimensions: 768
      }
    ]
  }
};
