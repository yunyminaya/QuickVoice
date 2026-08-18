import { SipClient, AgentDispatchClient } from "livekit-server-sdk";
const host = "http://127.0.0.1:7880";
const key = process.env.LIVEKIT_API_KEY!;
const secret = process.env.LIVEKIT_API_SECRET!;
const roomName = "test-call-" + Date.now().toString(36);
const NUMBER = "+15550101010";
const FROM = "+15550101010";
const TW_SID = process.env.TW_SID!;
const TW_TOKEN = process.env.TW_TOKEN!;
const sip = new SipClient(host, key, secret);
const dispatch = new AgentDispatchClient(host, key, secret);
(async () => {
  console.log("Sala:", roomName);
  const d = await dispatch.createDispatch(roomName, "quickvoice-voice-agent", {});
  console.log("Dispatch:", (d as any).id);
  const trunkConfig = {
    name: "quickvoice-outbound-twilio",
    hostname: "sip.twilio.com",
    numbers: ["+15550101010"],
    authUsername: TW_SID,
    authPassword: TW_TOKEN,
  };
  const p = await sip.createSipParticipant("ST_e675tng8fcym", NUMBER, roomName, {
    fromNumber: FROM,
  }, trunkConfig as any);
  console.log("Participant:", JSON.stringify(p).slice(0, 150));
  console.log("✅ LLAMADA INICIADA A " + NUMBER);
})().catch(e => console.error("ERROR:", e.message.slice(0, 200)));
