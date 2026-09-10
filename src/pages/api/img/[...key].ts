import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const key = params.key;

  if (!key) {
    return new Response('No encontrado', { status: 404 });
  }

  const object = await env.IMAGES.get(key);
  if (!object) {
    return new Response('No encontrado', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
    },
  });
};
