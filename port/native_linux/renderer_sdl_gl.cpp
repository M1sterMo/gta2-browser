#include "gl_loader.h"
#include "render/frame.h"
#include <map>
#include <vector>
#include <cmath>
#include <algorithm>

#define X(type, name) type p##name = nullptr;
GL_FUNCS
#undef X

namespace {

SDL_Window* gWindow = nullptr;
GLuint gProgram = 0;
GLint uViewLoc = -1;
GLint uBlendLoc = -1;
GLuint gVAO = 0;
GLuint gVBO = 0;
int gCurrentBlend = -1;

std::map<int, GLuint> gTextures;

const char* VERTEX_SHADER_SRC = R"(#version 330 core
layout(location = 0) in vec2 aPos;
layout(location = 1) in float aRhw;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec4 aColour;

uniform vec4 uView;

out vec2 vUv;
out vec4 vColour;

void main() {
    float w = 1.0 / max(aRhw, 1e-6);
    vec2 ndc = aPos * uView.xy + uView.zw;
    gl_Position = vec4(ndc * w, 0.0, w);
    vUv = aUv;
    vColour = aColour;
}
)";

const char* FRAGMENT_SHADER_SRC = R"(#version 330 core
in vec2 vUv;
in vec4 vColour;

uniform sampler2D uTexture;
uniform int uBlend;

out vec4 outColour;

void main() {
    vec4 t = texture(uTexture, vUv);
    if (t.a < 0.5) discard;
    vec3 rgb = t.rgb * vColour.rgb;
    float a = (uBlend == 1) ? (t.a * vColour.a) : 1.0;
    outColour = vec4(rgb, a);
}
)";

GLuint CompileShader(GLenum type, const char* src) {
    GLuint s = glCreateShader(type);
    glShaderSource(s, 1, &src, nullptr);
    glCompileShader(s);
    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[1024];
        glGetShaderInfoLog(s, sizeof(log), nullptr, log);
        fprintf(stderr, "Shader compile failed: %s\n", log);
    }
    return s;
}

void SetBlend(int mode) {
    if (mode == gCurrentBlend) return;
    gCurrentBlend = mode;
    glUniform1i(uBlendLoc, mode);
    if (mode == kBlendOpaque) {
        glDisable(GL_BLEND);
    } else if (mode == kBlendAlpha) {
        glEnable(GL_BLEND);
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    } else if (mode == kBlendAdditive) {
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE, GL_ONE);
    }
}

} // namespace

bool InitNativeRenderer(SDL_Window* window) {
    gWindow = window;
    if (!LoadGLFunctions()) {
        return false;
    }

    GLuint vs = CompileShader(GL_VERTEX_SHADER, VERTEX_SHADER_SRC);
    GLuint fs = CompileShader(GL_FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    gProgram = glCreateProgram();
    glAttachShader(gProgram, vs);
    glAttachShader(gProgram, fs);
    glLinkProgram(gProgram);

    GLint linked = 0;
    glGetProgramiv(gProgram, GL_LINK_STATUS, &linked);
    if (!linked) {
        char log[1024];
        glGetProgramInfoLog(gProgram, sizeof(log), nullptr, log);
        fprintf(stderr, "Program link failed: %s\n", log);
        return false;
    }

    uViewLoc = glGetUniformLocation(gProgram, "uView");
    uBlendLoc = glGetUniformLocation(gProgram, "uBlend");
    GLint texLoc = glGetUniformLocation(gProgram, "uTexture");

    glUseProgram(gProgram);
    glUniform1i(texLoc, 0);

    glGenVertexArrays(1, &gVAO);
    glGenBuffers(1, &gVBO);

    glBindVertexArray(gVAO);
    glBindBuffer(GL_ARRAY_BUFFER, gVBO);

    // Layout: FrameVertex { float x, y, w, u, v; uint32_t rgba; }
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, sizeof(FrameVertex), (const void*)0);

    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 1, GL_FLOAT, GL_FALSE, sizeof(FrameVertex), (const void*)8);

    glEnableVertexAttribArray(2);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, sizeof(FrameVertex), (const void*)12);

    glEnableVertexAttribArray(3);
    glVertexAttribPointer(3, 4, GL_UNSIGNED_BYTE, GL_TRUE, sizeof(FrameVertex), (const void*)20);

    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);

    return true;
}

// ---------------------------------------------------------------------------
// GBH Texture API (called from gbh_web.cpp)
extern "C" {

void gta2_js_upload_texture(int id, int w, int h, const void* rgba) {
    GLuint tex = 0;
    auto it = gTextures.find(id);
    if (it == gTextures.end()) {
        glGenTextures(1, &tex);
        gTextures[id] = tex;
    } else {
        tex = it->second;
    }

    glBindTexture(GL_TEXTURE_2D, tex);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

void gta2_js_free_texture(int id) {
    auto it = gTextures.find(id);
    if (it != gTextures.end()) {
        glDeleteTextures(1, &it->second);
        gTextures.erase(it);
    }
}

void gta2_js_free_all_textures() {
    for (auto& pair : gTextures) {
        glDeleteTextures(1, &pair.second);
    }
    gTextures.clear();
}

// ---------------------------------------------------------------------------
// Frame presentation API (called from frame.cpp)
void gta2_js_present(const void* cmdsPtr, int cmdCount, const void* vertsPtr, int vertCount, int refWidth) {
    if (!gWindow) return;

    int winW = 640, winH = 480;
    SDL_GL_GetDrawableSize(gWindow, &winW, &winH);

    float scale = std::min((float)winW / (float)refWidth, (float)winH / 480.0f);
    int vpW = (int)std::round(refWidth * scale);
    int vpH = (int)std::round(480.0f * scale);
    int vpX = (winW - vpW) / 2;
    int vpY = (winH - vpH) / 2;

    glDisable(GL_SCISSOR_TEST);
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    glViewport(vpX, vpY, vpW, vpH);
    glUseProgram(gProgram);
    glBindVertexArray(gVAO);

    glBindBuffer(GL_ARRAY_BUFFER, gVBO);
    glBufferData(GL_ARRAY_BUFFER, vertCount * sizeof(FrameVertex), vertsPtr, GL_STREAM_DRAW);

    glUniform4f(uViewLoc, 2.0f / (float)refWidth, -2.0f / 480.0f, -1.0f, 1.0f);
    glActiveTexture(GL_TEXTURE0);
    gCurrentBlend = -1;

    const FrameCommand* cmds = static_cast<const FrameCommand*>(cmdsPtr);
    for (int i = 0; i < cmdCount; ++i) {
        const FrameCommand& cmd = cmds[i];
        if (cmd.kind == 1) { // Clear
            uint32_t colour = cmd.colour;
            int32_t l = cmd.rect[0];
            int32_t t = cmd.rect[1];
            int32_t r = cmd.rect[2];
            int32_t b = cmd.rect[3];

            glEnable(GL_SCISSOR_TEST);
            if (r > l && b > t) {
                int sx = vpX + (int)std::floor(l * scale);
                int sy = vpY + (int)std::floor((480 - b) * scale);
                int sw = (int)std::ceil((r - l) * scale);
                int sh = (int)std::ceil((b - t) * scale);
                glScissor(sx, sy, sw, sh);
            } else {
                glScissor(0, 0, winW, winH);
            }

            float cr = (colour & 0xFF) / 255.0f;
            float cg = ((colour >> 8) & 0xFF) / 255.0f;
            float cb = ((colour >> 16) & 0xFF) / 255.0f;
            glClearColor(cr, cg, cb, 1.0f);
            glClear(GL_COLOR_BUFFER_BIT);
            glDisable(GL_SCISSOR_TEST);
            continue;
        }

        // Draw triangles
        auto it = gTextures.find(cmd.texture);
        if (it == gTextures.end()) continue;

        glBindTexture(GL_TEXTURE_2D, it->second);
        SetBlend(cmd.blend);
        glDrawArrays(GL_TRIANGLES, cmd.first, cmd.count);
    }

    SDL_GL_SwapWindow(gWindow);
}

} // extern "C"
