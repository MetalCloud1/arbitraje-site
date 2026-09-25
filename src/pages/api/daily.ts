import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { saveDailyChallenge } from '../../lib/daily';

export const prerender = false;

// Protegido por middleware.ts (prefijo '/api/daily' agregado a isProtectedApi),
// así que si llegamos hasta acá ya hay sesión de admin válida.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const result = await saveDailyChallenge(env.DB, {
    fen: String(form.get('fen') ?? ''),
    solution: String(form.get('solution') ?? ''),
    caption: String(form.get('caption') ?? ''),
    hint: String(form.get('hint') ?? ''),
    quiz: String(form.get('quiz') ?? ''),
  });

  if (!result.ok) {
    return redirect('/admin/diario?error=' + encodeURIComponent(result.error));
  }
  return redirect('/admin/diario?updated=1');
};
