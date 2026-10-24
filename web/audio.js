// Web Audio back end for the GTA2 port's Miles layer (port/audio/miles_web.cpp).
//
// Effects: PCM from the game's sound bank, played with Miles-style volume
// (0..127), pan (0..127, 64 = centre), playback rate and loop points.
// Streams: speech and radio are IMA ADPCM (or PCM) WAV files read straight
// from the in-memory filesystem and decoded about half a second at a time, so
// long radio stations never sit fully decoded in memory.
// Stream status and position follow the wall clock, so game logic is not held
// up while the browser keeps audio suspended before the first user gesture.

const BANK_RATE = 22050;
const AHEAD_S = 1.0;
const CHUNK_S = 0.5;

const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const IMA_STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
  107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871,
  5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
  27086, 29794, 32767,
];

/** Parses a RIFF WAVE header. Returns null if the format is not supported. */
function parseWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;
  let fmt = null;
  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const id = dv.getUint32(off, false);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 0x666d7420) { // 'fmt '
      fmt = {
        tag: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        rate: dv.getUint32(body + 4, true),
        blockAlign: dv.getUint16(body + 12, true),
        bits: dv.getUint16(body + 14, true),
      };
      if (fmt.tag === 0x11 && size >= 20) fmt.samplesPerBlock = dv.getUint16(body + 18, true);
    } else if (id === 0x64617461 && fmt) { // 'data'
      const dataLen = Math.min(size, bytes.byteLength - body);
      if (fmt.tag === 1 && fmt.bits === 16) {
        return { ...fmt, data: body, dataLen, frames: Math.floor(dataLen / (2 * fmt.channels)) };
      }
      if (fmt.tag === 0x11 && fmt.bits === 4) {
        const spb = fmt.samplesPerBlock || ((fmt.blockAlign - 4 * fmt.channels) * 2) / fmt.channels + 1;
        const blocks = Math.floor(dataLen / fmt.blockAlign);
        return { ...fmt, samplesPerBlock: spb, data: body, dataLen, blocks, frames: blocks * spb };
      }
      return null;
    }
    off = body + size + (size & 1);
  }
  return null;
}

/** Decodes IMA ADPCM blocks [first, first + count) into per-channel Float32Arrays. */
function decodeImaBlocks(bytes, wav, first, count) {
  const { channels, blockAlign, samplesPerBlock: spb } = wav;
  const out = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(count * spb));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let b = 0; b < count; b++) {
    const base = wav.data + (first + b) * blockAlign;
    const pred = [];
    const index = [];
    for (let c = 0; c < channels; c++) {
      pred[c] = dv.getInt16(base + 4 * c, true);
      index[c] = Math.min(88, bytes[base + 4 * c + 2]);
      out[c][b * spb] = pred[c] / 32768;
    }
    // Data: groups of 4 bytes (8 samples) per channel, interleaved by channel.
    let p = base + 4 * channels;
    const written = new Array(channels).fill(1);
    while (p < base + blockAlign) {
      for (let c = 0; c < channels && p < base + blockAlign; c++) {
        for (let i = 0; i < 4; i++, p++) {
          const byte = bytes[p];
          for (const nibble of [byte & 0x0f, byte >> 4]) {
            const step = IMA_STEP[index[c]];
            let diff = step >> 3;
            if (nibble & 4) diff += step;
            if (nibble & 2) diff += step >> 1;
            if (nibble & 1) diff += step >> 2;
            pred[c] += nibble & 8 ? -diff : diff;
            pred[c] = Math.max(-32768, Math.min(32767, pred[c]));
            index[c] = Math.max(0, Math.min(88, index[c] + IMA_INDEX[nibble]));
            if (written[c] < spb) out[c][b * spb + written[c]++] = pred[c] / 32768;
          }
        }
      }
    }
  }
  return out;
}

function decodePcm16(bytes, wav, firstFrame, frames) {
  const out = [];
  for (let c = 0; c < wav.channels; c++) out.push(new Float32Array(frames));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < wav.channels; c++) {
      out[c][f] = dv.getInt16(wav.data + ((firstFrame + f) * wav.channels + c) * 2, true) / 32768;
    }
  }
  return out;
}

export class Gta2Audio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.gameVolume = 1;
    this.userVolume = 1;
    this.muted = false;
    this.radioOn = true; // R: the car radio's stations on or off (speech and effects keep playing)
    // The same station files also play on foot, from places in the city (the music by a church, a
    // club): R only silences them while the player is in a car, where they are the car's radio.
    this.inCar = false;
    this.module = null;
    this.samples = new Map();
    this.bufferCache = new Map();
    this.streams = new Map();
    this.timer = setInterval(() => this.pumpStreams(), 100);
  }

  /** Browsers only start audio after a user gesture; call from input handlers. */
  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  applyMaster() {
    this.master.gain.value = this.muted ? 0 : this.gameVolume * this.userVolume;
  }

  setMasterVolume(v) {
    this.gameVolume = Math.max(0, Math.min(127, v)) / 127;
    this.applyMaster();
  }

  setUserVolume(v) {
    this.userVolume = v;
    this.applyMaster();
  }

  setMuted(muted) {
    this.muted = muted;
    this.applyMaster();
  }

  // ------------------------------------------------------------- effects
  bufferFor(ptr, len, format) {
    const heap = this.module.HEAPU8;
    const sixteen = (format & 1) !== 0;
    const stereo = (format & 2) !== 0;
    // Key on address, length, format and a sparse checksum: banks are reloaded
    // at the same address when the district changes.
    let sum = 0;
    for (let i = 0; i < len; i += Math.max(1, len >> 5)) sum = (sum * 31 + heap[ptr + i]) | 0;
    const key = `${ptr}:${len}:${format}:${sum}`;
    let buffer = this.bufferCache.get(key);
    if (buffer) return buffer;
    const channels = stereo ? 2 : 1;
    const bytesPerFrame = (sixteen ? 2 : 1) * channels;
    const frames = Math.max(1, Math.floor(len / bytesPerFrame));
    buffer = this.ctx.createBuffer(channels, frames, BANK_RATE);
    const dv = new DataView(heap.buffer, ptr, frames * bytesPerFrame);
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let f = 0; f < frames; f++) {
        const o = f * bytesPerFrame + c * (sixteen ? 2 : 1);
        data[f] = sixteen ? dv.getInt16(o, true) / 32768 : (dv.getUint8(o) - 128) / 128;
      }
    }
    if (this.bufferCache.size > 600) this.bufferCache.clear();
    this.bufferCache.set(key, buffer);
    return buffer;
  }

  sampleStart(id, ptr, len, rate, format, loops, loopStart, loopEnd, volume, pan) {
    this.sampleStop(id);
    if (!ptr || len <= 0) return;
    const buffer = this.bufferFor(ptr, len, format);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.05, rate / BANK_RATE);
    const bytesPerFrame = ((format & 1) ? 2 : 1) * ((format & 2) ? 2 : 1);
    if (loops !== 1) {
      source.loop = true;
      if (loopEnd > 0 && loopEnd > loopStart) {
        source.loopStart = loopStart / bytesPerFrame / BANK_RATE;
        source.loopEnd = loopEnd / bytesPerFrame / BANK_RATE;
      }
    }
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(127, volume)) / 127;
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, (pan - 64) / 64));
      source.connect(gain).connect(panner).connect(this.master);
    } else {
      source.connect(gain).connect(this.master);
    }
    source.start();
    if (loops > 1) source.stop(this.ctx.currentTime + (buffer.duration * loops) / source.playbackRate.value);
    const entry = { source, gain, panner };
    source.onended = () => {
      if (this.samples.get(id) === entry) this.samples.delete(id);
    };
    this.samples.set(id, entry);
  }

  sampleUpdate(id, volume, pan, rate) {
    const s = this.samples.get(id);
    if (!s) return;
    s.gain.gain.value = Math.max(0, Math.min(127, volume)) / 127;
    if (s.panner) s.panner.pan.value = Math.max(-1, Math.min(1, (pan - 64) / 64));
    s.source.playbackRate.value = Math.max(0.05, rate / BANK_RATE);
  }

  sampleStop(id) {
    const s = this.samples.get(id);
    if (!s) return;
    this.samples.delete(id);
    try {
      s.source.stop();
    } catch { /* already stopped */ }
  }

  /** Quick load: stops every effect and closes every stream (the game reopens the saved ones). */
  reset() {
    for (const id of [...this.samples.keys()]) this.sampleStop(id);
    for (const id of [...this.streams.keys()]) this.streamClose(id);
    this.bufferCache.clear();
  }

  // ------------------------------------------------------------- streams
  streamOpen(id, path) {
    let bytes;
    try {
      const node = this.module.FS.lookupPath(path).node;
      bytes = node.contents.subarray(0, node.usedBytes); // no copy of large files
    } catch {
      return 0;
    }
    const wav = parseWav(bytes);
    if (!wav) {
      console.warn(`audio: unsupported or unreadable WAV ${path}`);
      return 0;
    }
    const gain = this.ctx.createGain();
    gain.connect(this.master);
    this.streams.set(id, {
      path, bytes, wav, gain, loops: 1, rateFactor: 1, sources: [], started: false, volume: 127,
      radio: /(^|[\\/])gtaudio[\\/]\d+a?\.wav$/i.test(path), // a radio station (data/audio/vocals is speech)
      baseMs: 0, startWall: 0, cursorFrame: 0, nextTime: 0, durationMs: (wav.frames / wav.rate) * 1000,
    });
    this.applyStreamGain(this.streams.get(id)); // a station opened while the radio is off starts silent
    return 1;
  }

  streamClose(id) {
    const st = this.streams.get(id);
    if (!st) return;
    this.stopSources(st);
    st.gain.disconnect();
    this.streams.delete(id);
  }

  stopSources(st) {
    for (const s of st.sources) {
      try {
        s.stop();
      } catch { /* already stopped */ }
    }
    st.sources = [];
  }

  streamStart(id, loops) {
    const st = this.streams.get(id);
    if (!st) return;
    st.loops = loops;
    st.started = true;
    st.startWall = performance.now();
    st.cursorFrame = Math.floor((st.baseMs / 1000) * st.wav.rate);
    st.nextTime = 0;
    this.stopSources(st);
    this.pumpStream(st);
  }

  /** Elapsed stream time in ms (wall clock, scaled by playback rate). */
  elapsedMs(st) {
    return st.baseMs + (performance.now() - st.startWall) * st.rateFactor;
  }

  streamPlaying(id) {
    const st = this.streams.get(id);
    if (!st || !st.started) return 0;
    if (st.loops === 0) return 1;
    return this.elapsedMs(st) < st.durationMs * st.loops ? 1 : 0;
  }

  streamMs(id, which) {
    const st = this.streams.get(id);
    if (!st) return 0;
    if (which === 0) return Math.round(st.durationMs);
    if (!st.started) return Math.round(st.baseMs);
    return Math.round(this.elapsedMs(st) % Math.max(1, st.durationMs));
  }

  streamSet(id, volume, rate) {
    const st = this.streams.get(id);
    if (!st) return;
    st.volume = volume;
    this.applyStreamGain(st);
    const factor = Math.max(0.05, rate / st.wav.rate);
    if (factor !== st.rateFactor) {
      if (st.started) {
        st.baseMs = this.elapsedMs(st);
        st.startWall = performance.now();
      }
      st.rateFactor = factor;
      for (const s of st.sources) s.playbackRate.value = factor;
    }
  }

  applyStreamGain(st) {
    st.gain.gain.value = st.radio && !this.radioOn && this.inCar ? 0 : Math.max(0, Math.min(127, st.volume)) / 127;
  }

  /** Whether the player is in a car (the shell polls it): the radio setting only applies there. */
  setInCar(inCar) {
    if (inCar === this.inCar) return;
    this.inCar = inCar;
    for (const st of this.streams.values()) this.applyStreamGain(st);
  }

  /** Turns the car radio's stations on or off. */
  setRadio(on) {
    this.radioOn = on;
    for (const st of this.streams.values()) this.applyStreamGain(st);
  }

  streamSeek(id, ms) {
    const st = this.streams.get(id);
    if (!st) return;
    st.baseMs = ms;
    st.startWall = performance.now();
    if (st.started) {
      this.stopSources(st);
      st.cursorFrame = Math.floor((ms / 1000) * st.wav.rate);
      st.nextTime = 0;
    }
  }

  pumpStreams() {
    for (const st of this.streams.values()) this.pumpStream(st);
  }

  /** Keeps about AHEAD_S of decoded audio scheduled for a playing stream. */
  pumpStream(st) {
    if (!st.started || this.ctx.state !== 'running') return;
    const { wav } = st;
    const now = this.ctx.currentTime;
    if (st.nextTime < now) {
      // First chunk, or the context was suspended: resync to the wall clock.
      st.nextTime = now + 0.05;
      const wallFrame = Math.floor(((this.elapsedMs(st) % st.durationMs) / 1000) * wav.rate);
      if (st.loops === 0 || this.elapsedMs(st) < st.durationMs * st.loops) st.cursorFrame = wallFrame;
    }
    while (st.nextTime < now + AHEAD_S) {
      const totalFrames = wav.frames;
      if (st.loops !== 0 && this.elapsedMs(st) >= st.durationMs * st.loops) return;
      if (st.cursorFrame >= totalFrames) {
        if (st.loops === 1) return;
        st.cursorFrame = 0;
      }
      let channels;
      let frames;
      if (wav.tag === 0x11) {
        const firstBlock = Math.floor(st.cursorFrame / wav.samplesPerBlock);
        const count = Math.max(1, Math.min(wav.blocks - firstBlock, Math.ceil((CHUNK_S * wav.rate) / wav.samplesPerBlock)));
        if (count <= 0 || firstBlock >= wav.blocks) {
          st.cursorFrame = totalFrames;
          continue;
        }
        channels = decodeImaBlocks(st.bytes, wav, firstBlock, count);
        const skip = st.cursorFrame - firstBlock * wav.samplesPerBlock;
        if (skip > 0) channels = channels.map((c) => c.subarray(skip));
        frames = channels[0].length;
      } else {
        frames = Math.min(totalFrames - st.cursorFrame, Math.ceil(CHUNK_S * wav.rate));
        channels = decodePcm16(st.bytes, wav, st.cursorFrame, frames);
      }
      if (frames <= 0) {
        st.cursorFrame = totalFrames;
        continue;
      }
      const buffer = this.ctx.createBuffer(channels.length, frames, wav.rate);
      channels.forEach((data, c) => buffer.copyToChannel(data, c));
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = st.rateFactor;
      source.connect(st.gain);
      source.start(st.nextTime);
      source.onended = () => {
        st.sources = st.sources.filter((s) => s !== source);
      };
      st.sources.push(source);
      st.nextTime += frames / wav.rate / st.rateFactor;
      st.cursorFrame += frames;
    }
  }
}
