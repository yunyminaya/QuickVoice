import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
(async () => {
  // Formato correcto: {type: "direct", roomName, pin}
  const rule = {
    type: "direct" as const,
    roomName: "quickvoice-inbound-room",
    pin: "",
  };
  const r = await (sip as any).createSipDispatchRule(rule, {
    name: "quickvoice-inbound-rule",
    trunkIds: ["ST_vn6FQxx3ErXW"],
  });
  console.log("RULE CREADA:", JSON.stringify(r).slice(0, 250));
})().catch(e => console.error("ERROR:", e.message.slice(0, 150)));
