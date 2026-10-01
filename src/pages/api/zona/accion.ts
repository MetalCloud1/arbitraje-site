import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import {
  esTipo,
  TIPOS,
  moverAPapelera,
  restaurar,
  eliminarDefinitivo,
  programarEliminacion,
  moverVencidosAPapelera,
} from '../../../lib/papelera';
import { deleteImage } from '../../../lib/images';

export const prerender = false;

// Única puerta de entrada para quitar contenido del sitio. El middleware ya
// verificó sesión admin + segundo candado antes de llegar acá (/api/zona/*).
//
//   papelera   -> oculta el contenido (soft delete), sin borrar nada
//   restaurar  -> lo vuelve a mostrar
//   eliminar   -> borrado DEFINITIVO; solo para lo que ya está en la papelera
//                 y escribiendo ELIMINAR; recién ahí se borra su imagen de R2
//   programar  -> (artículos) fija/quita la fecha en que pasa a la papelera
//   vencidos   -> (artículos) manda a la papelera los que ya cumplieron fecha
const BASE = '/admin/zona-restringida';
const OPCIONES_PROGRAMAR = new Set(['none', '7', '14', '30', '90']);

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const accion = String(form.get('accion') ?? '');
  const tipoRaw = form.get('tipo');
  const tipo = esTipo(tipoRaw) ? tipoRaw : 'articulos';

  const volver = (params: Record<string, string>) =>
    redirect(`${BASE}?${new URLSearchParams({ tipo, ...params }).toString()}`);

  try {
    if (accion === 'vencidos') {
      if (tipo !== 'articulos') return volver({ error: 'Acción no válida.' });
      const n = await moverVencidosAPapelera(env.DB);
      return volver({ ok: `${n} artículo(s) vencido(s) enviado(s) a la papelera.` });
    }

    const id = Number(form.get('id'));
    if (!Number.isInteger(id) || id <= 0) return volver({ error: 'Identificador inválido.' });
    const nombre = TIPOS[tipo].singular;

    switch (accion) {
      case 'papelera': {
        const hecho = await moverAPapelera(env.DB, tipo, id);
        return hecho
          ? volver({ ok: `Enviado a la papelera. Se puede restaurar cuando quieras.` })
          : volver({ error: `No se encontró ese ${nombre} (o ya estaba en la papelera).` });
      }

      case 'restaurar': {
        const hecho = await restaurar(env.DB, tipo, id);
        return hecho
          ? volver({ ok: 'Restaurado: vuelve a estar visible en el sitio.' })
          : volver({ error: `No se encontró ese ${nombre} en la papelera.` });
      }

      case 'eliminar': {
        const confirmar = String(form.get('confirmar') ?? '').trim().toUpperCase();
        if (confirmar !== 'ELIMINAR') {
          return volver({ error: 'Para eliminar definitivamente hay que escribir ELIMINAR.', purgar: String(id) });
        }
        const borrado = await eliminarDefinitivo(env.DB, tipo, id);
        if (!borrado) return volver({ error: `Ese ${nombre} no está en la papelera (solo se elimina lo que ya está ahí).` });
        // La imagen se borra DESPUÉS de que la fila ya no existe: si algo falla antes, no se pierde nada.
        await deleteImage(env.R2_IMAGES, borrado.imagen);
        return volver({ ok: 'Eliminado definitivamente.' });
      }

      case 'programar': {
        if (tipo !== 'articulos') return volver({ error: 'Solo los artículos admiten eliminación programada.' });
        const opcion = String(form.get('expires_option') ?? '');
        if (!OPCIONES_PROGRAMAR.has(opcion)) return volver({ error: 'Elige una opción de programación.' });
        const hecho = await programarEliminacion(env.DB, id, opcion);
        return hecho
          ? volver({ ok: opcion === 'none' ? 'Programación quitada.' : `Programado: pasará a la papelera en ${opcion} días.` })
          : volver({ error: 'No se encontró ese artículo.' });
      }

      default:
        return volver({ error: 'Acción no válida.' });
    }
  } catch (err) {
    console.error('Error en /api/zona/accion:', err);
    return volver({ error: 'Ocurrió un error inesperado. No se hizo ningún cambio.' });
  }
};
