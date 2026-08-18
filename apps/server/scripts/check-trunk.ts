import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
(async () => {
  const r = await sip.listSipOutboundTrunk();
  const trunks = (r as any).outboundTrunks || [];
  console.log("OUTBOUND TRUNKS:", trunks.length);
  for (const t of trunks) {
    console.log(JSON.stringify({id: t.sipTrunkId, name: t.name, address: t.address, auth: t.authUsername ? "SET" : "VACIO", numbers: t.numbers}));
  }
})().catch(e => console.log("ERR:", e.message.slice(0, 100)));
