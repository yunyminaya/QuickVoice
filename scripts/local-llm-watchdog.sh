#!/usr/bin/env bash
set -euo pipefail

proxy_url="${LOCAL_LLM_PROXY_HEALTH_URL:-http://127.0.0.1:8892/v1/models}"
model_url="${LOCAL_LLM_MODEL_HEALTH_URL:-http://127.0.0.1:8893/health}"
fallback_url="${LOCAL_LLM_FALLBACK_HEALTH_URL:-http://127.0.0.1:8890/v1/models}"
timeout_seconds="${LOCAL_LLM_WATCHDOG_TIMEOUT_SECONDS:-3}"

# Health endpoints remain responsive while a voice completion is running. A
# completion probe can queue behind the single local inference slot and cause
# a false failure that restarts the model in the middle of a phone call.
proxy_ok=false
model_ok=false
fallback_ok=false
curl --fail --silent --max-time "$timeout_seconds" --output /dev/null "$proxy_url" && proxy_ok=true
curl --fail --silent --max-time "$timeout_seconds" --output /dev/null "$model_url" && model_ok=true
curl --fail --silent --max-time "$timeout_seconds" --output /dev/null "$fallback_url" && fallback_ok=true

if $proxy_ok && $model_ok && $fallback_ok; then
  exit 0
fi

if ! $model_ok; then
  logger -t quickvoice-llm-watchdog 'Local model health endpoint failed; restarting model service'
  systemctl restart lfm2-local-llm.service
fi
if ! $proxy_ok; then
  logger -t quickvoice-llm-watchdog 'Local proxy health endpoint failed; restarting proxy service'
  systemctl restart cactus-llm-proxy.service
fi
if ! $fallback_ok; then
  logger -t quickvoice-llm-watchdog 'Fallback proxy health endpoint failed; restarting fallback service'
  systemctl restart zai-llm-proxy.service
fi
