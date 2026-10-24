// WebGL2 renderer for the GTA2 browser port (D07).
//
// The game core produces one draw list per presented frame (port/render/
// frame.h): 24-byte vertices in the game's reference space and 40-byte
// commands (triangle batches or clears). This draws them in order,
// with no depth buffer, matching the original driver's texture/diffuse
// modulation and its three blend modes.
//
// The reference space is always 480 high. Its width comes with each frame:
// 640 for menus and other 4:3 screens (pillarboxed), or the widescreen view
// width for gameplay frames.

import { registerDict, t } from './strings.js';

registerDict({
  en: {
    'ui.render.shaderCompile': 'shader compile failed: {log}',
    'ui.render.shaderLink': 'shader link failed: {log}',
    'ui.render.noWebgl2': 'WebGL2 is not available in this browser',
  },
  es: {
    'ui.render.shaderCompile': 'falló la compilación del shader: {log}',
    'ui.render.shaderLink': 'falló el enlazado del shader: {log}',
    'ui.render.noWebgl2': 'WebGL2 no está disponible en este navegador',
  },
  fr: {
    'ui.render.shaderCompile': 'échec de la compilation du shader : {log}',
    'ui.render.shaderLink': 'échec de l’édition de liens du shader : {log}',
    'ui.render.noWebgl2': "WebGL2 n'est pas disponible dans ce navigateur",
  },
});

const REF_W = 640;
const REF_H = 480;
const VERTEX_BYTES = 24;
const COMMAND_BYTES = 40;
const BLEND_OPAQUE = 0;
const BLEND_ALPHA = 1;
const BLEND_ADDITIVE = 2;

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;   // reference-space pixels
layout(location = 1) in float aRhw;  // reciprocal W from the game
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec4 aColour;
uniform vec4 uView;                  // xy: scale, zw: offset (reference px -> NDC)
out vec2 vUv;
out vec4 vColour;
void main() {
  // Clip-space W = 1/rhw gives perspective-correct texturing, as the
  // original pre-transformed vertices did.
  float w = 1.0 / max(aRhw, 1e-6);
  vec2 ndc = aPos * uView.xy + uView.zw;
  gl_Position = vec4(ndc * w, 0.0, w);
  vUv = aUv;
  vColour = aColour;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vColour;
uniform sampler2D uTexture;
uniform int uBlend;
out vec4 outColour;
void main() {
  vec4 t = texture(uTexture, vUv);
  if (t.a < 0.5) discard;                 // palette colour 0 is transparent
  vec3 rgb = t.rgb * vColour.rgb;         // texture * diffuse
  float a = uBlend == 1 ? t.a * vColour.a : 1.0;
  outColour = vec4(rgb, a);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(t('ui.render.shaderCompile', { log: gl.getShaderInfoLog(shader) }));
  }
  return shader;
}

export class Gta2Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error(t('ui.render.noWebgl2'));
    this.gl = gl;
    this.module = null;
    this.textures = new Map();
    this.stats = { frames: 0, drawCalls: 0, vertices: 0, textures: 0 };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(t('ui.render.shaderLink', { log: gl.getProgramInfoLog(program) }));
    }
    this.program = program;
    this.uView = gl.getUniformLocation(program, 'uView');
    this.uBlend = gl.getUniformLocation(program, 'uBlend');
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, VERTEX_BYTES, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, VERTEX_BYTES, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, VERTEX_BYTES, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, VERTEX_BYTES, 20);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.resize();
  }

  /** Fits a refW x 480 reference view into the canvas (letter- or pillarboxed). */
  resize(refW = REF_W) {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const scale = Math.min(w / refW, h / REF_H);
    this.viewport = {
      w: Math.round(refW * scale),
      h: Math.round(REF_H * scale),
    };
    this.viewport.x = Math.floor((w - this.viewport.w) / 2);
    this.viewport.y = Math.floor((h - this.viewport.h) / 2);
    this.scale = scale;
  }

  uploadTexture(id, width, height, rgba) {
    const gl = this.gl;
    let tex = this.textures.get(id);
    if (!tex) {
      tex = gl.createTexture();
      this.textures.set(id, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.stats.textures = this.textures.size;
  }

  /** Quick load: the game uploads every texture it holds again. */
  freeAllTextures() {
    for (const tex of this.textures.values()) this.gl.deleteTexture(tex);
    this.textures.clear();
  }

  freeTexture(id) {
    const tex = this.textures.get(id);
    if (tex) {
      this.gl.deleteTexture(tex);
      this.textures.delete(id);
    }
  }

  setBlend(mode) {
    const gl = this.gl;
    if (mode === this.blend) return;
    this.blend = mode;
    gl.uniform1i(this.uBlend, mode);
    if (mode === BLEND_OPAQUE) {
      gl.disable(gl.BLEND);
    } else if (mode === BLEND_ALPHA) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    }
  }

  /** Called from the core (render/frame.cpp) with pointers into wasm memory. */
  present(cmdPtr, cmdCount, vertPtr, vertCount, refW = REF_W) {
    const gl = this.gl;
    const heap = this.module.HEAPU8;
    this.resize(refW);
    this.refW = refW;
    const vp = this.viewport;
    // The bars outside the view keep whatever the last wider frame left there.
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(vp.x, vp.y, vp.w, vp.h);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, heap.subarray(vertPtr, vertPtr + vertCount * VERTEX_BYTES), gl.STREAM_DRAW);
    gl.uniform4f(this.uView, 2 / refW, -2 / REF_H, -1, 1);
    gl.activeTexture(gl.TEXTURE0);
    this.blend = -1;

    const cmds = new DataView(heap.buffer, cmdPtr, cmdCount * COMMAND_BYTES);
    let drawCalls = 0;
    for (let i = 0; i < cmdCount; i++) {
      const o = i * COMMAND_BYTES;
      const kind = cmds.getUint32(o, true);
      if (kind === 1) {
        const colour = cmds.getUint32(o + 20, true);
        const l = cmds.getInt32(o + 24, true);
        const t = cmds.getInt32(o + 28, true);
        const r = cmds.getInt32(o + 32, true);
        const b = cmds.getInt32(o + 36, true);
        gl.enable(gl.SCISSOR_TEST);
        if (r > l && b > t) {
          gl.scissor(vp.x + Math.floor(l * this.scale), vp.y + Math.floor((REF_H - b) * this.scale),
            Math.ceil((r - l) * this.scale), Math.ceil((b - t) * this.scale));
        } else {
          gl.scissor(0, 0, this.canvas.width, this.canvas.height);
        }
        gl.clearColor((colour & 255) / 255, ((colour >> 8) & 255) / 255, ((colour >> 16) & 255) / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
        continue;
      }
      const tex = this.textures.get(cmds.getUint32(o + 4, true));
      if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      this.setBlend(cmds.getUint32(o + 8, true));
      gl.drawArrays(gl.TRIANGLES, cmds.getUint32(o + 12, true), cmds.getUint32(o + 16, true));
      drawCalls++;
    }
    this.stats.frames++;
    this.stats.drawCalls = drawCalls;
    this.stats.vertices = vertCount;
  }
}
