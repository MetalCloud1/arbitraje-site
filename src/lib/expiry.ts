export const EXPIRY_OPTIONS = [
  { value: 'none', label: 'Nunca (mantener indefinidamente)' },
  { value: '7', label: 'Borrar automáticamente en 7 días' },
  { value: '14', label: 'Borrar automáticamente en 14 días' },
  { value: '30', label: 'Borrar automáticamente en 30 días' },
  { value: '90', label: 'Borrar automáticamente en 90 días' },
] as const;

export function computeExpiresAt(option: string): string | null {
  const days = Number(option);
  if (!days || Number.isNaN(days)) return null;
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

/** Para preseleccionar el <select> al editar, en base al expires_at guardado. */
export function daysUntil(expiresAt: string | null): string {
  if (!expiresAt) return 'none';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  const closest = [7, 14, 30, 90].reduce((a, b) =>
    Math.abs(b - diffDays) < Math.abs(a - diffDays) ? b : a
  );
  return String(closest);
}
