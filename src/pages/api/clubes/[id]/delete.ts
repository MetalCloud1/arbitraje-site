import type { APIRoute } from 'astro';

export const prerender = false;

// BYPASS TEMPORAL: la eliminación está desactivada. Este endpoint no toca la
// base de datos ni R2; solo devuelve al panel con un aviso. Se puede borrar el
// archivo cuando el sistema de papelera esté desplegado.
export const POST: APIRoute = async ({ redirect }) => {
  return redirect('/admin/clubes?error=' + encodeURIComponent('La eliminación está desactivada temporalmente. No se borró nada.'), 303);
};
