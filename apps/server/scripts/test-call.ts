import { SipClient, AgentDispatchClient } from "livekit-server-sdk";
const host = "http://127.0.0.1:7880";
const key = process.env.LIVEKIT_API_KEY!;
const secret = process.env.LIVEKIT_API_SECRET!;
const roomName = "test-call-" + Date.now().toString(36);
const OUT_TRUNK = "ST_e675tng8fcym";
const NUMBER = "+15550101010";

const sip = new SipClient(host, key, secret);
const dispatch = new AgentDispatchClient(host, key, secret);

async function main() {
  console.log("Sala:", roomName);
  const d = await dispatch.createDispatch(roomName, "quickvoice-voice-agent", {});
  console.log("Dispatch:", JSON.stringify(d).slice(0, 120));
  const p = await sip.createSipParticipant(OUT_TRUNK, NUMBER, roomName, {});
  console.log("Participant:", JSON.stringify(p).slice(0, 150));
  console.log("LLAMADA INICIADA A " + NUMBER);
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
