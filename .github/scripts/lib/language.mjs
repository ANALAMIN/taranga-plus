/**
 * Language detection and filtering (spec §4.3).
 *
 * Allowed in catalog: bn, hi, en, ur. Dropped: Tamil, Telugu, Malayalam,
 * Kannada, Punjabi, Marathi, and other regional Indian languages.
 */

// M3U tvg-language codes (often ISO 639-2/3) → our short codes.
// Non-identifier keys MUST be quoted.
const LANG_CODE = {
  ben: 'bn', 'ben_(bangla)': 'bn', bang: 'bn', bengali: 'bn',
  hin: 'hi', hindi: 'hi',
  eng: 'en', english: 'en',
  urd: 'ur', urdu: 'ur',
};

// Unicode block → rejected-language code. These are the ones we DROP.
const REJECTED_BLOCKS = [
  ['\u0B80', '\u0BFF', 'tam'], // Tamil
  ['\u0C00', '\u0C7F', 'tel'], // Telugu
  ['\u0D00', '\u0D7F', 'mal'], // Malayalam
  ['\u0C80', '\u0CFF', 'kan'], // Kannada
  ['\u0A00', '\u0A7F', 'pan'], // Punjabi (Gurmukhi)
  ['\u0900', '\u097F', null],  // Devanagari → not rejected (Hindi/Marathi both use it; resolved by keyword)
];

// Bengali block kept (allowed).
const BENGALI_RANGE = ['\u0980', '\u09FF'];

function inRange(ch, lo, hi) {
  return ch >= lo && ch <= hi;
}

/**
 * @param {{language?: string, name: string}} channel
 * @returns {string} short code: 'bn'|'hi'|'en'|'ur' for kept langs,
 *                   or a rejected code ('tam','tel','mal','kan','pan').
 */
export function detectLanguage({ language, name }) {
  // 1. tvg-language attribute (highest priority).
  if (language) {
    const first = language.split(/[;,/]/)[0].trim().toLowerCase();
    if (LANG_CODE[first]) return LANG_CODE[first];
  }

  // 2. Rejected Unicode blocks (Tamil/Telugu/Malayalam/Kannada/Punjabi).
  for (const ch of name) {
    for (const [lo, hi, code] of REJECTED_BLOCKS) {
      if (code && inRange(ch, lo, hi)) return code; // rejected
    }
    // Bengali Unicode → bn (but keep scanning in case of mixed scripts).
    if (inRange(ch, BENGALI_RANGE[0], BENGALI_RANGE[1])) return 'bn';
  }

  // 3. Latin-script keyword heuristics.
  const n = name.toLowerCase();
  if (/\b(dd|doordarshan)\b/.test(n)) return 'hi';
  if (/\b(bbc|cnn|sky|al jazeera|france24|rt news|dw|abc|nbc|cbs)\b/.test(n)) return 'en';
  if (/\b(geo|ary|hum|ptv|express|dunya|samaa)\b/.test(n)) return 'ur';

  // 4. Default: 'en' is the safe fallback (won't be dropped).
  return 'en';
}

const ALLOWED = new Set(['bn', 'hi', 'en', 'ur']);

export function isLanguageAllowed(code) {
  return ALLOWED.has(code);
}
