import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
const TW_SID = process.env.TW_SID!;
const TW_TOKEN = process.env.TW_TOKEN!;
(async () => {
  // Actualizar el trunk outbound con FromHost (IP publica del servidor)
  const r = await (sip as any).updateSipOutboundTrunkFields("ST_e675tng8fcym", {
    hostname: "sip.twilio.com",
    numbers: ["+15550101010"],
    authUsername: TW_SID,
    authPassword: TW_TOKEN,
    fromHost: "66.229.249.125",
  });
  console.log("TRUNK ACTUALIZADO:", JSON.stringify(r).slice(0, 250));
})().catch(e => console.error("ERROR:", e.message.slice(0, 150)));
