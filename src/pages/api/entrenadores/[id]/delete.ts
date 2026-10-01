import type { APIRoute } from 'astro';

export const prerender = false;

// Endpoint retirado. Antes borraba contenido de forma definitiva desde el
// admin normal; ahora eso vive solo en la zona restringida (papelera con
// restauración, ver lib/papelera.ts y /api/zona/accion). Se deja este archivo
// respondiendo 410 -- en vez de borrarlo -- para que, aunque alguien
// conozca la URL vieja, no haga nada. Es seguro eliminar el archivo.
export const ALL: APIRoute = () =>
  new Response(
    JSON.stringify({ error: 'Esta acción ya no está disponible aquí. Ahora se hace desde la zona restringida.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  );
