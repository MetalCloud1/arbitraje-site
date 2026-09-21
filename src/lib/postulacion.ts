// Validación del formulario público de postulación (árbitros y
// entrenadores: registro/reclamo) y armado del correo que recibe un
// humano para revisar. Nada de esto escribe en las bases de árbitros o
// entrenadores: solo valida y arma un email. Un único endpoint sirve a
// los dos directorios -- ver /api/postular.ts -- así que esto valida
// según `tipoDirectorio`, sin mezclar nunca el vocabulario de títulos
// de uno con el del otro.

import { TITULOS_AJEDREZ, parseEloClasicoInput } from './titulos-ajedrez';

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima',
  'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
  'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
  'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán',
  'Zacatecas', 'Extranjero',
] as const;

export const TITULOS_ARBITRO = [
  'Árbitro Internacional (AI)',
  'Árbitro FIDE (FA)',
  'Árbitro Nacional (AN)',
  'Árbitro de Club',
  'En formación / Sin título',
] as const;

// ---------- Jerarquía visual de títulos ----------
// El título de un árbitro no es un dato más: es la credencial que le costó
// años. AI, FA y AN son medallas reales (oro/plata/bronce) y el diseño de
// la tarjeta debe notarse distinto para cada una en vez de tratarlas todas
// igual con el mismo verde. "Árbitro de Club" y "sin título" no llevan
// medalla: usan el verde de marca (de club) o quedan deliberadamente
// discretas (en formación), sin que eso se sienta como un castigo.
export type TituloTier = 'ai' | 'fa' | 'an' | 'club' | 'base';

export interface TituloTierMeta {
  tier: TituloTier;
  /** Iniciales para la medalla sobre la foto. Vacío = sin medalla. */
  short: string;
  color: string;
  colorBright: string;
  glow: string;
}

const TIER_BY_TITULO: Record<string, TituloTierMeta> = {
  'Árbitro Internacional (AI)': {
    tier: 'ai',
    short: 'AI',
    color: '#e3b341',
    colorBright: '#f5d379',
    glow: 'rgba(227, 179, 65, 0.45)',
  },
  'Árbitro FIDE (FA)': {
    tier: 'fa',
    short: 'FA',
    color: '#c7d0d6',
    colorBright: '#eef2f4',
    glow: 'rgba(199, 208, 214, 0.35)',
  },
  'Árbitro Nacional (AN)': {
    tier: 'an',
    short: 'AN',
    color: '#c17f4a',
    colorBright: '#e0a06c',
    glow: 'rgba(193, 127, 74, 0.35)',
  },
  'Árbitro de Club': {
    tier: 'club',
    short: '',
    color: '#81b64c',
    colorBright: '#97cc5f',
    glow: 'rgba(129, 182, 76, 0.3)',
  },
  'En formación / Sin título': {
    tier: 'base',
    short: '',
    color: '#7c8a80',
    colorBright: '#a8b3ac',
    glow: 'rgba(124, 138, 128, 0.2)',
  },
};

const DEFAULT_TIER = TIER_BY_TITULO['En formación / Sin título'];

export function getTituloTier(titulo: string | null): TituloTierMeta {
  if (!titulo) return DEFAULT_TIER;
  return TIER_BY_TITULO[titulo] ?? DEFAULT_TIER;
}

const NOMBRE_RE = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ' -]{3,100}$/;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,24}$/;
const FIDE_RE = /^[0-9]{4,10}$/;

function hasControlCharsOrAngles(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001F\u007F<>]/.test(s);
}

function isSingleLine(s: string): boolean {
  // Campos que van a un header de email (o al asunto) no pueden traer
  // saltos de línea: eso es la puerta clásica a la inyección de headers.
  return !/[\r\n]/.test(s);
}

export type TipoDirectorio = 'arbitro' | 'entrenador';

export interface PostulacionInput {
  tipoDirectorio: TipoDirectorio;
  tipo: 'registro' | 'reclamo';
  perfilId: number | null; // solo con tipo === 'reclamo'; id en la tabla de tipoDirectorio
  nombreCompleto: string;
  estado: string;
  // Árbitro: tituloArbitraje obligatorio, tituloAjedrez siempre null.
  // Entrenador: tituloAjedrez obligatorio, tituloArbitraje opcional
  // (muchos entrenadores también son árbitros titulados).
  tituloArbitraje: string | null;
  tituloAjedrez: string | null;
  eloClasico: number | null; // solo aplica a entrenador
  fideId: string; // '' si no aplica
  email: string;
  bio: string;
}

export type PostulacionValidationResult =
  | { ok: true; data: PostulacionInput }
  | { ok: false; error: string };

/** Extrae y valida los campos del formulario. No toca la base de datos. */
export function validatePostulacion(form: FormData): PostulacionValidationResult {
  const tipoDirectorioRaw = String(form.get('tipo_directorio') ?? '');
  if (tipoDirectorioRaw !== 'arbitro' && tipoDirectorioRaw !== 'entrenador') {
    return { ok: false, error: 'Formulario inválido.' };
  }
  const tipoDirectorio = tipoDirectorioRaw;

  const tipoRaw = String(form.get('tipo') ?? '');
  if (tipoRaw !== 'registro' && tipoRaw !== 'reclamo') {
    return { ok: false, error: 'Formulario inválido.' };
  }
  const tipo = tipoRaw;

  let perfilId: number | null = null;
  if (tipo === 'reclamo') {
    const idRaw = Number(form.get('perfil_id'));
    if (!Number.isInteger(idRaw) || idRaw <= 0) {
      return { ok: false, error: 'Perfil a reclamar inválido.' };
    }
    perfilId = idRaw;
  }

  const nombreCompleto = String(form.get('nombre_completo') ?? '').trim();
  if (!NOMBRE_RE.test(nombreCompleto) || !isSingleLine(nombreCompleto)) {
    return { ok: false, error: 'El nombre completo debe tener entre 3 y 100 letras, sin números ni símbolos.' };
  }

  const estado = String(form.get('estado') ?? '').trim();
  if (!(ESTADOS_MX as readonly string[]).includes(estado)) {
    return { ok: false, error: 'Selecciona un estado válido.' };
  }

  // ---- Títulos: vocabulario separado por directorio, nunca mezclado ----
  let tituloArbitraje: string | null = null;
  let tituloAjedrez: string | null = null;
  let eloClasico: number | null = null;

  if (tipoDirectorio === 'arbitro') {
    const tituloRaw = String(form.get('titulo_arbitraje') ?? '').trim();
    if (!(TITULOS_ARBITRO as readonly string[]).includes(tituloRaw)) {
      return { ok: false, error: 'Selecciona un título válido.' };
    }
    tituloArbitraje = tituloRaw;
  } else {
    const tituloAjedrezRaw = String(form.get('titulo_ajedrez') ?? '').trim();
    if (!(TITULOS_AJEDREZ as readonly string[]).includes(tituloAjedrezRaw)) {
      return { ok: false, error: 'Selecciona tu título de ajedrez.' };
    }
    tituloAjedrez = tituloAjedrezRaw;

    // Opcional: muchos entrenadores también son árbitros titulados.
    const tituloArbitrajeRaw = String(form.get('titulo_arbitraje') ?? '').trim();
    if (tituloArbitrajeRaw) {
      if (!(TITULOS_ARBITRO as readonly string[]).includes(tituloArbitrajeRaw)) {
        return { ok: false, error: 'El título de arbitraje seleccionado no es válido.' };
      }
      tituloArbitraje = tituloArbitrajeRaw;
    }

    const eloRaw = String(form.get('elo_clasico') ?? '');
    const eloResult = parseEloClasicoInput(eloRaw);
    if (!eloResult.ok) {
      return { ok: false, error: 'El ELO clásico debe ser un número entero entre 0 y 3500.' };
    }
    eloClasico = eloResult.value;
  }

  const fideId = String(form.get('fide_id') ?? '').trim();
  if (fideId && !FIDE_RE.test(fideId)) {
    return { ok: false, error: 'El ID de FIDE debe ser numérico (4 a 10 dígitos).' };
  }

  const email = String(form.get('email') ?? '').trim();
  if (email.length > 254 || !EMAIL_RE.test(email) || !isSingleLine(email)) {
    return { ok: false, error: 'El correo electrónico no tiene un formato válido.' };
  }

  const bio = String(form.get('bio') ?? '').trim();
  if (bio.length < 20 || bio.length > 1000 || hasControlCharsOrAngles(bio)) {
    return {
      ok: false,
      error: 'La descripción debe tener entre 20 y 1000 caracteres, sin símbolos de código (< >).',
    };
  }

  return {
    ok: true,
    data: { tipoDirectorio, tipo, perfilId, nombreCompleto, estado, tituloArbitraje, tituloAjedrez, eloClasico, fideId, email, bio },
  };
}

const NOMBRE_DIRECTORIO: Record<TipoDirectorio, string> = {
  arbitro: 'árbitro',
  entrenador: 'entrenador',
};

const NOMBRE_DIRECTORIO_PLURAL: Record<TipoDirectorio, string> = {
  arbitro: 'Árbitros',
  entrenador: 'Entrenadores',
};

export interface PostulacionEmailContext {
  data: PostulacionInput;
  /** Nombre real leído de la base al momento de reclamar -- nunca el que mande el cliente. */
  perfilExistenteNombre?: string;
  ip: string;
  userAgent: string;
}

/**
 * Arma el correo que recibe un humano para revisar. Encabeza siempre con
 * "Directorio: Árbitros/Entrenadores" a propósito -- es la corrección al
 * problema original de reciclar un solo formulario para dos directorios:
 * quien revisa el correo no debería tener que adivinar cuál es por el
 * título que la persona eligió.
 */
export function buildPostulacionEmail(ctx: PostulacionEmailContext): { subject: string; text: string } {
  const { data, perfilExistenteNombre, ip, userAgent } = ctx;
  const nombreDirectorio = NOMBRE_DIRECTORIO[data.tipoDirectorio];

  const tipoLinea =
    data.tipo === 'reclamo'
      ? `Reclamo de identidad — ID ${String(data.perfilId).padStart(6, '0')} (${perfilExistenteNombre ?? 'perfil no encontrado'})`
      : 'Registro nuevo';

  const subject =
    data.tipo === 'reclamo'
      ? `Reclamo de perfil de ${nombreDirectorio} #${data.perfilId} — ${perfilExistenteNombre ?? data.nombreCompleto}`
      : `Nueva postulación de ${nombreDirectorio}: ${data.nombreCompleto}`;

  const lineasTitulo: string[] = [];
  if (data.tituloArbitraje) lineasTitulo.push(`Título de arbitraje: ${data.tituloArbitraje}`);
  if (data.tituloAjedrez) lineasTitulo.push(`Título de ajedrez: ${data.tituloAjedrez}`);
  if (data.tipoDirectorio === 'entrenador') {
    lineasTitulo.push(`ELO clásico: ${data.eloClasico != null ? data.eloClasico : '(no proporcionado)'}`);
  }

  const text = `Directorio: ${NOMBRE_DIRECTORIO_PLURAL[data.tipoDirectorio]}
Tipo: ${tipoLinea}

Nombre completo: ${data.nombreCompleto}
Estado: ${data.estado}
${lineasTitulo.join('\n')}
ID FIDE: ${data.fideId || '(no proporcionado)'}
Email de contacto: ${data.email}

Descripción / trayectoria:
${data.bio}

---
IP del remitente: ${ip}
User-Agent: ${userAgent}
Fecha: ${new Date().toISOString()}
`;

  return { subject, text };
}
