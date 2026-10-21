import { deriveVoiceClientId } from "../shared/voiceIdentity";

export interface VoiceIdentity {
  clientId: string;
  clientKey: string;
}

const identities = new Map<string, Promise<VoiceIdentity>>();

/** Cache before awaiting: simultaneous SSE/command/poll requests must use one identity. */
export function getVoiceIdentity(roomId: string, role: string): Promise<VoiceIdentity> {
  const scope = JSON.stringify([roomId, role]);
  const cached = identities.get(scope);
  if (cached) return cached;
  const pending = (async () => {
    const storageKey = `debate-voice-key:${scope}`;
    let clientKey: string | null = null;
    try { clientKey = window.sessionStorage.getItem(storageKey); } catch { /* In-memory fallback. */ }
    if (!clientKey || !/^[a-f0-9]{64}$/.test(clientKey)) {
      clientKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      try { window.sessionStorage.setItem(storageKey, clientKey); } catch { /* Keep the cached key. */ }
    }
    return { clientKey, clientId: await deriveVoiceClientId(roomId, role, clientKey) };
  })();
  identities.set(scope, pending);
  void pending.catch(() => { identities.delete(scope); });
  return pending;
}
