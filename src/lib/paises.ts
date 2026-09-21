// Lista fija de países para el directorio de clubes: México, el resto de
// Latinoamérica y España. Ver conversación de diseño -- no es texto libre
// a propósito. Un <select> con esta lista es lo que le permite al
// directorio armar chips de filtro consistentes ("México" siempre es
// "México", nunca también "mexico" o "MX" por un typo de quien postula).
//
// No es la lista completa de la ONU: es deliberadamente acotada al alcance
// que hoy tiene el sitio. Agregar un país es una línea acá, no una
// migración.
export const PAISES_CLUBES = [
  'México',
  'Argentina',
  'Bolivia',
  'Brasil',
  'Chile',
  'Colombia',
  'Costa Rica',
  'Cuba',
  'Ecuador',
  'El Salvador',
  'España',
  'Guatemala',
  'Honduras',
  'Nicaragua',
  'Panamá',
  'Paraguay',
  'Perú',
  'Puerto Rico',
  'República Dominicana',
  'Uruguay',
  'Venezuela',
] as const;

export type PaisClub = (typeof PAISES_CLUBES)[number];
