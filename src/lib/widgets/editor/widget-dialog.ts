// Formularios del editor para crear y editar widgets. Cada tipo define sus
// campos; al aceptar se valida con el MISMO esquema que usa el servidor, así el
// autor ve el error en el momento y no al guardar el artículo.

import { EMBED_HOSTS, EMBED_RATIOS, MAX_GALLERY_IMAGES, START_FEN, WIDGET_LABELS, formatMovetext, normalizeWidget, parseGameText, suggestEmbedUrl, type RawWidget, type WidgetType } from '../schema';
import { add, h } from '../client/dom';

type Data = Record<string, string>;
interface Form {
  el: HTMLElement;
  /** Devuelve los datos crudos (claves sin "data-") o lanza Error con un mensaje para el autor. */
  read(): RawWidget;
}

const uid = (() => {
  let n = 0;
  return () => `wgf-${++n}`;
})();

function field(label: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, help?: string): HTMLElement {
  const id = uid();
  control.id = id;
  return h('div', { class: 'wg-field' }, h('label', { for: id }, label), control, help ? h('small', {}, help) : null);
}

const input = (value = '', attrs: Record<string, string> = {}) => {
  const el = h('input', { type: 'text', autocomplete: 'off', ...attrs });
  el.value = value;
  return el;
};
const textarea = (value = '', rows = 3, attrs: Record<string, string> = {}) => {
  const el = h('textarea', { rows: String(rows), spellcheck: 'false', ...attrs });
  el.value = value;
  return el;
};
const select = (options: [string, string][], value: string) => {
  const el = h('select', {}, ...options.map(([v, label]) => h('option', { value: v }, label)));
  el.value = value;
  return el;
};

// ---------- Tablero ----------
function boardForm(initial: Data): Form {
  const game = textarea(initial.moves ? formatMovetext(initial.fen ?? START_FEN, initial.moves.split(' ')) : '', 5, { placeholder: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' });
  const fen = input(initial.fen ?? '', { placeholder: 'Opcional' });
  const orientation = select([['white', 'Desde las blancas'], ['black', 'Desde las negras']], initial.orientation ?? 'white');
  const caption = input(initial.caption ?? '', { maxlength: '200', placeholder: 'Ej.: Posición tras 12…Bxh2+' });
  const el = h('div', {},
    field('Partida o jugadas', game, 'Pega un PGN (de Lichess o Chess.com) o escribe las jugadas. Déjalo vacío para mostrar solo una posición.'),
    field('Posición inicial (FEN)', fen, 'Opcional. Sin FEN se usa la posición de salida o la que traiga el PGN.'),
    field('Orientación', orientation),
    field('Pie de tablero', caption)
  );
  return {
    el,
    read() {
      const parsed = parseGameText(game.value, fen.value);
      if (!parsed.ok) throw new Error(parsed.error);
      return { fen: parsed.fen === START_FEN ? '' : parsed.fen, moves: parsed.moves.join(' '), orientation: orientation.value, caption: caption.value };
    },
  };
}

// ---------- Problema ----------
function puzzleForm(initial: Data): Form {
  const fen = input(initial.fen ?? '', { placeholder: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1' });
  const solution = textarea(initial.solution ?? '', 3, { placeholder: 'Ra8#' });
  const caption = input(initial.caption ?? '', { maxlength: '200', placeholder: 'Ej.: Mate en 2' });
  const hint = input(initial.hint ?? '', { maxlength: '200', placeholder: 'Opcional' });
  const el = h('div', {},
    field('Posición (FEN)', fen, 'Copia el FEN desde el análisis de Lichess o Chess.com. Mueve primero el bando que indique.'),
    field('Solución', solution, 'Todas las jugadas, tuyas y del rival, alternadas: 1. Qh7+ Kxh7 2. Rh3#. Si una jugada da mate, se acepta aunque no sea la de la solución.'),
    field('Pie del problema', caption),
    field('Pista', hint, 'Se muestra al pulsar “Pista”, junto a la pieza que debe moverse.')
  );
  return { el, read: () => ({ fen: fen.value, solution: solution.value, caption: caption.value, hint: hint.value }) };
}

// ---------- Trivia ----------
interface Q { q: string; options: string[]; answer: number; explain?: string }

function quizForm(initial: Data): Form {
  let saved: { title?: string; questions?: Q[] } = {};
  try {
    saved = initial.quiz ? JSON.parse(initial.quiz) : {};
  } catch { /* se empieza vacío */ }

  const title = input(saved.title ?? '', { maxlength: '120', placeholder: 'Opcional' });
  const list = h('div', { class: 'wg-qlist' });
  const cards: { el: HTMLElement; read(n: number): Q }[] = [];

  function addQuestion(q?: Q) {
    const group = uid();
    const text = textarea(q?.q ?? '', 2, { placeholder: 'Enunciado de la pregunta', 'aria-label': 'Enunciado' });
    const rows = Array.from({ length: 4 }, (_, i) => {
      const radio = h('input', { type: 'radio', name: group, 'aria-label': `Marcar la opción ${String.fromCharCode(65 + i)} como correcta` });
      radio.checked = q ? q.answer === i : i === 0;
      const opt = input(q?.options[i] ?? '', { maxlength: '150', placeholder: `Opción ${String.fromCharCode(65 + i)}`, 'aria-label': `Opción ${String.fromCharCode(65 + i)}` });
      return { radio, opt, el: h('div', { class: 'wg-optrow' }, radio, opt) };
    });
    const explain = input(q?.explain ?? '', { maxlength: '400', placeholder: 'Explicación (opcional, se muestra al responder)', 'aria-label': 'Explicación' });
    const remove = h('button', { type: 'button', class: 'wg-link-danger' }, 'Quitar pregunta');
    const el = h('fieldset', { class: 'wg-qcard' }, h('legend', {}, 'Pregunta'), text, h('p', { class: 'wg-hint' }, 'Marca la opción correcta. Las opciones vacías se ignoran.'), ...rows.map((r) => r.el), explain, remove);
    const card = {
      el,
      read(n: number): Q {
        const filled = rows.map((r, i) => ({ text: r.opt.value.trim(), correct: r.radio.checked, i })).filter((r) => r.text);
        const answer = filled.findIndex((r) => r.correct);
        if (answer < 0) throw new Error(`En la pregunta ${n}, marca como correcta una opción que tenga texto.`);
        return { q: text.value, options: filled.map((r) => r.text), answer, explain: explain.value };
      },
    };
    remove.addEventListener('click', () => {
      cards.splice(cards.indexOf(card), 1);
      el.remove();
      list.querySelectorAll('legend').forEach((lg, i) => (lg.textContent = `Pregunta ${i + 1}`));
    });
    cards.push(card);
    add(list, el);
    list.querySelectorAll('legend').forEach((lg, i) => (lg.textContent = `Pregunta ${i + 1}`));
  }

  (saved.questions?.length ? saved.questions : [undefined]).forEach((q) => addQuestion(q));
  const addBtn = h('button', { type: 'button', class: 'wg-btn' }, '+ Agregar pregunta');
  addBtn.addEventListener('click', () => addQuestion());

  return {
    el: h('div', {}, field('Título de la trivia', title), list, addBtn),
    read() {
      const questions = cards.map((c, i) => c.read(i + 1));
      return { quiz: JSON.stringify({ title: title.value, questions }) };
    },
  };
}

// ---------- Incrustar ----------
function embedForm(initial: Data): Form {
  const url = input(initial.src ?? '', { placeholder: 'https://lichess.org/…', inputmode: 'url' });
  const title = input(initial.title ?? '', { maxlength: '120', placeholder: 'Ej.: Partida completa en Lichess' });
  const ratio = select(EMBED_RATIOS.map((r) => [r, r] as [string, string]), initial.ratio ?? '16:9');
  const el = h('div', {},
    field('Dirección', url, `Sitios permitidos: ${Object.keys(EMBED_HOSTS).map((d) => d.replace(/^www\./, '')).join(', ')}. Puedes pegar el enlace normal de una partida de Lichess o de un video de YouTube.`),
    field('Título accesible', title, 'Describe el contenido para lectores de pantalla.'),
    field('Proporción', ratio)
  );
  return { el, read: () => ({ src: suggestEmbedUrl(url.value), title: title.value, ratio: ratio.value }) };
}

// ---------- Imagen / Galería ----------
interface GalleryEntry {
  key: string;
  alt: string;
  caption: string;
}

/** Sube un archivo al endpoint de imágenes sueltas; lanza con el mensaje del servidor si falla. */
async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
  const data = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
  if (!res.ok || !data.key) throw new Error(data.error ?? 'No se pudo subir la imagen.');
  return data.key;
}

function galleryForm(initial: Data): Form {
  let entries: GalleryEntry[] = [];
  try {
    const parsed = initial.images ? (JSON.parse(initial.images) as { key: string; alt?: string; caption?: string }[]) : [];
    entries = parsed.map((im) => ({ key: im.key, alt: im.alt ?? '', caption: im.caption ?? '' }));
  } catch {
    entries = [];
  }

  const list = h('div', { class: 'wg-glist' });
  const status = h('p', { class: 'wg-hint', 'aria-live': 'polite' });
  let pending = 0;

  function renderList() {
    list.replaceChildren();
    entries.forEach((entry, i) => {
      const thumb = h('img', { class: 'wg-gcard-thumb', src: `/api/img/${entry.key}`, alt: '' });
      const altInput = input(entry.alt, { maxlength: '300', placeholder: 'Describe la imagen (para accesibilidad)' });
      const capInput = input(entry.caption, { maxlength: '200', placeholder: 'Pie de foto (opcional, ej.: crédito)' });
      const remove = h('button', { type: 'button', class: 'wg-link-danger' }, 'Quitar');
      altInput.addEventListener('input', () => (entry.alt = altInput.value));
      capInput.addEventListener('input', () => (entry.caption = capInput.value));
      remove.addEventListener('click', () => {
        entries = entries.filter((e) => e !== entry);
        renderList();
      });
      add(
        list,
        h(
          'div',
          { class: 'wg-gcard' },
          thumb,
          h('div', { class: 'wg-gcard-fields' }, field(`Descripción de la imagen ${i + 1}`, altInput), field('Pie de foto', capInput), remove)
        )
      );
    });
  }
  renderList();

  const fileInput = input('', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: '' }) as HTMLInputElement;
  fileInput.className = 'wg-sr';
  const addBtn = h('button', { type: 'button', class: 'wg-btn' }, '+ Agregar imágenes');
  addBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    if (!files.length) return;
    if (entries.length + files.length > MAX_GALLERY_IMAGES) {
      status.textContent = `Como máximo ${MAX_GALLERY_IMAGES} imágenes por galería.`;
      return;
    }
    pending += files.length;
    addBtn.disabled = true;
    for (const file of files) {
      status.textContent = `Subiendo ${file.name}…`;
      try {
        const key = await uploadImageFile(file);
        entries.push({ key, alt: '', caption: '' });
        renderList();
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'No se pudo subir una imagen.';
      } finally {
        pending--;
      }
    }
    if (pending <= 0) {
      addBtn.disabled = false;
      status.textContent = '';
    }
  });

  const el = h(
    'div',
    {},
    list,
    addBtn,
    fileInput,
    status,
    h('p', { class: 'wg-hint' }, `Hasta ${MAX_GALLERY_IMAGES} imágenes. Una sola se ve a ancho completo, con su pie debajo; varias arman una cuadrícula que se amplía al tocarla.`)
  );

  return {
    el,
    read() {
      if (pending > 0) throw new Error('Esperá a que terminen de subirse las imágenes.');
      if (entries.length === 0) throw new Error('Agrega al menos una imagen.');
      return { images: JSON.stringify(entries.map((e) => ({ key: e.key, alt: e.alt, caption: e.caption }))) };
    },
  };
}

const FORMS: Record<WidgetType, (initial: Data) => Form> = {
  'chess-board': boardForm,
  'chess-puzzle': puzzleForm,
  quiz: quizForm,
  embed: embedForm,
  gallery: galleryForm,
};

/**
 * Abre el formulario del widget. Resuelve con los atributos canónicos
 * (listos para guardar en el nodo) o con null si el autor cancela.
 */
export function openWidgetDialog(type: WidgetType, initial: Data = {}): Promise<Data | null> {
  return new Promise((resolve) => {
    const form = FORMS[type](initial);
    const editing = Object.keys(initial).length > 0;
    const error = h('p', { class: 'wg-dialog-error', role: 'alert', hidden: '' });
    const cancel = h('button', { type: 'button', class: 'wg-btn' }, 'Cancelar');
    const submit = h('button', { type: 'submit', class: 'wg-btn wg-btn-primary' }, editing ? 'Guardar cambios' : 'Insertar');
    const body = h('form', { method: 'dialog', class: 'wg-dialog-form' },
      h('h3', {}, `${editing ? 'Editar' : 'Insertar'}: ${WIDGET_LABELS[type].toLowerCase()}`),
      form.el, error, h('div', { class: 'wg-dialog-actions' }, cancel, submit));
    const dialog = h('dialog', { class: 'wg-dialog' }, body);

    let result: Data | null = null;
    const finish = () => {
      dialog.close();
    };
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    cancel.addEventListener('click', finish);
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        const normalized = normalizeWidget(type, form.read());
        if (!normalized.ok) throw new Error(normalized.error);
        result = normalized.attrs;
        finish();
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : 'No se pudo validar el widget.';
        error.hidden = false;
      }
    });

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}