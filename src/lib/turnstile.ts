// Verificación de Cloudflare Turnstile. Mismo enfoque que ya usa
// src/pages/api/auth/login.ts: no basta con `success`, también hay
// que exigir que el token se haya resuelto para la `action` y el
// `hostname` esperados, para que un token válido de otra parte del
// sitio (o de otra propiedad con la misma cuenta) no cuele acá.
export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  expectedHostname: string,
  expectedAction: string
): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean; action?: string; hostname?: string };
    return data.success === true && data.action === expectedAction && data.hostname === expectedHostname;
  } catch (err) {
    console.error('Error verificando Turnstile:', err);
    return false;
  }
}
