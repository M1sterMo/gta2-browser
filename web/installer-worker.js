// Unpacks the GTA2 freeware installer inside the browser (module worker).
//
// Input: the downloaded GTA2INSTALLER.exe (Rockstar Classics, December 2004)
// as an ArrayBuffer. It is checked against the known SHA-1, the InstallShield
// cabinets are cut out of the self-extractor at their recorded offsets
// (research/runtime-data/inventory/sfx-payload-records.json), and unshield
// (MIT, compiled to WebAssembly: scripts/build_unshield_wasm.sh) extracts the
// game's "App_Executables" file group. Output: the game files, as transferable
// ArrayBuffers keyed by lower-case relative path, the same layout as picking
// an installed GTA2 folder. Nothing leaves the browser.
import createUnshield from './unshield.js';

const SIZE = 362331961;
const SHA1 = '8c10c0d20f15912a9450b6fbe028f31928b29893';
// [file, offset, bytes] of the cabinets inside the self-extractor
const PAYLOADS = [
  ['data1.hdr', 0xee96e, 71292],
  ['data1.cab', 0x604aa, 582812],
  ['data2.cab', 0x100016, 359762427],
];
// The game's file group (the installer is pinned by SHA-1, so its name is known);
// unshield writes it to App_Executables/.
const GROUP_NAME = 'App Executables';
const GROUP = /^app[ _]?executables$/i;
const SKIP = /\.(exe|dll|m3d|ico)$/; // the port never needs the original executables or DLLs

const progress = (stage, done = 0, total = 0) => self.postMessage({ type: 'progress', stage, done, total });

// The worker has no access to the language: errors carry translation keys and
// variables, and web/gamefiles.js turns them into text in the current language.
const fail = (key, vars = {}) => Object.assign(new Error(key), { key, vars });

async function unpack(installer) {
  if (installer.byteLength !== SIZE) throw fail('ui.files.badSize', { n: installer.byteLength });
  progress('verify');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', installer))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hash !== SHA1) throw fail('ui.files.checksum');

  progress('unpack');
  const log = [];
  const U = await createUnshield({ print: (t) => log.push(t), printErr: (t) => log.push(t) });
  const FS = U.FS;
  FS.mkdir('/in');
  for (const [name, offset, bytes] of PAYLOADS) {
    // canOwn: the in-memory file uses the installer's bytes without copying them
    const stream = FS.open(`/in/${name}`, 'w');
    FS.write(stream, new Uint8Array(installer, offset, bytes), 0, bytes, 0, true);
    FS.close(stream);
  }
  // One run per module instance: unshield's option parsing keeps state between runs.
  const rc = U.callMain(['-d', '/out', '-g', GROUP_NAME, 'x', '/in/data1.hdr']);
  if (rc !== 0 && rc !== undefined) throw fail('ui.files.unpackFailed', { rc, log: log.slice(-3).join(' ') });

  const files = [];
  const transfer = [];
  const walk = (dir, rel) => {
    for (const name of FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      const path = `${dir}/${name}`;
      const relPath = rel ? `${rel}/${name}` : name;
      if (FS.isDir(FS.stat(path).mode)) { walk(path, relPath); continue; }
      const lower = relPath.toLowerCase();
      if (!SKIP.test(lower)) {
        const data = FS.readFile(path); // a copy; the in-memory file is freed next
        files.push([lower, data.buffer]);
        transfer.push(data.buffer);
      }
      FS.unlink(path);
    }
  };
  const dir = FS.readdir('/out').find((d) => GROUP.test(d));
  if (!dir) throw fail('ui.files.noFiles', { log: log.slice(-3).join(' ') });
  const root = `/out/${dir}`;
  walk(root, '');
  return { files, transfer };
}

self.onmessage = async (e) => {
  try {
    const { files, transfer } = await unpack(e.data.installer);
    self.postMessage({ type: 'done', files }, transfer);
  } catch (err) {
    // Hand the download back so a retry does not fetch 362 MB again.
    const installer = e.data.installer;
    self.postMessage({ type: 'error', key: err.key, vars: err.vars, message: err.message || String(err), installer },
      installer.byteLength ? [installer] : []);
  }
};
