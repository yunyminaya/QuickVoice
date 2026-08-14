# LiveKit Server self-hosted

Infraestructura de telefonía gratuita para QuickVoice. LiveKit conecta las
llamadas telefónicas (Twilio/Telnyx) con el agente de voz (`apps/ai`).

## Requisitos

- Docker + Docker Compose
- Redis corriendo en `127.0.0.1:6379` (QuickVoice ya usa el contenedor `quickvoice-dev-redis`)

## Instalación

```bash
cd deploy/livekit

# 1. Genera tus claves API
API_KEY=$(openssl rand -hex 16)
API_SECRET=$(openssl rand -hex 32)
echo "API_KEY=$API_KEY"
echo "API_SECRET=$API_SECRET"

# 2. Crea la config con tus claves
cp config.example.yaml config.yaml
# Edita config.yaml y pon en keys:
#   TU_API_KEY: TU_API_SECRET

# 3. Arranca
docker compose up -d
```

## Verificación

```bash
curl http://localhost:7880/   # → OK
docker logs livekit          # → "starting LiveKit server"
```

## Conexión con QuickVoice

En `apps/server/.env`:

```env
LIVEKIT_URL=ws://TU_SERVIDOR:7880
LIVEKIT_API_KEY=TU_API_KEY
LIVEKIT_API_SECRET=TU_API_SECRET
LIVEKIT_SIP_INBOUND_TRUNK_ID=<tu trunk de entrada>
LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID=<tu trunk de salida Twilio>
LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID=<tu trunk de salida Telnyx>
```

> **Seguridad:** `config.yaml` (con claves reales) y `.env` están en
> `.gitignore` — nunca se suben al repositorio.

## Puertos

| Puerto | Uso |
|--------|-----|
| 7880 | WebSocket/API (QuickVoice se conecta aquí) |
| 7881 | RTC TCP |
| 50000-50100 | Rango ICE/UDP para audio |
