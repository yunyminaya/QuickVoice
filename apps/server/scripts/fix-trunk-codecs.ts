// fix-trunk-codecs.ts — fuerza G.711 (PCMU/PCMA) en el inbound trunk de LiveKit
// Causa del silencio: Twilio envia G.711 8kHz, LiveKit espera opus 48kHz -> drift -833333 ppm -> Twilio descarta el audio de salida.
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
const sip = new SipClient("http://127.0.0.1:7880", lkEnv.LIVEKIT_API_KEY, lkEnv.LIVEKIT_API_SECRET);

(async () => {
  // 1. listar inbound trunks
  const existing: any = await sip.listSipInboundTrunk();
  const list = existing?.inboundTrunks || existing?.trunks || existing || [];
  const arr = Array.isArray(list) ? list : [];
  const match = arr.find((t: any) => t.name === "quickvoice-inbound") || arr[0];
  if (!match) { console.log("no inbound trunk encontrado"); process.exit(1); }
  const id = match.sipTrunkId || match.sid;
  console.log("Inbound trunk:", id, "| name:", match.name, "| codecs actuales:", JSON.stringify(match.allowedCodecs || match.codecs || "default"));

  // 2. actualizar con codecs G.711 (la API exige Numbers/Auth/AllowedAddresses por seguridad)
  const numbers = match.numbers || [];
  const upd: any = await sip.updateSipInboundTrunk(id, { allowedCodecs: ["PCMU", "PCMA"], numbers });
  console.log("update resp:", JSON.stringify(upd).slice(0, 300));

  // 3. verificar
  const again: any = await sip.listSipInboundTrunk();
  const list2 = again?.inboundTrunks || again?.trunks || again || [];
  const match2 = (Array.isArray(list2) ? list2 : []).find((t: any) => (t.sipTrunkId || t.sid) === id);
  console.log("VERIFICADO codecs:", JSON.stringify(match2?.allowedCodecs || match2?.codecs || "??"));
})().catch((e) => { console.error("ERROR:", e.message.slice(0, 200)); process.exit(1); });
