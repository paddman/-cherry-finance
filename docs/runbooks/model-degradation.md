# Model Degradation

## Symptoms

- local OpenAI-compatible endpoint returns errors or times out
- model latency exceeds the gateway timeout
- vision route is unavailable
- hosted provider fails or is rate-limited
- model response is invalid JSON or violates the expected contract

## Safety behavior

- `private` requests remain local-only and return `MODEL_UNAVAILABLE` if the local route fails.
- only `public` synthesis may use the configured hosted fallback.
- vision has no silent text-model substitution.
- calculations continue through deterministic tools where possible.
- current facts are not answered from stale model memory without explicit labeling.

## Operator steps

1. Check `/healthz` and route configuration on the model gateway.
2. Test the local upstream directly with synthetic content.
3. Inspect trace IDs, upstream status, timeout, route name, and model ID.
4. Reduce concurrency or queue new work rather than bypassing privacy policy.
5. Disable a failing hosted fallback if responses are malformed or provenance is uncertain.
6. Restore the route and replay only idempotent queued work.
