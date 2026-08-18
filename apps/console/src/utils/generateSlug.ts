function randomString(length = 4) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, length);
  }
  // Fallback para contextos HTTP no seguros (crypto.randomUUID solo existe en HTTPS)
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }
  return Math.random().toString(36).slice(2, 2 + length);
}

export function generateSlug(text: string): string {
  const baseSlug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${baseSlug || "workspace"}-${randomString(8)}`;
}
