import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
(async () => {
  const inb = await sip.listSipInboundTrunk();
  console.log("INBOUND:", JSON.stringify((inb as any).inboundTrunks || []).slice(0, 200));
  const out = await sip.listSipOutboundTrunk();
  console.log("OUTBOUND:", JSON.stringify((out as any).outboundTrunks || []).slice(0, 200));
})().catch(e => console.log("ERR:", e.message.slice(0, 100)));
