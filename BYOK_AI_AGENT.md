# Bring Your Own Key (BYOK) AI Agent – Server Integration Plan

This document outlines how an OpenAI-backed AI module can be added to the server, and where to place a GPL-3.0 open-source implementation.

## Goals
- Provide self-hosted BYOK AI endpoints for generation (`/api/ai/generate` + `/api/ai/generate/stream`) and question-answering over indexed content (`/api/ai/ask`).
- Keep the main server core unchanged; ship the AI module as an add-on.
- Allow operators to choose OpenAI (or drop-in compatible) via environment variables (`AI_DRIVER=openai`, `OPENAI_API_KEY`, `AI_COMPLETION_MODEL`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSION`).

## Where to place the GPL-3.0 module (requested path: core/ai)
- Place the module in the core tree (not under `ee`):
  - `docmost/apps/server/src/core/ai/ai.module.ts`
  - `docmost/apps/server/src/core/ai/ai.controller.ts`
  - `docmost/apps/server/src/core/ai/ai.service.ts`
  - `docmost/apps/server/src/core/ai/openai/openai.service.ts`
  - `docmost/apps/server/src/core/ai/ai-search.service.ts`
  - `docmost/apps/server/src/core/ai/types/*.ts`
  - `docmost/apps/server/src/core/ai/templates/*.ts` (prompts/system messages)
  - `docmost/apps/server/src/core/ai/utils/*.ts` (chunking, SSE helpers)
- If we want the GPL module to be a separately publishable package, place it under `docmost/packages/ai-agent-openai/` and import it from `src/core/ai/`. This keeps licensing isolated while allowing consumption from the server app.

## Server module design (OpenAI path)

### Module wiring
- `AiModule` (in `src/core/ai/ai.module.ts`) registers:
  - `AiController` (routes)
  - `AiService` (dispatch by driver)
  - `OpenAiService` (OpenAI-specific implementation)
  - `AiSearchService` (retrieval + synthesis over page embeddings)
  - Providers for HTTP client with base URL and auth header from `EnvironmentService`.
- Loaded directly in `core/core.module.ts` or `app.module.ts` (no `ee` indirection since we are in core).

### Routes (NestJS-style)
- `POST /api/ai/generate` — one-shot completion
- `POST /api/ai/generate/stream` — SSE/streaming completion
- `POST /api/ai/ask` — RAG-style answer; streams tokens plus source metadata

### Configuration (uses existing getters)
- `AI_DRIVER=openai`
- `AI_COMPLETION_MODEL` (e.g., `gpt-4.1`, `gpt-4o-mini`)
- `AI_EMBEDDING_MODEL` (e.g., `text-embedding-3-small`)
- `AI_EMBEDDING_DIMENSION` (must match the chosen embedding model; validated already)
- `AI_MODULE_FLAVOR` (`oss` default, `enterprise` to load the enterprise AI module)
- `OPENAI_API_KEY`, `OPENAI_API_URL` (optional override, default `https://api.openai.com/v1`)

### OpenAI client usage
- Completion: POST `https://api.openai.com/v1/chat/completions`
- Embedding: POST `https://api.openai.com/v1/embeddings`
- Headers: `Authorization: Bearer <OPENAI_API_KEY>`, `Content-Type: application/json`
- Stream handling: use fetch/axios with `response.body.getReader()` and forward chunks as `data: { ... }` lines until `[DONE]`.

### Embeddings + search flow
- On page create/update/delete, existing queue jobs (`PAGE_CREATED`, `PAGE_CONTENT_UPDATED`, etc.) should enqueue embedding generation/removal into `AI_QUEUE`.
- `AiSearchService` pulls chunked embeddings from `page_embeddings` (pgvector) and performs vector similarity; fetches top-N, then calls completion with retrieved context to synthesize the answer (include `sources` metadata in the streamed payload).

### Error handling
- If `AI_DRIVER` is not set or required env vars are missing, return 400 with a clear message.
- Timeouts and provider errors should be surfaced as SSE error events on streaming endpoints.

## Filepath summary
- Module entry: `docmost/apps/server/src/core/ai/ai.module.ts`
- Controller: `docmost/apps/server/src/core/ai/ai.controller.ts`
- Core service: `docmost/apps/server/src/core/ai/ai.service.ts`
- OpenAI driver: `docmost/apps/server/src/core/ai/openai/openai.service.ts`
- Search/RAG: `docmost/apps/server/src/core/ai/ai-search.service.ts`
- DTOs/types: `docmost/apps/server/src/core/ai/types/*.ts`
- Utils (streaming/SSE/helpers): `docmost/apps/server/src/core/ai/utils/*.ts`
- Optional standalone package (if publishing GPL separately): `docmost/packages/ai-agent-openai/` with its own `README`, license header, and compiled exports consumed by `src/core/ai/`.

## Next steps
- Scaffold the `core/ai` module with the above structure.
- Add loading in `core/core.module.ts` or `app.module.ts`.
- Implement `/api/ai/generate`, `/api/ai/generate/stream`, `/api/ai/ask` using the OpenAI driver and `EnvironmentService` getters (`getAiCompletionModel`, `getOpenAiApiKey`, `getOpenAiApiUrl`).
- Wire queue processors for embedding jobs to populate `page_embeddings`.

