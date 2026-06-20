/**
 * Reject URLs that carry committed secrets in the query string. Catches the
 * `?akes=` (JWT bearer) pattern and JWT-shaped query values generally, so a
 * leaked signed token can never be baked back into the catalog. Never silently
 * strip — reject, so the source of the leak surfaces during validation.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function looksLikeSecretUrl(url) {
  try {
    const u = new URL(url);
    for (const [key, value] of u.searchParams.entries()) {
      const lk = key.toLowerCase();
      if (lk === 'akes' || lk.includes('token') || lk.includes('key') || lk.includes('sig')) {
        return true;
      }
      // Three base64url chunks separated by dots = JWT (eyJ...).eyJ....
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
