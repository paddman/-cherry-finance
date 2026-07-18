# ADR-006: Model Gateway

**Status:** Accepted
**Date:** 2026-07-18

## Context

All model calls go through an internal OpenAI-compatible gateway (§5.1) that routes across local Qwen (vLLM/SGLang/Ollama), a vision model, and an optional hosted fallback, with per-task routing and full metering.

## Decision

- **Build a thin gateway service** (`services/model-gateway`), not a proxy product like LiteLLM, because routing decisions depend on CherryFin-specific policy (privacy class of the request, user preference, task type) that must be auditable.
- **Interface:** OpenAI-compatible `/v1/chat/completions` plus one custom header `x-cherryfin-task` (`chat | synthesis | vision | classify`) and `x-cherryfin-privacy` (`public | private`).
- **Routing table lives in config, not code:**

  | task | privacy | route |
  |---|---|---|
  | chat | any | local small Qwen |
  | classify | any | local small Qwen |
  | synthesis | public | strong local Qwen; hosted fallback if degraded |
  | synthesis | private | local only, no fallback |
  | vision | any | local VLM; refuse (degraded state) if down |

- **Metering:** every call logs `promptVersion`, model id, token counts, latency, and outcome to `tool_calls`-style records keyed by `traceId`.
- **Prompts are versioned files** in `packages/agent-core/prompts`, referenced by id+version, never inline strings.
- **Degradation contract:** if a route is down and no fallback is permitted, the gateway returns a typed `MODEL_UNAVAILABLE` error; the orchestrator queues the request and the client shows the degraded state (§10.3). The gateway never silently substitutes a lower-privacy route.

## Consequences

- Hosted-fallback API keys exist only inside the gateway's environment; the orchestrator and workers never hold provider credentials.
- Swapping vLLM for SGLang, or adding a new hosted provider, touches one service and one config file.
