import type { APIRoute } from 'astro';
import { getArticleById, updateArticle, slugExists } from '../../../lib/db';
import { slugify, sanitizeHtml, estimateReadMinutes, excerptFromHtml } from '../../../lib/text';
import { uploadCoverImage, deleteImage } from '../../../lib/images';
import { computeExpiresAt } from '../../../lib/expiry';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const env = locals.runtime.env;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin?error=' + encodeURIComponent('Identificador de artículo inválido.'));
  }
  const existing = await getArticleById(env.DB, id);

  if (!existing) {
    return redirect('/admin?error=' + encodeURIComponent('Artículo no encontrado.'));
  }

  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const publishedAt = String(form.get('published_at') ?? '').trim() || existing.published_at;
  const expiresOption = String(form.get('expires_option') ?? 'none');
  const contentHtmlRaw = String(form.get('content_html') ?? '');
  let excerpt = String(form.get('excerpt') ?? '').trim();
  const coverFile = form.get('cover') as File | null;
  const removeCover = form.get('remove_cover') === 'on';

  if (!title || !category || !contentHtmlRaw.trim()) {
    return redirect(`/admin/editar/${id}?error=` + encodeURIComponent('Título, categoría y contenido son obligatorios.'));
  }

  const contentHtml = sanitizeHtml(contentHtmlRaw);
  if (!excerpt) excerpt = excerptFromHtml(contentHtml);

  let slug = existing.slug;
  const newSlug = slugify(title);
  if (newSlug !== existing.slug && !(await slugExists(env.DB, newSlug, id))) {
    slug = newSlug;
  }

  let coverKey = existing.cover_key;
  if (coverFile && coverFile.size > 0) {
    try {
      const uploaded = await uploadCoverImage(env.IMAGES, coverFile);
      await deleteImage(env.IMAGES, existing.cover_key);
      coverKey = uploaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la imagen.';
      return redirect(`/admin/editar/${id}?error=` + encodeURIComponent(msg));
    }
  } else if (removeCover && existing.cover_key) {
    await deleteImage(env.IMAGES, existing.cover_key);
    coverKey = null;
  }

  await updateArticle(env.DB, id, {
    slug,
    title,
    category,
    excerpt,
    content_html: contentHtml,
    cover_key: coverKey,
    read_minutes: estimateReadMinutes(contentHtml),
    published_at: publishedAt,
    expires_at: computeExpiresAt(expiresOption),
  });

  return redirect(`/admin?updated=${id}`);
};
