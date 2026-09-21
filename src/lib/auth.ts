// Login simple de un solo usuario administrador, con sesion en una cookie
// firmada (HMAC-SHA256) para no necesitar tabla de sesiones ni JWT libs.

const SESSION_COOKIE = 'arbitraje_session';
const SESSION_DAYS = 7;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bufferToHex(sig);
}

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bufferToHex(digest);
}

function timingSafeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCredentials(
  env: { ADMIN_USER?: string; ADMIN_PASS_HASH?: string },
  user: string,
  pass: string
): Promise<boolean> {
  if (!env.ADMIN_USER || !env.ADMIN_PASS_HASH) {
    // Falta configurar los secrets en este entorno (local o Cloudflare).
    // Preferimos negar el login en vez de tronar con un 500.
    console.error('ADMIN_USER o ADMIN_PASS_HASH no están definidos en el entorno.');
    return false;
  }
  const passHash = await sha256Hex(pass);
  return timingSafeEqual(user, env.ADMIN_USER) && timingSafeEqual(passHash, env.ADMIN_PASS_HASH);
}

export async function createSessionCookie(secret: string, user: string, secure = true): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ u: user, exp });
  const payloadB64 = btoa(payload);
  const sig = await hmac(secret, payloadB64);
  const value = `${payloadB64}.${sig}`;
  const secureAttr = secure ? ' Secure;' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly;${secureAttr} SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
}

export function clearSessionCookie(secure = true): string {
  const secureAttr = secure ? ' Secure;' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secureAttr} SameSite=Lax; Max-Age=0`;
}

export async function readSession(
  secret: string | undefined,
  cookieHeader: string | null
): Promise<{ user: string } | null> {
  if (!cookieHeader || !secret) return null;

  try {
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (!match) return null;

    const [payloadB64, sig] = match[1].split('.');
    if (!payloadB64 || !sig) return null;

    const expectedSig = await hmac(secret, payloadB64);
    if (!timingSafeEqual(sig, expectedSig)) return null;

    const payload = JSON.parse(atob(payloadB64)) as { u: string; exp: number };
    if (Date.now() > payload.exp) return null;
    return { user: payload.u };
  } catch {
    // Cookie corrupta, secret ausente, o cualquier otro fallo inesperado:
    // tratamos como "sin sesión" en vez de tumbar la request completa.
    // Esto corre en el middleware para TODAS las páginas, así que nunca
    // debe lanzar.
    return null;
  }
}

export { SESSION_COOKIE };
