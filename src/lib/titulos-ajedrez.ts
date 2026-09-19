// Títulos de jugador (no de árbitro) que puede tener un entrenador.
// Deliberadamente acotado a los que pidió el sitio: sin IM/WIM. El orden
// del array es también el orden de fuerza (de mayor a menor), y se usa
// tal cual para ordenar los chips de filtro en /entrenadores.
export const TITULOS_AJEDREZ = [
  'Gran Maestro (GM)',
  'Gran Maestra Internacional (WGM)',
  'Maestro FIDE (FM)',
  'Maestra FIDE (WFM)',
  'Maestro Candidato (CM)',
  'Maestra Candidata (WCM)',
  'Maestro Nacional (NM)',
  'Maestra Nacional (WNM)',
] as const;

export type TituloAjedrez = (typeof TITULOS_AJEDREZ)[number];

// ---------- Jerarquía visual ----------
// A diferencia de árbitros (donde el color de texto alcanza), acá el
// título es LA credencial que vende a un entrenador, así que cada tier
// lleva su propia medalla con iniciales, pensada para una tarjeta más
// grande que la fila de árbitros. GM y WGM comparten la medalla dorada
// (son el techo real del ajedrez federado, con o sin la "W"); FM/WFM
// plata; CM/WCM bronce; NM/WNM quedan discretos, sin medalla.
export type TituloAjedrezTier = 'gm' | 'fm' | 'cm' | 'nm';

export interface TituloAjedrezTierMeta {
  tier: TituloAjedrezTier;
  short: string;
  color: string;
  colorBright: string;
  glow: string;
}

const TIER_BY_TITULO: Record<string, TituloAjedrezTierMeta> = {
  'Gran Maestro (GM)': {
    tier: 'gm',
    short: 'GM',
    color: '#e3b341',
    colorBright: '#f5d379',
    glow: 'rgba(227, 179, 65, 0.45)',
  },
  'Gran Maestra Internacional (WGM)': {
    tier: 'gm',
    short: 'WGM',
    color: '#e3b341',
    colorBright: '#f5d379',
    glow: 'rgba(227, 179, 65, 0.45)',
  },
  'Maestro FIDE (FM)': {
    tier: 'fm',
    short: 'FM',
    color: '#c7d0d6',
    colorBright: '#eef2f4',
    glow: 'rgba(199, 208, 214, 0.35)',
  },
  'Maestra FIDE (WFM)': {
    tier: 'fm',
    short: 'WFM',
    color: '#c7d0d6',
    colorBright: '#eef2f4',
    glow: 'rgba(199, 208, 214, 0.35)',
  },
  'Maestro Candidato (CM)': {
    tier: 'cm',
    short: 'CM',
    color: '#c17f4a',
    colorBright: '#e0a06c',
    glow: 'rgba(193, 127, 74, 0.35)',
  },
  'Maestra Candidata (WCM)': {
    tier: 'cm',
    short: 'WCM',
    color: '#c17f4a',
    colorBright: '#e0a06c',
    glow: 'rgba(193, 127, 74, 0.35)',
  },
  'Maestro Nacional (NM)': {
    tier: 'nm',
    short: '',
    color: '#7c8a80',
    colorBright: '#a8b3ac',
    glow: 'rgba(124, 138, 128, 0.2)',
  },
  'Maestra Nacional (WNM)': {
    tier: 'nm',
    short: '',
    color: '#7c8a80',
    colorBright: '#a8b3ac',
    glow: 'rgba(124, 138, 128, 0.2)',
  },
};

const DEFAULT_TIER: TituloAjedrezTierMeta = {
  tier: 'nm',
  short: '',
  color: '#7c8a80',
  colorBright: '#a8b3ac',
  glow: 'rgba(124, 138, 128, 0.2)',
};

export function getTituloAjedrezTier(titulo: string | null): TituloAjedrezTierMeta {
  if (!titulo) return DEFAULT_TIER;
  return TIER_BY_TITULO[titulo] ?? DEFAULT_TIER;
}

/** Formatea el ELO clásico con separador de miles ("2 340"). null -> "—". */
export function formatElo(elo: number | null): string {
  if (elo == null) return '—';
  return elo.toLocaleString('es-MX');
}

export type EloClasicoParseResult = { ok: true; value: number | null } | { ok: false };

/**
 * Parser puro (sin FormData) del ELO clásico: cadena vacía -> válido/null;
 * si no, entero en un rango plausible (evita cargas tipo "20000" o
 * negativos). Lo usan tanto el admin (vía parseEloClasico en
 * lib/entrenadores.ts) como el formulario público de postulación, para
 * no mantener el mismo rango válido en dos lugares.
 */
export function parseEloClasicoInput(raw: string): EloClasicoParseResult {
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3500) return { ok: false };
  return { ok: true, value: n };
}
