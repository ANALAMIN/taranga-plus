export function friendlyStreamError(err: unknown): string {
  const e = err as { type?: string; details?: string; message?: string } | undefined;
  const type = e?.type ?? '';
  const details = e?.details ?? '';

  if (type === 'networkError') {
    if (details?.includes('404')) return 'Channel unavailable';
    if (details?.includes('timeout')) return 'Connection timeout';
    if (details?.includes('503')) return 'Server overloaded';
    return 'Cannot reach server';
  }
  if (type === 'mediaError') {
    if (details?.includes('parse')) return 'Format not supported';
    return 'Stream error';
  }
  return 'Stream unavailable';
}
