# LiveKit self-hosted

Infraestructura de telefonía gratuita para QuickVoice. LiveKit conecta las
llamadas telefónicas (Twilio/Telnyx) con el agente de voz (`apps/ai`).

## Componentes

| Servicio | Imagen | Rol |
|----------|--------|-----|
| `livekit` | livekit-server | WebRTC — el agente de voz se conecta aquí (puerto 7880) |
| `livekit-sip` | livekit/sip | SIP — puente entre Twilio/Telnyx y LiveKit (puerto 5060) |
| `redis` | redis:7 | Cola compartida para LiveKit y SIP |

## Requisitos

- Docker + Docker Compose

## Instalación

```bash
cd deploy/livekit

# 1. Genera tus claves API
API_KEY=$(openssl rand -hex 16)
API_SECRET=$(openssl rand -hex 32)
echo "API_KEY=$API_KEY"
echo "API_SECRET=$API_SECRET"

# 2. Crea las configs con tus claves
cp config.example.yaml config.yaml       # edita keys: TU_API_KEY: TU_API_SECRET
cp sip-config.example.yaml sip-config.yaml  # edita api_key / api_secret

# 3. Arranca (LiveKit + SIP + Redis)
docker compose up -d
```

## Verificación

```bash
curl http://localhost:7880/        # → OK (LiveKit)
ss -tlnp | grep 5060               # → LISTEN (SIP)
docker logs livekit-sip | tail     # → "sip signaling listening on ... port 5060"
```

## Provisionar trunks SIP (una vez)

Los trunks conectan tu número de teléfono con el agente. Ejecuta desde
`apps/server` (tiene las dependencias):

```bash
npx tsx scripts/provision-trunks.ts
```

Esto crea: 1 inbound trunk + 1 outbound trunk Twilio + 1 outbound trunk Telnyx,
y actualiza las variables `LIVEKIT_SIP_*` del `.env`.

## Conexión con QuickVoice

En `apps/server/.env`:

```env
LIVEKIT_URL=ws://TU_SERVIDOR:7880
LIVEKIT_API_KEY=TU_API_KEY
LIVEKIT_API_SECRET=TU_API_SECRET
LIVEKIT_SIP_INBOUND_TRUNK_ID=ST_xxx
LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID=ST_xxx
LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID=ST_xxx
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
```

> **Seguridad:** `config.yaml`, `sip-config.yaml` y `.env` (con claves reales)
> están en `.gitignore` — nunca se suben al repositorio.

## Puertos

| Puerto | Uso |
|--------|-----|
| 7880 | WebSocket/API (QuickVoice se conecta aquí) |
| 7881 | RTC TCP |
| 5060 | SIP (Twilio/Telnyx envían llamadas aquí) |
| 50000-50100 | Rango ICE/UDP para audio |
| 6379 | Redis (interno) |
