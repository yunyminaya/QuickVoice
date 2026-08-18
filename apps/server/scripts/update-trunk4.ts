import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
const TW_SID = process.env.TW_SID!;
const TW_TOKEN = process.env.TW_TOKEN!;
(async () => {
  const trunk = {
    name: "quickvoice-outbound-twilio",
    address: "sip.us1.twilio.com",
    hostname: "sip.us1.twilio.com",
    numbers: ["+15550101010"],
    authUsername: TW_SID,
    authPassword: TW_TOKEN,
    fromHost: "66.229.249.125",
  };
  const r = await (sip as any).updateSipOutboundTrunk("ST_e675tng8fcym", trunk);
  console.log("TRUNK ACTUALIZADO:", JSON.stringify(r).slice(0, 150));
})().catch(e => console.error("ERROR:", e.message.slice(0, 120)));
