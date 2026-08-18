import { SipClient } from "livekit-server-sdk";
const sip = new SipClient("http://127.0.0.1:7880", process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
(async () => {
  console.log("Metodos dispatch:", Object.getOwnPropertyNames(Object.getPrototypeOf(sip)).filter(m => m.toLowerCase().includes("dispatch")));
  // Probar crear la regla de despacho (llamadas -> agente)
  try {
    const r = await (sip as any).createSipDispatchRule({
      name: "quickvoice-inbound-rule",
      trunkIds: ["ST_vn6FQxx3ErXW"],
      rule: { dispatchRuleDirect: { roomName: "quickvoice-inbound-room", agentName: "quickvoice-voice-agent" } },
    });
    console.log("RULE:", JSON.stringify(r).slice(0, 200));
  } catch (e) {
    console.log("ERROR create:", (e as Error).message.slice(0, 120));
    // Probar con el formato de dispatch rule directo
    try {
      const r2 = await (sip as any).createSipDispatchRule("ST_vn6FQxx3ErXW", "quickvoice-voice-agent", {});
      console.log("RULE2:", JSON.stringify(r2).slice(0, 200));
    } catch (e2) {
      console.log("ERROR create2:", (e2 as Error).message.slice(0, 120));
    }
  }
})().catch(e => console.error("ERR:", e.message.slice(0, 100)));
