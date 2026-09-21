// Regla de indexación para perfiles de directorio (árbitros, entrenadores,
// clubes).
//
// Aviso honesto antes de leer el número de abajo: Google nunca ha publicado
// ni confirmado un mínimo de palabras para "contenido de valor". John
// Mueller lo ha desmentido explícitamente varias veces ("word count is not
// a ranking factor" / "don't use word count"). Lo que de verdad evalúan es
// si el texto aporta algo único que alguien buscaría, no su longitud.
//
// Aun así, necesitamos una regla automática y determinista para decidir,
// sin revisar perfil por perfil, cuáles de potencialmente cientos de
// perfiles se indexan. Elegimos 300 palabras de bio a propósito en el
// extremo alto: en la práctica de SEO (no oficial de Google, pero es lo más
// citado como "esto ya definitivamente no es thin content") el rango que se
// menciona para páginas cortas legítimas va de ~100 a ~300 palabras.
// Usamos el techo de ese rango porque preferimos noindexar de más --
// perfiles genuinos que se reindexan solos en cuanto crezca su bio -- a
// arriesgarnos a que Google perciba el sitio como lleno de páginas
// delgadas repetidas, justo cuando se busca monetizar con AdSense.
export const MIN_PALABRAS_BIO_PARA_INDEXAR = 300;

export function contarPalabras(texto: string | null | undefined): number {
  if (!texto) return 0;
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** true si el perfil tiene bio suficiente como para valer la pena indexarlo. */
export function perfilTieneValorParaIndexar(bio: string | null | undefined): boolean {
  return contarPalabras(bio) >= MIN_PALABRAS_BIO_PARA_INDEXAR;
}
