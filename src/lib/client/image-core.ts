// Piezas puras (sin DOM) del optimizador de imágenes: detección de imágenes
// animadas, métrica de similitud (SSIM sobre luminancia) y búsqueda de la
// calidad WebP más baja que sigue siendo visualmente idéntica.

/** true si el archivo es un GIF, APNG o WebP animado (convertirlo perdería los cuadros). */
export function isAnimatedImage(b: Uint8Array): boolean {
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

  // GIF: más de un descriptor de imagen = animado.
  if (b.length > 13 && ascii(0, 3) === 'GIF') {
    let p = 13;
    if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
    let frames = 0;
    const skipSubBlocks = () => {
      while (p < b.length && b[p] !== 0) p += b[p] + 1;
      p += 1;
    };
    while (p < b.length) {
      const block = b[p++];
      if (block === 0x3b) break;
      if (block === 0x21) {
        p += 1; // etiqueta de la extensión
        skipSubBlocks();
      } else if (block === 0x2c) {
        if (++frames > 1) return true;
        const flags = b[p + 8];
        p += 9;
        if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
        p += 1; // tamaño mínimo de código LZW
        skipSubBlocks();
      } else {
        break; // estructura inesperada: no asumimos nada
      }
    }
    return false;
  }

  // PNG: un chunk acTL antes de IDAT marca un APNG.
  if (b.length > 8 && b[0] === 0x89 && ascii(1, 3) === 'PNG') {
    let p = 8;
    while (p + 8 <= b.length) {
      const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
      const type = ascii(p + 4, 4);
      if (type === 'acTL') return true;
      if (type === 'IDAT') return false;
      p += 12 + len;
    }
    return false;
  }

  // WebP: bandera de animación en VP8X o chunks ANIM/ANMF.
  if (b.length > 21 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    if (ascii(12, 4) === 'VP8X' && (b[20] & 0x02) !== 0) return true;
    let p = 12;
    while (p + 8 <= b.length) {
      const type = ascii(p, 4);
      if (type === 'ANIM' || type === 'ANMF') return true;
      const len = b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24);
      p += 8 + len + (len & 1);
    }
  }
  return false;
}

/** Luminancia de un buffer RGBA. Los píxeles con transparencia se componen sobre blanco. */
export function lumaFromRGBA(rgba: Uint8ClampedArray | Uint8Array, out: Uint8Array): Uint8Array {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    const a = rgba[i + 3];
    let y = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8;
    if (a < 255) y = (y * a + 255 * (255 - a)) / 255;
    out[j] = y;
  }
  return out;
}

/** SSIM medio sobre bloques de 8×8 de luminancia (1 = idénticas). */
export function ssimLuma(a: Uint8Array, b: Uint8Array, w: number, h: number): number {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const bw = Math.min(8, w);
  const bh = Math.min(8, h);
  const n = bw * bh;
  let total = 0;
  let count = 0;
  for (let y = 0; y + bh <= h; y += bh) {
    for (let x = 0; x + bw <= w; x += bw) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let j = 0; j < bh; j++) {
        let idx = (y + j) * w + x;
        for (let i = 0; i < bw; i++, idx++) {
          const va = a[idx], vb = b[idx];
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      const ma = sa / n, mb = sb / n;
      const va = saa / n - ma * ma;
      const vb = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? total / count : 1;
}

export interface Trial {
  ssim: number;
  size: number;
  blob: Blob;
}

/**
 * Busca la calidad más baja cuyo resultado sigue cumpliendo `target` de SSIM.
 * Primero comprueba el techo (`max`), luego 1.0 (lossless en Chromium) y, si
 * alguno cumple, afina por bisección. Devuelve null si nada cumple.
 */
export async function searchQuality(
  trial: (quality: number) => Promise<Trial>,
  opts: { target: number; min?: number; max?: number; steps?: number }
): Promise<{ quality: number; trial: Trial } | null> {
  const { target, min = 0.55, max = 0.95, steps = 5 } = opts;

  let best: { quality: number; trial: Trial } | null = null;
  const top = await trial(max);
  if (top.ssim >= target) {
    best = { quality: max, trial: top };
  } else {
    const lossless = await trial(1);
    return lossless.ssim >= target ? { quality: 1, trial: lossless } : null;
  }

  let lo = min;
  let hi = max;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    const t = await trial(mid);
    if (t.ssim >= target) {
      hi = mid;
      if (t.size <= best.trial.size) best = { quality: mid, trial: t };
    } else {
      lo = mid;
    }
  }
  return best;
}
