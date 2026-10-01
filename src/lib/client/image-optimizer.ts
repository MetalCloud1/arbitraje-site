// Optimizador de imágenes del lado del cliente (solo panel /admin).
//
// Intercepta cualquier <input type="file"> de imágenes (portadas, fotos, logos
// y el widget de galería) y, antes de que el formulario o el widget lo vea,
// reemplaza cada archivo por una versión WebP lo más liviana posible que sigue
// siendo visualmente idéntica. No toca ninguna página ni componente: actúa en
// la fase de captura del evento "change" y reemite el evento con los archivos
// ya convertidos. Ante cualquier fallo se deja el archivo original intacto.
import { halve, isAnimatedImage, lumaFromRGBA, searchQuality, ssimLuma, type Trial } from './image-core';

/** Lado mayor máximo. Solo recorta fotos gigantes; ninguna vista del sitio se acerca a esto. */
const MAX_DIM = 4096;
/** Similitud mínima (SSIM de luminancia) frente al original. 0.985 es imperceptible a simple vista. */
const TARGET_SSIM = 0.985;
/** Fidelidad mínima cuando el original supera el límite del servidor y de otro modo no se podría subir. */
const RELAXED_SSIM = 0.97;
/** Límite del servidor (src/lib/images.ts). Si se supera, se reduce el tamaño solo lo necesario. */
const SERVER_LIMIT = 5 * 1024 * 1024 - 64 * 1024;
const PICKER_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/heic,image/heif';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const DONE = Symbol('image-optimizer-done');
let pending = 0;

function makeCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: Ctx } {
  const canvas: AnyCanvas =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error('canvas no disponible');
  return { canvas, ctx };
}

async function encodeWebp(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/webp', quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/webp', quality)
  );
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Para imágenes grandes la calidad se busca sobre 3 recortes a escala 1:1
 * (así los artefactos se ven igual que en la imagen real) y luego se codifica
 * la imagen completa una sola vez. Es mucho más rápido que iterar sobre 12 MP.
 */
const ANALYSIS_PIXELS = 1_200_000;
const TILE = 512;

/** Mejor WebP para `bitmap` a la escala dada, o null si no se logra algo fiel. */
async function bestWebp(bitmap: ImageBitmap, scale: number, target: number): Promise<Blob | null> {
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const full = makeCanvas(w, h);
  full.ctx.drawImage(bitmap, 0, 0, w, h);

  let probe = full;
  let pw = w;
  let ph = h;
  if (w * h > ANALYSIS_PIXELS) {
    const tw = Math.min(TILE, w);
    const th = Math.min(TILE, h);
    pw = tw * 3;
    ph = th;
    probe = makeCanvas(pw, ph);
    [[0.5, 0.5], [0.25, 0.3], [0.75, 0.7]].forEach(([fx, fy], i) => {
      const sx = Math.round((w - tw) * fx);
      const sy = Math.round((h - th) * fy);
      probe.ctx.drawImage(full.canvas as CanvasImageSource, sx, sy, tw, th, i * tw, 0, tw, th);
    });
  }

  const luma = new Uint8Array(pw * ph);
  const reference = halve(lumaFromRGBA(probe.ctx.getImageData(0, 0, pw, ph).data, luma), pw, ph);
  const scratch = makeCanvas(pw, ph);

  const trial = async (quality: number): Promise<Trial> => {
    const blob = await encodeWebp(probe.canvas, quality);
    if (blob.type !== 'image/webp') throw new Error('El navegador no codifica WebP');
    const back = await createImageBitmap(blob);
    scratch.ctx.clearRect(0, 0, pw, ph);
    scratch.ctx.drawImage(back, 0, 0);
    back.close();
    const cand = halve(lumaFromRGBA(scratch.ctx.getImageData(0, 0, pw, ph).data, luma), pw, ph);
    return { ssim: ssimLuma(reference.data, cand.data, reference.w, reference.h), size: blob.size, blob };
  };

  const found = await searchQuality(trial, { target, max: 0.97 });

  if (!found.met) {
    // Ni la calidad máxima alcanza la fidelidad pedida (gráficos con bordes muy
    // finos, por ejemplo). En imágenes chicas el WebP sin pérdida es exacto y
    // suele ser liviano; en grandes tardaría segundos y casi nunca conviene.
    if (probe !== full) return null;
    return (await encodeWebp(full.canvas, 1)).type === 'image/webp' ? encodeWebp(full.canvas, 1) : null;
  }
  if (probe === full) return found.trial.blob;

  // Imagen completa con la calidad hallada (+0.01 de margen por haber medido en recortes).
  const blob = await encodeWebp(full.canvas, Math.min(0.99, found.quality + 0.01));
  return blob.type === 'image/webp' ? blob : null;
}

/** Devuelve el archivo optimizado, o el mismo archivo si no hay mejora segura. */
export async function optimizeImage(file: File): Promise<File> {
  try {
    if (file.type === 'image/svg+xml') return file;
    if (file.type && !file.type.startsWith('image/')) return file;

    const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
    if (isAnimatedImage(file.size <= head.length ? head : new Uint8Array(await file.arrayBuffer()))) return file;

    const bitmap = await decode(file);
    try {
      let scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
      // Solo si el original ya no cabe en el servidor se acepta una fidelidad algo menor.
      const target = file.size > SERVER_LIMIT ? RELAXED_SSIM : TARGET_SSIM;
      let blob: Blob | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        blob = await bestWebp(bitmap, scale, target);
        if (!blob || blob.size <= SERVER_LIMIT) break;
        scale *= 0.8; // solo si aún excede el límite del servidor
      }
      if (!blob) return file;
      if (blob.size > SERVER_LIMIT && file.size <= SERVER_LIMIT) return file;

      // Si no ahorra nada (p. ej. JPEG ya muy comprimido o WebP ya optimizado),
      // conservar el original evita perder calidad por una recompresión inútil.
      const sameOrBigger = file.size <= SERVER_LIMIT && blob.size >= file.size;
      if (sameOrBigger) return file;

      const name = file.name.replace(/\.[^./\\]+$/, '') || 'imagen';
      return new File([blob], `${name}.webp`, { type: 'image/webp', lastModified: Date.now() });
    } finally {
      bitmap.close();
    }
  } catch {
    return file; // cualquier problema: se sube el original tal cual
  }
}

// ---------- Aviso de progreso ----------
let toast: HTMLDivElement | null = null;
function setStatus(text: string | null): void {
  if (text === null) {
    toast?.remove();
    toast = null;
    return;
  }
  if (!toast) {
    toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border-radius:8px;' +
      'background:#1f2937;color:#fff;font:14px/1.3 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);max-width:80vw';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
}

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

function isImageInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === 'file' && /image/i.test(el.accept || '');
}

async function onChange(event: Event): Promise<void> {
  const input = event.target;
  if (!isImageInput(input) || (event as any)[DONE]) return;
  const files = Array.from(input.files ?? []);
  if (!files.length) return;

  // Detiene el "change" original: se reemite abajo con los archivos ya convertidos.
  event.stopImmediatePropagation();

  pending++;
  try {
    const out: File[] = [];
    let before = 0;
    let after = 0;
    for (let i = 0; i < files.length; i++) {
      setStatus(`Optimizando imagen${files.length > 1 ? ` ${i + 1} de ${files.length}` : ''}…`);
      const optimized = await optimizeImage(files[i]);
      before += files[i].size;
      after += optimized.size;
      out.push(optimized);
    }
    const dt = new DataTransfer();
    out.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    setStatus(
      after < before
        ? `Imagen optimizada: ${kb(before)} → ${kb(after)}`
        : 'Imagen revisada: no se puede reducir sin perder calidad, se sube sin cambios.'
    );
    setTimeout(() => setStatus(null), 3000);
  } catch {
    setStatus(null);
  } finally {
    pending--;
    const again = new Event('change', { bubbles: true });
    (again as any)[DONE] = true;
    input.dispatchEvent(again);
  }
}

export function initImageOptimizer(): void {
  if (typeof document === 'undefined' || (window as any).__imageOptimizer) return;
  (window as any).__imageOptimizer = true;

  // Amplía el selector de archivos a más formatos justo antes de abrirse.
  document.addEventListener(
    'click',
    (e) => {
      if (isImageInput(e.target)) e.target.accept = PICKER_ACCEPT;
    },
    true
  );

  document.addEventListener('change', (e) => void onChange(e), true);

  // No dejar enviar un formulario mientras una imagen sigue procesándose.
  document.addEventListener(
    'submit',
    (e) => {
      if (pending > 0) {
        e.preventDefault();
        setStatus('Espera a que termine de optimizarse la imagen y vuelve a guardar.');
        setTimeout(() => pending === 0 && setStatus(null), 3000);
      }
    },
    true
  );
}

initImageOptimizer();
