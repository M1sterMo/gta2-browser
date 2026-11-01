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
GLuint gWhiteTexture = 0;
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

    // 1x1 White texture for solid primitives (radar bezel, player marker, blips)
    uint32_t whitePixel = 0xFFFFFFFF;
    glGenTextures(1, &gWhiteTexture);
    glBindTexture(GL_TEXTURE_2D, gWhiteTexture);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, &whitePixel);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

    return true;
}

// ---------------------------------------------------------------------------
// GBH Texture API (called from gbh_web.cpp)
static bool gSmoothFiltering = true; // Default to smooth bilinear filtering
static bool gMinimapEnabled = true;  // Default to radar minimap enabled
static GLuint gMapTexture = 0;
static int gMapEpoch = -1;

extern "C" {
const int32_t* gta2_port_map_state();
int gta2_port_map_render_rows(int y0, int rows, int px, uint8_t* out);
int gta2_port_map_arrows(int32_t* out, int max);

bool ToggleMinimap() {
    gMinimapEnabled = !gMinimapEnabled;
    return gMinimapEnabled;
}

bool IsMinimapEnabled() {
    return gMinimapEnabled;
}

bool ToggleTextureFilter() {
    gSmoothFiltering = !gSmoothFiltering;
    GLint filter = gSmoothFiltering ? GL_LINEAR : GL_NEAREST;
    for (auto& pair : gTextures) {
        glBindTexture(GL_TEXTURE_2D, pair.second);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filter);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filter);
    }
    return gSmoothFiltering;
}

bool IsSmoothFilterEnabled() {
    return gSmoothFiltering;
}

void gta2_js_upload_texture(int id, int w, int h, const void* rgba) {
    GLuint tex = 0;
    auto it = gTextures.find(id);
    if (it == gTextures.end()) {
        glGenTextures(1, &tex);
        gTextures[id] = tex;
    } else {
        tex = it->second;
    }

    GLint filter = gSmoothFiltering ? GL_LINEAR : GL_NEAREST;
    glBindTexture(GL_TEXTURE_2D, tex);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, filter);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, filter);
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
// Native In-Engine Circular Minimap / Radar
void RenderNativeMinimap(int refWidth) {
    if (!gMinimapEnabled) return;

    const int32_t* state = gta2_port_map_state();
    if (!state || !state[0] || !state[3]) return; // Must have loaded city map and active player

    int epoch = state[1];
    if (epoch != gMapEpoch || !gMapTexture) {
        gMapEpoch = epoch;
        std::vector<uint8_t> mapBuf(512 * 512 * 4, 0);
        gta2_port_map_render_rows(0, 256, 2, mapBuf.data());

        if (!gMapTexture) {
            glGenTextures(1, &gMapTexture);
        }
        glBindTexture(GL_TEXTURE_2D, gMapTexture);
        glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 512, 512, 0, GL_RGBA, GL_UNSIGNED_BYTE, mapBuf.data());
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    }

    const float rad = 46.0f;
    const float border = 3.5f;
    const float cx = (float)refWidth - rad - border - 18.0f;
    const float cy = 480.0f - rad - border - 18.0f;
    const float range = 13.0f; // blocks visible from center to rim
    const int SEG = 36;

    float px = (float)(state[14] ? state[14] : state[4]) / 16384.0f;
    float py = (float)(state[15] ? state[15] : state[5]) / 16384.0f;
    float cu = px / 256.0f;
    float cv = py / 256.0f;

    std::vector<FrameVertex> verts;

    // 1. Dark solid background disc behind the map (in case map edges have transparent tiles)
    FrameVertex bgCenter = { cx, cy, 1.0f, 0.5f, 0.5f, 0xFF141010 };
    for (int i = 0; i < SEG; ++i) {
        float a1 = i * (2.0f * (float)M_PI / SEG);
        float a2 = (i + 1) * (2.0f * (float)M_PI / SEG);
        FrameVertex v1 = { cx + cosf(a1) * rad, cy + sinf(a1) * rad, 1.0f, 0.5f, 0.5f, 0xFF141010 };
        FrameVertex v2 = { cx + cosf(a2) * rad, cy + sinf(a2) * rad, 1.0f, 0.5f, 0.5f, 0xFF141010 };
        verts.push_back(bgCenter);
        verts.push_back(v1);
        verts.push_back(v2);
    }
    glBindTexture(GL_TEXTURE_2D, gWhiteTexture);
    SetBlend(kBlendOpaque);
    glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(FrameVertex), verts.data(), GL_STREAM_DRAW);
    glDrawArrays(GL_TRIANGLES, 0, (GLsizei)verts.size());
    verts.clear();

    // 2. City map texture circle
    FrameVertex mapCenter = { cx, cy, 1.0f, cu, cv, 0xFFFFFFFF };
    for (int i = 0; i < SEG; ++i) {
        float a1 = i * (2.0f * (float)M_PI / SEG);
        float a2 = (i + 1) * (2.0f * (float)M_PI / SEG);
        FrameVertex v1 = { cx + cosf(a1) * rad, cy + sinf(a1) * rad, 1.0f,
                           (px + cosf(a1) * range) / 256.0f, (py + sinf(a1) * range) / 256.0f, 0xFFFFFFFF };
        FrameVertex v2 = { cx + cosf(a2) * rad, cy + sinf(a2) * rad, 1.0f,
                           (px + cosf(a2) * range) / 256.0f, (py + sinf(a2) * range) / 256.0f, 0xFFFFFFFF };
        verts.push_back(mapCenter);
        verts.push_back(v1);
        verts.push_back(v2);
    }
    glBindTexture(GL_TEXTURE_2D, gMapTexture);
    SetBlend(kBlendAlpha);
    glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(FrameVertex), verts.data(), GL_STREAM_DRAW);
    glDrawArrays(GL_TRIANGLES, 0, (GLsizei)verts.size());
    verts.clear();

    // 3. Dark Outer Border Bezel
    uint32_t bezelCol = 0xE6141210; // Dark charcoal
    for (int i = 0; i < SEG; ++i) {
        float a1 = i * (2.0f * (float)M_PI / SEG);
        float a2 = (i + 1) * (2.0f * (float)M_PI / SEG);
        float cos1 = cosf(a1), sin1 = sinf(a1);
        float cos2 = cosf(a2), sin2 = sinf(a2);

        FrameVertex in1  = { cx + cos1 * rad, cy + sin1 * rad, 1.0f, 0.5f, 0.5f, bezelCol };
        FrameVertex out1 = { cx + cos1 * (rad + border), cy + sin1 * (rad + border), 1.0f, 0.5f, 0.5f, bezelCol };
        FrameVertex in2  = { cx + cos2 * rad, cy + sin2 * rad, 1.0f, 0.5f, 0.5f, bezelCol };
        FrameVertex out2 = { cx + cos2 * (rad + border), cy + sin2 * (rad + border), 1.0f, 0.5f, 0.5f, bezelCol };

        verts.push_back(in1);
        verts.push_back(out1);
        verts.push_back(out2);

        verts.push_back(in1);
        verts.push_back(out2);
        verts.push_back(in2);
    }

    // 4. Inner subtle glow ring
    uint32_t innerRingCol = 0x50FFFFFF;
    for (int i = 0; i < SEG; ++i) {
        float a1 = i * (2.0f * (float)M_PI / SEG);
        float a2 = (i + 1) * (2.0f * (float)M_PI / SEG);
        float cos1 = cosf(a1), sin1 = sinf(a1);
        float cos2 = cosf(a2), sin2 = sinf(a2);

        FrameVertex in1  = { cx + cos1 * (rad - 1.0f), cy + sin1 * (rad - 1.0f), 1.0f, 0.5f, 0.5f, innerRingCol };
        FrameVertex out1 = { cx + cos1 * rad, cy + sin1 * rad, 1.0f, 0.5f, 0.5f, innerRingCol };
        FrameVertex in2  = { cx + cos2 * (rad - 1.0f), cy + sin2 * (rad - 1.0f), 1.0f, 0.5f, 0.5f, innerRingCol };
        FrameVertex out2 = { cx + cos2 * rad, cy + sin2 * rad, 1.0f, 0.5f, 0.5f, innerRingCol };

        verts.push_back(in1);
        verts.push_back(out1);
        verts.push_back(out2);

        verts.push_back(in1);
        verts.push_back(out2);
        verts.push_back(in2);
    }

    // 5. North Indicator 'N' Marker (at the top of the rim)
    float nx = cx, ny = cy - rad - border / 2.0f;
    uint32_t nCol = 0xFFFFFFFF;
    FrameVertex n_tip  = { nx, ny - 3.5f, 1.0f, 0.5f, 0.5f, nCol };
    FrameVertex n_left = { nx - 2.5f, ny + 2.0f, 1.0f, 0.5f, 0.5f, nCol };
    FrameVertex n_righ = { nx + 2.5f, ny + 2.0f, 1.0f, 0.5f, 0.5f, nCol };
    verts.push_back(n_tip);
    verts.push_back(n_left);
    verts.push_back(n_righ);

    // 6. Mission / Target Objective Blips
    int32_t arrows[16 * 11];
    int arrowCount = gta2_port_map_arrows(arrows, 16);
    float scaleRadar = rad / range;

    for (int a = 0; a < arrowCount; ++a) {
        int isVisible = arrows[a * 11 + 6];
        if (!isVisible) continue;

        float tx = (float)arrows[a * 11 + 3] / 16384.0f;
        float ty = (float)arrows[a * 11 + 4] / 16384.0f;
        float dx = (tx - px) * scaleRadar;
        float dy = (ty - py) * scaleRadar;
        float d = sqrtf(dx * dx + dy * dy);

        float bx = cx + dx;
        float by = cy + dy;
        if (d > rad - 4.0f) {
            bx = cx + (dx / d) * (rad - 3.5f);
            by = cy + (dy / d) * (rad - 3.5f);
        }

        // Diamond blip
        uint32_t blipCol = 0xFF00E0FF; // Default bright gold/yellow
        int arrowCol = arrows[a * 11 + 1];
        if (arrowCol == 1) blipCol = 0xFF00FF00;      // Green
        else if (arrowCol == 2) blipCol = 0xFF0000FF; // Red
        else if (arrowCol == 3) blipCol = 0xFFFFFF00; // Cyan
        else if (arrowCol == 4) blipCol = 0xFFFF00FF; // Magenta

        float bs = 3.0f;
        FrameVertex b_top  = { bx, by - bs, 1.0f, 0.5f, 0.5f, blipCol };
        FrameVertex b_bot  = { bx, by + bs, 1.0f, 0.5f, 0.5f, blipCol };
        FrameVertex b_left = { bx - bs, by, 1.0f, 0.5f, 0.5f, blipCol };
        FrameVertex b_righ = { bx + bs, by, 1.0f, 0.5f, 0.5f, blipCol };

        verts.push_back(b_top);
        verts.push_back(b_left);
        verts.push_back(b_bot);

        verts.push_back(b_top);
        verts.push_back(b_bot);
        verts.push_back(b_righ);
    }

    // 7. Player Indicator (Center Arrow)
    int rawHeading = state[16] ? state[16] : state[7];
    float headingRad = (float)rawHeading * (2.0f * (float)M_PI / 1440.0f);
    float fwd_x = sinf(headingRad);
    float fwd_y = cosf(headingRad);
    float rgt_x = -fwd_y;
    float rgt_y = fwd_x;

    bool inCar = state[8] != 0;
    uint32_t playerCol = inCar ? 0xFF00FFFF : 0xFFFFFFFF; // Cyan in car, white on foot

    FrameVertex p_tip  = { cx + fwd_x * 6.5f, cy + fwd_y * 6.5f, 1.0f, 0.5f, 0.5f, playerCol };
    FrameVertex p_left = { cx - fwd_x * 4.0f - rgt_x * 4.0f, cy - fwd_y * 4.0f - rgt_y * 4.0f, 1.0f, 0.5f, 0.5f, playerCol };
    FrameVertex p_righ = { cx - fwd_x * 4.0f + rgt_x * 4.0f, cy - fwd_y * 4.0f + rgt_y * 4.0f, 1.0f, 0.5f, 0.5f, playerCol };

    verts.push_back(p_tip);
    verts.push_back(p_left);
    verts.push_back(p_righ);

    glBindTexture(GL_TEXTURE_2D, gWhiteTexture);
    SetBlend(kBlendAlpha);
    glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(FrameVertex), verts.data(), GL_STREAM_DRAW);
    glDrawArrays(GL_TRIANGLES, 0, (GLsizei)verts.size());
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

    // Render Native Circular Minimap Radar overlay
    RenderNativeMinimap(refWidth);

    SDL_GL_SwapWindow(gWindow);
}

} // extern "C"
