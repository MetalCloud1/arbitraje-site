import type { APIRoute } from 'astro';
import { deleteArbitro } from '../../../../lib/arbitros';
import { deleteImage } from '../../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin/arbitros?error=' + encodeURIComponent('Identificador de árbitro inválido.'));
  }

  const deleted = await deleteArbitro(env.DB, id);
  if (deleted?.foto_key) {
    await deleteImage(env.IMAGES, deleted.foto_key);
  }

  return redirect('/admin/arbitros?deleted=1');
};
