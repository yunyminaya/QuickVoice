import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
const TW_SID = process.env.TW_SID!;
const TW_TOKEN = process.env.TW_TOKEN!;
(async () => {
  console.log("Creando inbound...");
  const inb = await sip.createSipInboundTrunk("quickvoice-inbound", ["+15550101010"], {});
  console.log("  inbound:", (inb as any).sipTrunkId);
  console.log("Creando outbound Twilio...");
  const out = await sip.createSipOutboundTrunk("quickvoice-outbound-twilio", "sip.twilio.com", ["+15550101010"], {
    authUsername: TW_SID,
    authPassword: TW_TOKEN,
  });
  console.log("  outbound:", (out as any).sipTrunkId);
})().catch(e => console.error("ERROR:", e.message.slice(0, 120)));
