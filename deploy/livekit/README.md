# LiveKit self-hosted

Infraestructura de telefonía para QuickVoice. LiveKit conecta las llamadas
telefónicas de Twilio con el agente de voz (`apps/ai`).

## Componentes

| Servicio      | Imagen         | Rol                                                     |
| ------------- | -------------- | ------------------------------------------------------- |
| `livekit`     | livekit-server | WebRTC — el agente de voz se conecta aquí (puerto 7880) |
| `livekit-sip` | livekit/sip    | SIP — puente entre Twilio y LiveKit (puerto 5060)       |
| `redis`       | redis:7        | Cola compartida para LiveKit y SIP                      |

## Instalación

```bash
cd deploy/livekit
cp config.example.yaml config.yaml
cp sip-config.example.yaml sip-config.yaml
# Edita ambos archivos con las mismas claves API de LiveKit.
docker compose up -d
```

## Verificación

```bash
curl http://localhost:7880/        # → OK (LiveKit)
ss -tlnp | grep 5060               # → LISTEN (SIP)
docker logs livekit-sip            # → señalización SIP activa
```

## Trunk saliente de Twilio

La provisión es idempotente: reutiliza el trunk `quickvoice-outbound-twilio`
si ya existe, actualiza su número y escribe únicamente el ID en
`apps/server/.env`. No sube secretos al repositorio y no crea trunks Telnyx.

El hostname debe ser el dominio de terminación SIP de Twilio (`*.pstn.twilio.com`),
no `sip.twilio.com`. Define estas variables solo en el `.env` local:

```env
LIVEKIT_URL=ws://TU_SERVIDOR:7880
LIVEKIT_API_KEY=TU_API_KEY
LIVEKIT_API_SECRET=TU_API_SECRET
LIVEKIT_SIP_OUTBOUND_TWILIO_NUMBER=+1XXXXXXXXXX
TWILIO_SIP_TERMINATION_URI=TU_TRUNK.pstn.twilio.com
LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID=ST_xxx
```

`TWILIO_SIP_USERNAME` y `TWILIO_SIP_PASSWORD` solo son necesarios cuando el
script debe crear un trunk nuevo. Deben ser credenciales de la Credential List
SIP de Twilio, no el token de la API de la cuenta.

Desde la raíz del repositorio:

```bash
pnpm exec tsx deploy/livekit/scripts/provision-trunks.ts
```

Después reinicia el backend de QuickVoice para cargar el ID actualizado:

```bash
sudo systemctl restart quickvoice-server.service
```

## Conexión con QuickVoice

En `apps/server/.env` también se configuran las claves de LiveKit y, si se
usa telefonía entrante, `LIVEKIT_SIP_INBOUND_TRUNK_ID`. El backend selecciona
el trunk saliente Twilio mediante `LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID`.

> **Seguridad:** `config.yaml`, `sip-config.yaml` y `.env` con claves reales
> están en `.gitignore`; nunca se suben al repositorio.

## Puertos

| Puerto      | Uso                      |
| ----------- | ------------------------ |
| 7880        | WebSocket/API de LiveKit |
| 7881        | RTC TCP                  |
| 5060        | SIP                      |
| 50000-50100 | ICE/UDP para audio       |
| 6379        | Redis                    |
