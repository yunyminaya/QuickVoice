// Provisiona los SIP trunks en LiveKit y actualiza el .env de QuickVoice
// v3: idempotente - usa trunks existentes si ya estan creados
import { SipClient } from "livekit-server-sdk";
import fs from "fs";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(path, "utf-8").split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#") || !l.includes("=")) continue;
    const i = l.indexOf("=");
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}

const lkEnv = loadEnv("/home/yuny/livekit/.env");
const qvEnvPath = "/home/yuny/QuickVoice/apps/server/.env";
const qvEnv = loadEnv(qvEnvPath);

const key = lkEnv.LIVEKIT_API_KEY;
const secret = lkEnv.LIVEKIT_API_SECRET;
const host = "http://192.168.1.85:7880";
const twilioSid = qvEnv.TWILIO_ACCOUNT_SID;
const twilioToken = qvEnv.TWILIO_AUTH_TOKEN;

const sip = new SipClient(host, key, secret);

function trunkId(resp: any): string {
  return resp?.sipTrunkId || resp?.sid || "";
}

async function main() {
  const results: Record<string, string> = {};

  // 1. Inbound trunk - listar existentes primero
  console.log("Listando trunks existentes...");
  let inboundId = "";
  try {
    const existing = await sip.listSipInboundTrunk();
    const list = existing?.inboundTrunks || existing?.trunks || existing || [];
    const arr = Array.isArray(list) ? list : [];
    const match = arr.find((t: any) => (t.numbers || []).includes("+12296293130"));
    if (match) {
      inboundId = trunkId(match);
      console.log("Inbound trunk YA EXISTE:", inboundId);
    }
  } catch (e) {
    console.log("list inbound:", (e as Error).message.slice(0, 60));
  }
  if (!inboundId) {
    console.log("Creando inbound trunk...");
    const inbound = await sip.createSipInboundTrunk("quickvoice-inbound", ["+12296293130"], {});
    inboundId = trunkId(inbound);
    console.log("Inbound trunk CREADO:", inboundId);
  }
  results.inbound = inboundId;

  // 2. Outbound trunk Twilio
  let outTwilioId = "";
  try {
    const existing = await sip.listSipOutboundTrunk();
    const list = existing?.outboundTrunks || existing?.trunks || existing || [];
    const arr = Array.isArray(list) ? list : [];
    const match = arr.find((t: any) => t.name === "quickvoice-outbound-twilio");
    if (match) {
      outTwilioId = trunkId(match);
      console.log("Outbound Twilio YA EXISTE:", outTwilioId);
    }
  } catch (e) {
    console.log("list outbound:", (e as Error).message.slice(0, 60));
  }
  if (!outTwilioId) {
    console.log("Creando outbound trunk Twilio...");
    const outTwilio = await sip.createSipOutboundTrunk("quickvoice-outbound-twilio", "sip.twilio.com", ["+12296293130"], {
      auth_username: twilioSid,
      auth_password: twilioToken,
    });
    outTwilioId = trunkId(outTwilio);
    console.log("Outbound Twilio CREADO:", outTwilioId);
  }
  results.outTwilio = outTwilioId;

  // 3. Outbound trunk Telnyx (opcional)
  let outTelnyxId = "";
  try {
    const existing = await sip.listSipOutboundTrunk();
    const list = existing?.outboundTrunks || existing?.trunks || existing || [];
    const arr = Array.isArray(list) ? list : [];
    const match = arr.find((t: any) => t.name === "quickvoice-outbound-telnyx");
    if (match) {
      outTelnyxId = trunkId(match);
    } else {
      const outTelnyx = await sip.createSipOutboundTrunk("quickvoice-outbound-telnyx", "sip.telnyx.com", ["+12296293130"], {});
      outTelnyxId = trunkId(outTelnyx);
      console.log("Outbound Telnyx CREADO:", outTelnyxId);
    }
  } catch (e) {
    console.log("Telnyx skip:", (e as Error).message.slice(0, 60));
  }
  results.outTelnyx = outTelnyxId;

  // 4. Actualizar .env
  let qv = fs.readFileSync(qvEnvPath, "utf-8");
  const setLine = (k: string, v: string) => {
    const re = new RegExp(`^${k}=.*$`, "m");
    const line = `${k}=${v}`;
    qv = re.test(qv) ? qv.replace(re, line) : qv + "\n" + line;
  };
  if (results.inbound) setLine("LIVEKIT_SIP_INBOUND_TRUNK_ID", results.inbound);
  if (results.outTwilio) setLine("LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID", results.outTwilio);
  if (results.outTelnyx) setLine("LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID", results.outTelnyx);
  fs.writeFileSync(qvEnvPath, qv);
  console.log("\n✅ TRUNKS LISTOS:");
  console.log("  Inbound:", results.inbound);
  console.log("  Outbound Twilio:", results.outTwilio);
  console.log("  Outbound Telnyx:", results.outTelnyx || "(opcional)");
  console.log("  .env actualizado");
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
