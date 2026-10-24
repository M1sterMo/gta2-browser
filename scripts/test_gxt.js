#!/usr/bin/env node
// Round-trip test for web/gxtgen.js and web/gxt-translations.js, with a
// synthetic GXT (this environment has no game data). Run: node scripts/test_gxt.js
//
// The web/*.js files are browser ES modules and the repo has no package.json,
// so they are loaded through data: URLs, which are always ESM.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function loadModule(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

// A fake English table: UI keys, one accented string, one long string, and a
// key our translations deliberately do not cover (English fallback).
const ENGLISH = [
  { key: 'play', text: 'PLAY' },
  { key: 'quit', text: 'QUIT' },
  { key: 'sure', text: 'ARE YOU SURE?' },
  { key: 'mfail', text: 'JOB FAILED!' },
  { key: 'pscore', text: 'Target Score: %d' },
  { key: 'svdone', text: 'n!#Your #status# is #saved#!#' },
  { key: 'caf\u00e9', text: 'Caf\u00e9 cr\u00e8me' }, // Latin-1 text
  { key: 'zzz9', text: 'UNTRANSLATED FALLBACK' },
  { key: 'long0', text: 'A quite long HUD string with punctuation, numbers 123 and a #hash#.' },
];

const FAKE_ES = { play: 'JUGAR', mfail: '¡TRABAJO FALLIDO!', pscore: 'Puntuación objetivo: %d', zzz9: 'NO TOCAR' };

// English source text of every translation-table key that carries printf
// placeholders: es and fr must use the same specifiers as the original text.
const PLACEHOLDER_EN = {
  comms1: '%s has left the game!',
  nspraya: 'n!Not enough money! You need #$%d#.',
  sdone: 'n!There you go! Nice colour. That will be #$%d#.',
  cdone: "n!It's clean: the plates have been changed. That will be #$%d#.",
  bdone: 'n!The vehicle is rigged! That will be #$%d#.',
  pscore: 'Target Score: %d',
  pgmiss: 'Jobs passed for %s: %d/%d',
  pmiss: 'Jobs passed: %d/%d',
  psec: 'Kill Frenzies passed: %d/%d',
  pbon: 'Tokens collected: %d/%d',
};

function u16(bytes, at) {
  return bytes[at] | (bytes[at + 1] << 8);
}

function ascii(bytes, at, length) {
  let out = '';
  for (let i = 0; i < length && bytes[at + i]; i++) out += String.fromCharCode(bytes[at + i]);
  return out;
}

function strcmp(a, b) {
  for (let i = 0; ; i++) {
    const x = i < a.length ? a.charCodeAt(i) : 0;
    const y = i < b.length ? b.charCodeAt(i) : 0;
    if (x !== y) return x < y ? -1 : 1;
    if (!x) return 0;
  }
}

/** Checks what the engine's loader (text_0x14.cpp) requires of a GXT file. */
function assertLoaderShape(bytes, letter) {
  assert.strictEqual(ascii(bytes, 0, 4), 'GBL' + letter.toUpperCase(), 'header must be GBL + uppercase letter');
  assert.strictEqual(u16(bytes, 4), 100, 'version must be 100');
  let at = 6;
  let tkeySize = -1;
  let tdatSize = -1;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4);
    const size = (bytes[at + 4] | (bytes[at + 5] << 8) | (bytes[at + 6] << 16) | (bytes[at + 7] << 24)) >>> 0;
    if (type === 'TKEY') tkeySize = size;
    if (type === 'TDAT') tdatSize = size;
    at += 8 + size;
  }
  assert.strictEqual(at, bytes.length, 'chunks must cover the file exactly (the loader reads until EOF)');
  assert.ok(tkeySize >= 0 && tkeySize % 12 === 0, 'TKEY size must be a multiple of the 12-byte entry');
  assert.ok(tdatSize >= 0 && tdatSize % 2 === 0, 'TDAT must hold UTF-16 (even byte count)');
  // TKEY entries sorted by strcmp of the 8-byte key, for the loader's bsearch.
  const keys = [];
  for (let i = 0; i < tkeySize / 12; i++) {
    const entry = 6 + 8 + i * 12;
    keys.push(ascii(bytes, entry + 4, 7));
  }
  for (let i = 1; i < keys.length; i++) {
    assert.ok(strcmp(keys[i - 1], keys[i]) < 0, `TKEY must be sorted for bsearch (${keys[i - 1]} before ${keys[i]})`);
  }
}

async function main() {
  const { parseGxt, buildGxt, translateGxt } = await loadModule('web/gxtgen.js');
  const { GAME_TRANSLATIONS } = await loadModule('web/gxt-translations.js');

  // 1. build -> parse round trip
  const built = buildGxt('e', ENGLISH);
  assertLoaderShape(built, 'e');
  const parsed = parseGxt(built);
  assert.strictEqual(parsed.letter, 'e');
  const roundTrip = new Map(parsed.entries.map(({ key, text }) => [key, text]));
  assert.strictEqual(roundTrip.size, ENGLISH.length, 'every key survives the round trip');
  for (const { key, text } of ENGLISH) assert.strictEqual(roundTrip.get(key), text, `text of "${key}" survives`);

  // 2. the parser accepts what it wrote and rejects garbage
  assert.throws(() => parseGxt(new Uint8Array([1, 2, 3, 4, 5, 6])), /not a GXT/);
  const wrongVersion = Uint8Array.from(built);
  wrongVersion[4] = 99;
  assert.throws(() => parseGxt(wrongVersion), /version/);
  const truncated = built.subarray(0, built.length - 10); // TKEY still claims its full size
  assert.throws(() => parseGxt(truncated), /past the end/);

  // 3. translating: covered keys change, everything else keeps the English text
  const spanish = translateGxt(built, 's', FAKE_ES);
  assertLoaderShape(spanish, 's');
  const es = new Map(parseGxt(spanish).entries.map(({ key, text }) => [key, text]));
  assert.strictEqual(es.get('play'), 'JUGAR');
  assert.strictEqual(es.get('mfail'), '¡TRABAJO FALLIDO!');
  assert.strictEqual(es.get('pscore'), 'Puntuación objetivo: %d');
  assert.strictEqual(es.get('quit'), 'QUIT', 'untranslated key falls back to English');
  assert.strictEqual(es.get('zzz9'), 'NO TOCAR');
  assert.strictEqual(es.get('café'), 'Café crème');
  assert.strictEqual(es.get('long0'), ENGLISH.find((e) => e.key === 'long0').text);

  const french = translateGxt(built, 'f', { sure: 'TU ES SÛR ?' });
  assertLoaderShape(french, 'f');
  assert.strictEqual(parseGxt(french).letter, 'f');
  assert.strictEqual(new Map(parseGxt(french).entries.map(({ key, text }) => [key, text])).get('sure'), 'TU ES SÛR ?');

  // 4. the real translation table: shape the engine and the fonts require
  const esKeys = Object.keys(GAME_TRANSLATIONS.es).sort();
  const frKeys = Object.keys(GAME_TRANSLATIONS.fr).sort();
  assert.deepStrictEqual(esKeys, frKeys, 'es and fr must cover the same keys');
  for (const lang of ['es', 'fr']) {
    const table = GAME_TRANSLATIONS[lang];
    for (const [key, value] of Object.entries(table)) {
      assert.ok(key.length <= 7, `key "${key}" must fit the 8-byte TKEY field`);
      assert.ok(!/\s/.test(key), `key "${key}" must not contain spaces`);
      for (const ch of value) {
        assert.ok(ch.charCodeAt(0) <= 0xff, `"${key}" must stay Latin-1 (found "${ch}")`);
      }
      assert.strictEqual([...value].filter((c) => c === '#').length % 2, 0, `"${key}" must keep "#" markers balanced`);
    }
  }
  // printf placeholders must match between languages and with the English text
  const specifiers = (s) => (s.match(/%[ds]/g) || []).sort().join(' ');
  for (const key of esKeys) {
    assert.strictEqual(specifiers(GAME_TRANSLATIONS.es[key]), specifiers(GAME_TRANSLATIONS.fr[key]),
      `"${key}" must use the same % placeholders in es and fr`);
    if (key in PLACEHOLDER_EN) {
      for (const lang of ['es', 'fr']) {
        assert.strictEqual(specifiers(GAME_TRANSLATIONS[lang][key]), specifiers(PLACEHOLDER_EN[key]),
          `"${key}" must use the same % placeholders as the English text`);
      }
    }
  }
  const withSpecifiers = esKeys.filter((key) => specifiers(GAME_TRANSLATIONS.es[key]));
  assert.deepStrictEqual(withSpecifiers.sort(), Object.keys(PLACEHOLDER_EN).sort(),
    'every placeholder-carrying key must be in PLACEHOLDER_EN (and vice versa)');

  // 5. the real table plugs into a synthetic English file without breaking it
  const full = translateGxt(built, 's', GAME_TRANSLATIONS.es);
  assertLoaderShape(full, 's');
  const withTable = new Map(parseGxt(full).entries.map(({ key, text }) => [key, text]));
  assert.strictEqual(withTable.get('play'), GAME_TRANSLATIONS.es.play);
  assert.strictEqual(withTable.get('zzz9'), 'UNTRANSLATED FALLBACK');

  console.log(`test_gxt: OK (${ENGLISH.length} synthetic keys, ${esKeys.length} translated keys per language)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
