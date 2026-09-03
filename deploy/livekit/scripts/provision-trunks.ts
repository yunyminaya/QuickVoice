// Provisiona el trunk SIP saliente de Twilio para QuickVoice.
// Idempotente: actualiza el trunk existente y guarda su ID en apps/server/.env.
import fs from "fs";
import path from "path";
import { SipClient } from "livekit-server-sdk";

type Env = Record<string, string>;
type OutboundTrunk = {
  sipTrunkId?: string;
  name?: string;
  address?: string;
  numbers?: string[];
  authUsername?: string;
};

function loadEnv(filePath: string): Env {
  const out: Env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^("|')(.*)\1$/, "$2");
    out[key] = value;
  }
  return out;
}

function findQuickVoiceEnv(): string {
  const candidates = [
    process.env.QUICKVOICE_ENV_FILE,
    path.resolve(process.cwd(), "apps/server/.env"),
    path.resolve(process.cwd(), ".env"),
    "/home/yuny/QuickVoice/apps/server/.env",
  ].filter((candidate): candidate is string => Boolean(candidate));

  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) {
    throw new Error(
      "No se encontró apps/server/.env. Usa QUICKVOICE_ENV_FILE para indicar el archivo.",
    );
  }
  return envPath;
}

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Falta ${key} en el .env de QuickVoice`);
  return value;
}

function livekitHttpUrl(value: string | undefined): string {
  const raw = (value || "ws://127.0.0.1:7880").replace(/\/$/, "");
  return raw.replace(/^ws(s?):\/\//, "http$1://");
}

function trunkId(trunk: OutboundTrunk): string {
  return trunk.sipTrunkId || "";
}

function outboundList(response: unknown): OutboundTrunk[] {
  if (Array.isArray(response)) return response as OutboundTrunk[];
  if (response && typeof response === "object") {
    const value = response as Record<string, unknown>;
    for (const key of ["outboundTrunks", "trunks", "items"]) {
      if (Array.isArray(value[key])) return value[key] as OutboundTrunk[];
    }
  }
  return [];
}

function setEnvValue(filePath: string, key: string, value: string): void {
  let content = fs.readFileSync(filePath, "utf-8");
  const expression = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  content = expression.test(content)
    ? content.replace(expression, line)
    : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

async function main(): Promise<void> {
  const envPath = findQuickVoiceEnv();
  const env = loadEnv(envPath);
  const number = required(env, "LIVEKIT_SIP_OUTBOUND_TWILIO_NUMBER");
  const address = required(env, "TWILIO_SIP_TERMINATION_URI");

  if (!address.endsWith(".pstn.twilio.com")) {
    throw new Error(
      "TWILIO_SIP_TERMINATION_URI debe ser el hostname *.pstn.twilio.com de Twilio",
    );
  }

  const sip = new SipClient(
    livekitHttpUrl(env.LIVEKIT_URL),
    required(env, "LIVEKIT_API_KEY"),
    required(env, "LIVEKIT_API_SECRET"),
  );
  const configuredId = env.LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID;
  const existing = outboundList(await sip.listSipOutboundTrunk());
  let trunk = configuredId
    ? existing.find((candidate) => trunkId(candidate) === configuredId)
    : undefined;
  trunk ||= existing.find(
    (candidate) => candidate.name === "quickvoice-outbound-twilio",
  );

  let id = trunk ? trunkId(trunk) : "";
  if (trunk && !String(trunk.address || "").endsWith(".pstn.twilio.com")) {
    throw new Error(
      `El trunk Twilio existente ${id} no usa un hostname *.pstn.twilio.com; no se modifica`,
    );
  }

  if (!trunk) {
    const username = required(env, "TWILIO_SIP_USERNAME");
    const password = required(env, "TWILIO_SIP_PASSWORD");
    const created = await sip.createSipOutboundTrunk(
      "quickvoice-outbound-twilio",
      address,
      [number],
      { auth_username: username, auth_password: password },
    );
    id = trunkId(created);
    if (!id) throw new Error("LiveKit no devolvió el ID del trunk creado");
  } else {
    await sip.updateSipOutboundTrunkFields(id, { numbers: { set: [number] } });
  }

  const verified = outboundList(await sip.listSipOutboundTrunk()).find(
    (candidate) => trunkId(candidate) === id,
  );
  if (!verified || !(verified.numbers || []).includes(number)) {
    throw new Error("No se pudo verificar el número en el trunk Twilio");
  }
  if (!String(verified.address || "").endsWith(".pstn.twilio.com")) {
    throw new Error("No se pudo verificar la dirección PSTN de Twilio");
  }

  setEnvValue(envPath, "LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID", id);
  console.log("✅ Trunk saliente Twilio listo");
  console.log(`   ID: ${id}`);
  console.log(`   Dirección PSTN: ${verified.address}`);
  console.log("   Número configurado: sí");
  console.log(`   Archivo actualizado: ${envPath}`);
}

main().catch((error: unknown) => {
  console.error(
    "ERROR:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
