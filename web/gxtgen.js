// GXT (GTA2 text) reading and writing, matching the engine's loader exactly
// (research/gta2_re/Source/text_0x14.cpp: Load_5B5E90, TKEY_Load_5B5960,
// TDAT_Offsets2Strings_5B59B0, TKeyFind_5B5A50).
//
// File layout (docs: gtamods.com/wiki/GXT, GrandTheftWiki):
//   0x00 char[4] "GBL" + language letter, uppercase ('E', 'S', 'F', ...)
//   0x04 u16     version, always 100 (6-byte header, no padding)
//   chunk "TKEY": u32 size, then size/12 entries of
//     u32 offset (byte offset into TDAT) + char key[8] (NUL-terminated) + u32 pad
//   chunk "TDAT": u32 size, then UTF-16LE NUL-terminated strings
//
// The loader looks keys up with bsearch/strcmp, so TKEY entries must be sorted
// by key with strcmp (byte) order. Text must stay Latin-1: anything above is
// remapped to '?' by the engine's font layer (text_0x14.cpp RemapExtendedChar).

const HEADER_SIZE = 6;
const TKEY_ENTRY_SIZE = 12;
const KEY_SIZE = 8;
const VERSION = 100;

/** strcmp order over ASCII keys (the loader's bsearch depends on it). */
function byKey(a, b) {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function readU32(bytes, at) {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

function readAscii(bytes, at, length) {
  let out = '';
  for (let i = 0; i < length && bytes[at + i]; i++) out += String.fromCharCode(bytes[at + i]);
  return out;
}

/** Reads a UTF-16LE NUL-terminated string at a byte offset. */
function readWide(bytes, at) {
  let out = '';
  for (let i = at; i + 1 < bytes.length; i += 2) {
    const unit = bytes[i] | (bytes[i + 1] << 8);
    if (!unit) break;
    out += String.fromCharCode(unit);
  }
  return out;
}

/**
 * Parses a GXT file.
 * @returns {{letter: string, entries: Array<{key: string, text: string}>}}
 *   letter is lowercase ('e', 's', 'f'); entries keep file order.
 */
export function parseGxt(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < HEADER_SIZE || readAscii(data, 0, 3) !== 'GBL') throw new Error('not a GXT file (missing GBL header)');
  const version = data[4] | (data[5] << 8);
  if (version !== VERSION) throw new Error(`unsupported GXT version ${version}`);
  const letter = String.fromCharCode(data[3]).toLowerCase();

  let tkey = null;
  let tdat = null;
  for (let at = HEADER_SIZE; at + 8 <= data.length;) {
    const type = readAscii(data, at, 4);
    const size = readU32(data, at + 4);
    const body = at + 8;
    // A size that runs past EOF would make the loops below read garbage (or spin
    // over a huge bogus chunk): reject it instead of trusting the file.
    if (body + size > data.length) throw new Error('GXT chunk runs past the end of the file');
    if (type === 'TKEY') tkey = { at: body, size };
    else if (type === 'TDAT') tdat = { at: body, size };
    at = body + size;
  }
  if (!tkey || !tdat) throw new Error('GXT file needs TKEY and TDAT chunks');
  if (tkey.size % TKEY_ENTRY_SIZE) throw new Error('TKEY chunk size is not a multiple of 12');

  const entries = [];
  for (let at = tkey.at; at < tkey.at + tkey.size; at += TKEY_ENTRY_SIZE) {
    const offset = readU32(data, at);
    entries.push({ key: readAscii(data, at + 4, KEY_SIZE - 1), text: readWide(data, tdat.at + offset) });
  }
  return { letter, entries };
}

/** Builds a GXT file (sorted keys, UTF-16LE text) for one language letter. */
export function buildGxt(letter, entries) {
  const sorted = [...entries].sort(byKey);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].key === sorted[i - 1].key) throw new Error(`duplicate GXT key "${sorted[i].key}"`);
  }

  const texts = []; // UTF-16LE bytes, one NUL-terminated string per entry
  let dataSize = 0;
  for (const { text } of sorted) {
    const chunk = new Uint8Array(text.length * 2 + 2);
    for (let i = 0; i < text.length; i++) {
      chunk[i * 2] = text.charCodeAt(i) & 0xff;
      chunk[i * 2 + 1] = text.charCodeAt(i) >> 8;
    }
    texts.push({ chunk, offset: dataSize });
    dataSize += chunk.length;
  }

  const out = new Uint8Array(HEADER_SIZE + 8 + sorted.length * TKEY_ENTRY_SIZE + 8 + dataSize);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 3; i++) out[i] = 'GBL'.charCodeAt(i);
  out[3] = letter.toUpperCase().charCodeAt(0);
  view.setUint16(4, VERSION, true);

  let at = HEADER_SIZE;
  for (let i = 0; i < 4; i++) out[at + i] = 'TKEY'.charCodeAt(i);
  view.setUint32(at + 4, sorted.length * TKEY_ENTRY_SIZE, true);
  at += 8;
  sorted.forEach(({ key }, i) => {
    if (key.length > KEY_SIZE - 1) throw new Error(`GXT key "${key}" is longer than ${KEY_SIZE - 1} characters`);
    view.setUint32(at, texts[i].offset, true);
    for (let c = 0; c < key.length; c++) out[at + 4 + c] = key.charCodeAt(c);
    at += TKEY_ENTRY_SIZE;
  });
  for (let i = 0; i < 4; i++) out[at + i] = 'TDAT'.charCodeAt(i);
  view.setUint32(at + 4, dataSize, true);
  at += 8;
  for (const { chunk } of texts) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// GXT text stores accented letters as the game font's own character codes, not Latin-1: Rockstar's
// s.gxt has 166 for "ó" and 176 for "¡". The game draws those codes as they are, so Latin-1 text
// (É is 201) came out as other letters. This is the engine's own Latin-1 -> font table
// (text_0x14.cpp kExtendedWesternCharMap, used for typed names), for characters 128-255; 0 has no
// glyph and becomes '?', as the engine does.
const FONT_CODES = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 176, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 175, 128, 129, 130, 0, 131, 0, 132, 133, 134, 135, 136, 137, 138, 139,
  140, 141, 0, 173, 142, 143, 144, 0, 145, 0, 0, 146, 147, 148, 149, 0, 0, 150, 151, 152, 153, 0, 154, 0, 155, 156,
  157, 158, 159, 160, 161, 162, 163, 164, 0, 174, 165, 166, 167, 0, 168, 0, 0, 169, 170, 171, 172, 0, 0, 0,
];

/** Text as a GXT file stores it: characters above 127 become the font's codes. */
export function toFontCodes(text) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    out += c < 128 ? ch : String.fromCharCode((c < 256 && FONT_CODES[c - 128]) || 63);
  }
  return out;
}

/**
 * Copies a GXT file, replacing the text of the keys the translation table
 * covers; every other key keeps its original text (English fallback).
 */
export function translateGxt(bytes, letter, translations) {
  const { entries } = parseGxt(bytes);
  const out = entries.map(({ key, text }) => ({ key, text: Object.hasOwn(translations, key) ? toFontCodes(translations[key]) : text }));
  return buildGxt(letter, out);
}
