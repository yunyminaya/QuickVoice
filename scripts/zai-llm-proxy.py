#!/usr/bin/env python3
"""Proxy OpenAI-compatible -> z.ai Anthropic (GLM).

Traduce POST /v1/chat/completions (formato OpenAI) a
api.z.ai/api/anthropic/v1/messages (formato Anthropic).
"""
import json
import os
import asyncio
import random

import httpx
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse

app = FastAPI()

ZAI_URL = "https://api.z.ai/api/anthropic/v1/messages"
ZAI_KEY = os.getenv("ZAI_ANTHROPIC_KEY", "").strip()
DEFAULT_MODEL = "glm-5.2"
MAX_CONCURRENCY = max(1, int(os.getenv("ZAI_MAX_CONCURRENCY", "2")))
RETRY_ATTEMPTS = max(1, int(os.getenv("ZAI_RETRY_ATTEMPTS", "3")))
REQUEST_GATE = asyncio.Semaphore(MAX_CONCURRENCY)


def _to_anthropic_messages(messages: list) -> list:
    """Convierte mensajes OpenAI a Anthropic, fusionando roles consecutivos."""
    out = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            # Anthropic usa system por separado; lo inyectamos como user con etiqueta
            role = "user"
            content = f"[System instructions]\n{content}"
        if out and out[-1]["role"] == role:
            out[-1]["content"] += "\n" + content
        else:
            out.append({"role": role, "content": content})
    return out


@app.post("/v1/chat/completions")
async def chat_completions(req: Request):
    try:
        body = await req.json()
    except Exception:
        return Response(status_code=400, content=b"invalid json")

    model = body.get("model") or DEFAULT_MODEL
    messages = _to_anthropic_messages(body.get("messages", []))
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    messages = [m for m in messages if m["role"] != "system"]

    # GLM-5.2 SIEMPRE genera un bloque "thinking" (~1300-1500 tokens) aunque
    # se pida thinking:disabled. Si max_tokens es pequeno, gasta todo en
    # pensar y devuelve TEXTO VACIO -> el agente "no responde".
    # Forzar un minimo alto para que siempre sobre presupuesto para el texto.
    max_tokens = max(int(body.get("max_tokens", 1024)), 2500)
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "thinking": {"type": "disabled"},
        "messages": messages,
    }
    if system_parts:
        payload["system"] = "\n".join(system_parts)

    try:
        async with REQUEST_GATE:
            async with httpx.AsyncClient(timeout=120) as client:
                for attempt in range(RETRY_ATTEMPTS):
                    resp = await client.post(
                        ZAI_URL,
                        headers={
                            "x-api-key": ZAI_KEY,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json=payload,
                    )
                    if resp.status_code != 429 or attempt == RETRY_ATTEMPTS - 1:
                        break
                    retry_after = resp.headers.get("retry-after")
                    try:
                        delay = float(retry_after) if retry_after else 2 ** attempt
                    except ValueError:
                        delay = 2 ** attempt
                    await asyncio.sleep(min(10.0, max(0.5, delay) + random.random() * 0.25))
                data = resp.json()
    except Exception as exc:
        return Response(
            status_code=502,
            content=json.dumps({"error": {"message": str(exc)}}).encode(),
        )

    if resp.status_code != 200:
        return Response(
            status_code=resp.status_code,
            content=json.dumps(data).encode(),
        )

    # Anthropic -> OpenAI (defensivo: z.ai puede devolver content None,
    # bloques tool_use, o estructuras inesperadas cuando hay tools)
    content = data.get("content")
    if not isinstance(content, list):
        content = []
    text_parts = []
    tool_calls = []
    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            t = block.get("text")
            if t:
                text_parts.append(t)
        elif btype == "tool_use":
            name = block.get("name") or "tool"
            tool_input = block.get("input") or {}
            tool_calls.append(
                {
                    "id": block.get("id") or f"call_{len(tool_calls)}",
                    "type": "function",
                    "function": {"name": name, "arguments": json.dumps(tool_input)},
                }
            )
    text = "".join(text_parts)
    message = {"role": "assistant", "content": text or None}
    if tool_calls:
        message["tool_calls"] = tool_calls
    openai_resp = {
        "id": data.get("id", "chatcmpl-local"),
        "object": "chat.completion",
        "created": int(__import__("time").time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": data.get("stop_reason", "stop"),
            }
        ],
        "usage": data.get("usage", {}),
    }
    if body.get("stream"):
        async def event_stream():
            chunk_id = openai_resp["id"]
            created = openai_resp["created"]
            text = openai_resp["choices"][0]["message"].get("content") or ""
            tool_calls = openai_resp["choices"][0]["message"].get("tool_calls") or []
            first_delta = {"role": "assistant"}
            if tool_calls:
                first_delta["tool_calls"] = [
                    {"index": 0, "id": tc["id"], "type": "function",
                     "function": {"name": tc["function"]["name"], "arguments": ""}}
                    for tc in tool_calls
                ]
            first = {
                "id": chunk_id, "object": "chat.completion.chunk",
                "created": created, "model": model,
                "choices": [{"index": 0, "delta": first_delta, "finish_reason": None}],
            }
            yield "data: " + json.dumps(first) + "\n\n"
            if tool_calls:
                for tc in tool_calls:
                    yield "data: " + json.dumps({
                        "id": chunk_id, "object": "chat.completion.chunk",
                        "created": created, "model": model,
                        "choices": [{"index": 0, "delta": {"tool_calls": [
                            {"index": 0, "id": tc["id"], "function": {"name": None, "arguments": tc["function"]["arguments"]}}
                        ]}, "finish_reason": None}],
                    }) + "\n\n"
            if text:
                chunk = {
                    "id": chunk_id, "object": "chat.completion.chunk",
                    "created": created, "model": model,
                    "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}],
                }
                yield "data: " + json.dumps(chunk) + "\n\n"
            final = {
                "id": chunk_id, "object": "chat.completion.chunk",
                "created": created, "model": model,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            yield "data: " + json.dumps(final) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(event_stream(), media_type="text/event-stream")
    return Response(
        content=json.dumps(openai_resp).encode(),
        media_type="application/json",
    )


@app.get("/v1/models")
async def models():
    return Response(
        content=json.dumps({"object": "list", "data": [{"id": DEFAULT_MODEL, "object": "model"}]}).encode(),
        media_type="application/json",
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8890)
