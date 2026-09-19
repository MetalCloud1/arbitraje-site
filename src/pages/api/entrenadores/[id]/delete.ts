import type { APIRoute } from 'astro';
import { deleteEntrenador } from '../../../../lib/entrenadores';
import { deleteImage } from '../../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin/entrenadores?error=' + encodeURIComponent('Identificador de entrenador inválido.'));
  }

  const deleted = await deleteEntrenador(env.DB, id);
  if (deleted?.foto_key) {
    await deleteImage(env.IMAGES, deleted.foto_key);
  }

  return redirect('/admin/entrenadores?deleted=1');
};
