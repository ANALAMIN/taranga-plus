export function friendlyShakaError(err: unknown): string {
  const e = err as { code?: number; category?: number; message?: string } | undefined;
  const code = e?.code ?? 0;
  const cat = e?.category ?? 0;
  if (cat === 1) {
    if (code === 1002) return 'Channel unavailable';
    if (code === 1006) return 'Connection lost';
    if (code === 1001) return 'Network error';
    return 'Cannot reach server';
  }
  if (cat === 4) {
    if (code === 4053) return 'Format not supported by player';
    if (code === 4012) return 'Content not playable (DRM)';
    return 'Stream error';
  }
  return 'Stream unavailable';
}
