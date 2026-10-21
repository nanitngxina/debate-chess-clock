/** Public member IDs are derived from a private 256-bit capability, scoped to room and role. */
export async function deriveVoiceClientId(roomId: string, role: string, clientKey: string): Promise<string> {
  const input = JSON.stringify(["voice-client-v1", roomId, role, clientKey]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyVoiceIdentity(
  roomId: string, role: string, clientId: unknown, clientKey: unknown,
): Promise<boolean> {
  if (typeof clientId !== "string" || !/^[a-f0-9]{64}$/.test(clientId) ||
      typeof clientKey !== "string" || !/^[a-f0-9]{64}$/.test(clientKey)) return false;
  return clientId === await deriveVoiceClientId(roomId, role, clientKey);
}

export function requiresVoiceIdentity(type: string): boolean {
  return ["join-voice", "leave-voice", "set-voice-muted", "request-public-voice"].includes(type);
}
