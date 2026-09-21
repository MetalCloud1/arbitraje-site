// Validación del formulario público de postulación de clubes y armado del
// correo que recibe un humano para revisar. Deliberadamente separado de
// lib/postulacion.ts (árbitros/entrenadores): los campos de un club
// (país, dirección, contacto, días, modalidad) no comparten vocabulario
// con el de un título/ELO, y forzarlos al mismo validador solo generaría
// ramas condicionales sin ningún campo en común. Igual que ese archivo,
// esto NO escribe en la base: solo valida y arma un email. El club se da
// de alta a mano desde /admin después de que un humano revisa el correo.

import { PAISES_CLUBES } from './paises';
import { DIAS_SEMANA, MODALIDADES, type Modalidad } from './clubes';

const NOMBRE_RE = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ0-9' .-]{3,120}$/;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,24}$/;
const TELEFONO_RE = /^[0-9+() -]{7,20}$/;
const URL_RE = /^https?:\/\/[^\s<>]{3,300}$/;

function hasControlCharsOrAngles(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001F\u007F<>]/.test(s);
}

function isSingleLine(s: string): boolean {
  // Campos que van a un header de email (o al asunto) no pueden traer
  // saltos de línea: es la puerta clásica a la inyección de headers.
  return !/[\r\n]/.test(s);
}

export interface ClubPostulacionInput {
  nombre: string;
  pais: string;
  direccion: string; // texto libre, puede ir vacío si el club es solo virtual
  telefono: string; // '' si no aplica
  whatsapp: string; // '' si no aplica
  email: string;
  sitioWeb: string; // '' si no aplica
  dias: string[];
  modalidad: Modalidad;
  bio: string;
}

export type ClubPostulacionValidationResult =
  | { ok: true; data: ClubPostulacionInput }
  | { ok: false; error: string };

/** Extrae y valida los campos del formulario. No toca la base de datos. */
export function validateClubPostulacion(form: FormData): ClubPostulacionValidationResult {
  const nombre = String(form.get('nombre') ?? '').trim();
  if (!NOMBRE_RE.test(nombre) || !isSingleLine(nombre)) {
    return { ok: false, error: 'El nombre del club debe tener entre 3 y 120 caracteres, sin símbolos raros.' };
  }

  const pais = String(form.get('pais') ?? '').trim();
  if (!(PAISES_CLUBES as readonly string[]).includes(pais)) {
    return { ok: false, error: 'Selecciona un país válido.' };
  }

  const modalidadRaw = String(form.get('modalidad') ?? '').trim();
  const modalidadValida = MODALIDADES.some((m) => m.value === modalidadRaw);
  if (!modalidadValida) {
    return { ok: false, error: 'Selecciona una modalidad válida.' };
  }
  const modalidad = modalidadRaw as Modalidad;

  const direccion = String(form.get('direccion') ?? '').trim();
  if (modalidad !== 'virtual' && !direccion) {
    return { ok: false, error: 'La dirección es obligatoria para un club presencial o de modalidad mixta.' };
  }
  if (direccion.length > 300 || hasControlCharsOrAngles(direccion) || !isSingleLine(direccion)) {
    return { ok: false, error: 'La dirección no tiene un formato válido.' };
  }

  const diasForm = form
    .getAll('dias')
    .map((v) => String(v))
    .filter((v): v is (typeof DIAS_SEMANA)[number] => (DIAS_SEMANA as readonly string[]).includes(v));
  if (diasForm.length === 0) {
    return { ok: false, error: 'Selecciona al menos un día en el que imparten clases.' };
  }
  const dias = DIAS_SEMANA.filter((d) => diasForm.includes(d));

  const telefono = String(form.get('telefono') ?? '').trim();
  if (telefono && (!TELEFONO_RE.test(telefono) || !isSingleLine(telefono))) {
    return { ok: false, error: 'El teléfono no tiene un formato válido.' };
  }

  const whatsapp = String(form.get('whatsapp') ?? '').trim();
  if (whatsapp && (!TELEFONO_RE.test(whatsapp) || !isSingleLine(whatsapp))) {
    return { ok: false, error: 'El WhatsApp no tiene un formato válido.' };
  }

  const email = String(form.get('email') ?? '').trim();
  if (email.length > 254 || !EMAIL_RE.test(email) || !isSingleLine(email)) {
    return { ok: false, error: 'El correo electrónico no tiene un formato válido.' };
  }

  const sitioWeb = String(form.get('sitio_web') ?? '').trim();
  if (sitioWeb && (!URL_RE.test(sitioWeb) || !isSingleLine(sitioWeb))) {
    return { ok: false, error: 'El sitio web o red social debe ser un link válido (https://...).' };
  }

  if (!telefono && !whatsapp) {
    return { ok: false, error: 'Deja al menos un teléfono o WhatsApp de contacto.' };
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
    data: { nombre, pais, direccion, telefono, whatsapp, email, sitioWeb, dias, modalidad, bio },
  };
}

const MODALIDAD_LABEL: Record<Modalidad, string> = {
  presencial: 'Presencial',
  virtual: 'Virtual',
  ambas: 'Presencial y virtual',
};

export interface ClubPostulacionEmailContext {
  data: ClubPostulacionInput;
  ip: string;
  userAgent: string;
}

/** Arma el correo que recibe un humano para revisar la postulación de un club. */
export function buildClubPostulacionEmail(ctx: ClubPostulacionEmailContext): { subject: string; text: string } {
  const { data, ip, userAgent } = ctx;

  const subject = `Nueva postulación de club: ${data.nombre}`;

  const text = `Directorio: Clubes
Tipo: Registro nuevo

Nombre del club: ${data.nombre}
País: ${data.pais}
Dirección: ${data.direccion || '(no proporcionada, club virtual)'}
Modalidad: ${MODALIDAD_LABEL[data.modalidad]}
Días que imparten clases: ${data.dias.join(', ')}

Teléfono: ${data.telefono || '(no proporcionado)'}
WhatsApp: ${data.whatsapp || '(no proporcionado)'}
Email de contacto: ${data.email}
Sitio web / red social: ${data.sitioWeb || '(no proporcionado)'}

Descripción:
${data.bio}

---
IP del remitente: ${ip}
User-Agent: ${userAgent}
Fecha: ${new Date().toISOString()}
`;

  return { subject, text };
}
