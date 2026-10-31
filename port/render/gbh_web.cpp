// The GBH renderer interface (d3ddll.dll) for the browser.
//
// The game hands this layer pre-transformed vertices in a 640x480 reference
// space, 8-bit paletted textures and per-draw flags. Each draw becomes
// triangles in a per-frame vertex array, batched while texture and blend mode
// stay the same; the WebGL2 renderer (web/renderer.js) draws the batches when
// the frame is presented. Textures are converted to RGBA once, on register,
// palette change or unlock. No depth buffer: draw order is the game's (D07).
//
// Semantics (flags, palette layout, lighting, tile UV rotation) follow the
// documented behaviour of the original driver interface.
#include <emscripten.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "gbh_graphics.hpp"
#include "platform/port_api.h"
#include "render/frame.h"

// ---------------------------------------------------------------------------
// JavaScript side (web/renderer.js via Module.gta2Renderer)
EM_JS(void, gta2_js_upload_texture, (int id, int w, int h, const void* rgba), {
    Module.gta2Renderer && Module.gta2Renderer.uploadTexture(id, w, h, HEAPU8.subarray(rgba, rgba + w * h * 4));
});
EM_JS(void, gta2_js_free_texture, (int id), { Module.gta2Renderer && Module.gta2Renderer.freeTexture(id); });
EM_JS(void, gta2_js_free_all_textures, (), { Module.gta2Renderer && Module.gta2Renderer.freeAllTextures(); });

namespace
{
constexpr u32 kFitToTexture = 0x10000;
constexpr u32 kAdditive = 0x200;
constexpr u32 kAlphaBlend = 0x180;
constexpr u32 kLighting = 0x8000;
constexpr u32 kUseVertexDiffuse = 0x2000;
constexpr u32 kTileUVGiven = 0x4000;

// Palettes: the game passes 256 32-bit colours stored as a column (stride 64
// DWORDs). The 16-bit copy the game can read through STexture is kept, and
// the palette id is stored just before it so textures can find the source.
struct Palette
{
    DWORD* original = nullptr;
    u16* data565 = nullptr; // points 2 u16 past the allocation (id stored there)
    u32 loaded = 0;
};
Palette gPalettes[16384];

u16 ToRGB565(u32 rgb)
{
    const u32 r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
    return static_cast<u16>(((r * 31 / 255) << 11) | ((g * 63 / 255) << 5) | (b * 31 / 255));
}

int PaletteIdOf(const u16* data565)
{
    if (!data565)
    {
        return -1;
    }
    u32 id;
    memcpy(&id, data565 - 2, 4);
    return static_cast<int>(id);
}

struct ImageEntry
{
    BOOL loaded;
    DWORD w, h;
    STexture* tex;
    u8* pixels; // a copy of the 16-bit image, to upload it again after a quick load
};
ImageEntry* gImages = nullptr;
u32 gImageCount = 0;

u32 gNextTextureId = 1;
std::vector<u8> gConvert;

// Paletted textures point into the style file's 256-pixel-wide pages, so
// every row is 256 bytes apart (the game indexes them as data[row * 256]).
constexpr int kPagePitch = 256;

// The game re-fills some STexture objects many times per frame (the shared
// text texture, digits, car damage) while the renderer draws at present time.
// Textures are therefore content-addressed: each distinct (pixels, size,
// palette) gets its own GPU texture, and STexture::field_1C_ptr is pointed at
// the one matching its current content when it is registered or unlocked.
std::unordered_map<uint64_t, intptr_t> gTextureByContent;

// Every texture the game holds, so a quick load can rebuild the GPU side (savestate_web.cpp).
std::unordered_set<STexture*> gLiveTextures;

uint64_t ContentKey(const u8* pix, int w, int h, int palId)
{
    uint64_t hash = 1469598103934665603ull;
    auto mix = [&](uint64_t v) {
        hash ^= v;
        hash *= 1099511628211ull;
    };
    mix(static_cast<uint64_t>(w) << 32 | static_cast<uint32_t>(h));
    mix(static_cast<uint32_t>(palId));
    for (int y = 0; y < h; ++y)
    {
        const u8* row = pix + static_cast<size_t>(y) * kPagePitch;
        for (int x = 0; x < w; ++x)
        {
            mix(row[x]);
        }
    }
    return hash;
}

void UploadPaletted(STexture* t)
{
    const int w = t->field_E_width, h = t->field_10_height;
    const u8* pix = t->field_14_original_pixel_data_ptr;
    const int palId = PaletteIdOf(t->field_18_pPaltData);
    if (!pix || w <= 0 || h <= 0 || w > kPagePitch)
    {
        return;
    }
    const uint64_t key = ContentKey(pix, w, h, palId);
    auto it = gTextureByContent.find(key);
    if (it != gTextureByContent.end())
    {
        t->field_1C_ptr = reinterpret_cast<void*>(it->second);
        return;
    }
    const intptr_t id = gNextTextureId++;
    gTextureByContent.emplace(key, id);
    t->field_1C_ptr = reinterpret_cast<void*>(id);

    gConvert.resize(static_cast<size_t>(w) * h * 4);
    const DWORD* pal = palId >= 0 && gPalettes[palId].loaded ? gPalettes[palId].original : nullptr;
    for (int y = 0; y < h; ++y)
    {
        const u8* row = pix + static_cast<size_t>(y) * kPagePitch;
        for (int x = 0; x < w; ++x)
        {
            const u8 idx = row[x];
            const u32 rgb = pal ? pal[idx * 64] : (idx * 0x010101u);
            u8* o = &gConvert[(static_cast<size_t>(y) * w + x) * 4];
            o[0] = (rgb >> 16) & 0xFF;
            o[1] = (rgb >> 8) & 0xFF;
            o[2] = rgb & 0xFF;
            o[3] = idx == 0 ? 0 : 255; // colour 0 of every palette is transparent
        }
    }
    gta2_js_upload_texture(static_cast<int>(id), w, h, gConvert.data());
}

// 16-bit RGB555 TGA images (front-end backgrounds), stored bottom-up.
void UploadImage(STexture* t, const u8* src)
{
    const int w = t->field_E_width, h = t->field_10_height;
    gConvert.resize(static_cast<size_t>(w) * h * 4);
    for (int y = 0; y < h; ++y)
    {
        for (int x = 0; x < w; ++x)
        {
            u16 p;
            memcpy(&p, src + (static_cast<size_t>(y) * w + x) * 2, 2);
            u8* o = &gConvert[(static_cast<size_t>(h - 1 - y) * w + x) * 4];
            o[0] = static_cast<u8>(((p >> 10) & 31) * 255 / 31);
            o[1] = static_cast<u8>(((p >> 5) & 31) * 255 / 31);
            o[2] = static_cast<u8>((p & 31) * 255 / 31);
            o[3] = 255;
        }
    }
    gta2_js_upload_texture(reinterpret_cast<intptr_t>(t->field_1C_ptr), w, h, gConvert.data());
}

STexture* NewTexture(s32 w, s32 h, BYTE* data)
{
    auto* t = static_cast<STexture*>(calloc(1, sizeof(STexture)));
    static u16 sNextId = 0;
    t->field_0_id = sNextId++;
    t->field_E_width = static_cast<u16>(w);
    t->field_10_height = static_cast<u16>(h);
    t->field_14_original_pixel_data_ptr = data;
    gLiveTextures.insert(t);
    return t;
}

// Window and lights
float gWinLeft = 0, gWinTop = 0, gWinRight = 640, gWinBottom = 480;
float gAmbient = 255.0f; // ambient * 255, as the original driver keeps it

struct Light
{
    u32 flags;
    float brightness, radius, radiusSq, invRadius, x, y, z, r, g, b;
};
Light gLights[256];
u32 gLightCount = 0;

u32 LitColour(const Vert& world, u8 multiplier, u32 colour)
{
    float lr = 0, lg = 0, lb = 0;
    for (u32 i = 0; i < gLightCount; ++i)
    {
        const Light& l = gLights[i];
        if ((l.flags & 0x30000) != 0x10000)
        {
            continue;
        }
        const float dx = world.x - l.x, dy = world.y - l.y, dz = world.z - l.z;
        const float d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > l.radiusSq)
        {
            continue;
        }
        const float att = (l.radius - sqrtf(d2)) * l.invRadius;
        if (att > 0)
        {
            const float k = att * l.brightness;
            lr += l.r * k;
            lg += l.g * k;
            lb += l.b * k;
        }
    }
    const float m = multiplier / 255.0f;
    auto ch = [&](u32 c, float light) {
        const float v = m * c * light + gAmbient;
        return static_cast<u32>(v > 255 ? 255 : v < 0 ? 0 : v);
    };
    return (colour & 0xFF000000) | (ch((colour >> 16) & 0xFF, lr) << 16) | (ch((colour >> 8) & 0xFF, lg) << 8) |
        ch(colour & 0xFF, lb);
}

void Draw(u32 flags, STexture* tex, Vert* v, int count, u32 baseColour)
{
    if (count < 3 || count > 4 || !tex || v[0].z <= 0.0f)
    {
        return;
    }
    const float tw = tex->field_E_width, th = tex->field_10_height;
    if (flags & kFitToTexture)
    {
        static const float k[4][2] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};
        for (int i = 0; i < count; ++i)
        {
            v[i].x = v[0].x + k[i][0] * tw;
            v[i].y = v[0].y + k[i][1] * th;
            v[i].z = v[0].z;
            v[i].u = k[i][0] * tw;
            v[i].v = k[i][1] * th;
        }
    }
    for (int i = 0; i < count; ++i)
    {
        v[i].w = v[i].z;
    }
    if (!(flags & kUseVertexDiffuse))
    {
        const u32 g = baseColour & 0xFF;
        for (int i = 0; i < count; ++i)
        {
            v[i].diff = 0xFF000000u | (g << 16) | (g << 8) | g;
            v[i].spec = 255;
        }
    }
    if ((flags & kLighting) && gAmbient != 255.0f)
    {
        // The game appends the world-space positions after the screen vertices.
        for (int i = 0; i < count; ++i)
        {
            v[i].diff = LitColour(v[i + 4], static_cast<u8>(baseColour), v[i].diff);
        }
    }
    const u32 blend = (flags & kAdditive) ? kBlendAdditive : (flags & kAlphaBlend) ? kBlendAlpha : kBlendOpaque;
    const u32 texId = static_cast<u32>(reinterpret_cast<intptr_t>(tex->field_1C_ptr));
    static const int kFan[2][3] = {{0, 1, 2}, {0, 2, 3}};
    for (int t = 0; t < count - 2; ++t)
    {
        for (int c = 0; c < 3; ++c)
        {
            const Vert& s = v[kFan[t][c]];
            const u32 d = s.diff;
            FrameVertex fv = {s.x - 0.5f, s.y - 0.5f, s.w, s.u / tw, s.v / th,
                              ((d >> 16) & 0xFF) | (d & 0xFF00) | ((d & 0xFF) << 16) | (d & 0xFF000000u)};
            gta2_frame_push_vertex(texId, blend, fv);
        }
    }
}

// Tiles: default UVs cover the 64x64 tile; flags rotate (0x20/0x40/0x60) and
// flip (0x08 vertical, 0x10 horizontal) the mapping.
void DrawTile(u32 flags, STexture* tex, Vert* p, u32 colour)
{
    u32 drawFlags = flags;
    if (!(flags & kTileUVGiven))
    {
        const float lo = 0.5f, hi = 63.4999f;
        p[0].u = lo, p[0].v = lo;
        p[1].u = hi, p[1].v = lo;
        p[2].u = hi, p[2].v = hi;
        p[3].u = lo, p[3].v = hi;
    }
    float u[4], w[4];
    for (int i = 0; i < 4; ++i)
    {
        u[i] = p[i].u, w[i] = p[i].v;
    }
    auto assign = [&](const int (&order)[4]) {
        for (int i = 0; i < 4; ++i)
        {
            p[i].u = u[order[i]], p[i].v = w[order[i]];
        }
        for (int i = 0; i < 4; ++i)
        {
            u[i] = p[i].u, w[i] = p[i].v;
        }
    };
    switch (flags & 0x60)
    {
        case 0x20:
            assign({3, 0, 1, 2});
            break;
        case 0x40:
            drawFlags = flags ^ 0x18; // 180 degrees: both flips
            break;
        case 0x60:
            assign({1, 2, 3, 0});
            break;
    }
    if (drawFlags & 0x08)
    {
        assign({1, 0, 3, 2});
    }
    if (drawFlags & 0x10)
    {
        assign({3, 2, 1, 0});
    }
    Draw(drawFlags, tex, p, 4, colour);
}

u32 gGlobals[64];
int gScreenTable[1700];
} // namespace

// ---------------------------------------------------------------------------
// Exported interface. Signatures match the game's T_* typedefs exactly
// (gbh_graphics.hpp); exports.cpp checks that at compile time.
extern "C" {

void CC ConvertColourBank(BYTE*)
{
}
s32 CC DrawLine(s32, s32 a2, s32, s32 a4, s32)
{
    return abs(a4 - a2);
}
void CC SetShadeTableA(s32, s32, s32, s32, s32)
{
}
s32* CC MakeScreenTable(s32 value, s32 step, u32 count)
{
    s32* p = gScreenTable;
    for (u32 i = 0; i < count && i < 1700; ++i)
    {
        *p++ = value;
        value += step;
    }
    return p;
}

u32 CC gbh_InitDLL(SVideo*)
{
    static const u32 kCacheDefaults[12] = {10, 62, 62, 88, 1, 0, 110, 126, 126, 40, 10, 0};
    memcpy(&gGlobals[40], kCacheDefaults, sizeof(kCacheDefaults));
    return 1;
}
s32 CC gbh_Init(s32)
{
    return 0;
}
void CC gbh_CloseDLL()
{
}
void CC gbh_CloseScreen(SVideo*)
{
}
u32* CC gbh_GetGlobals()
{
    return gGlobals;
}
s32 CC gbh_GetUsedCache(s32)
{
    return 0;
}
s32 CC gbh_SetColourDepth()
{
    return 1;
}
s32 CC gbh_SetCamera(float, float, float, float)
{
    return 0;
}
void CC gbh_SetWindow(float left, float top, float right, float bottom)
{
    gWinLeft = left, gWinTop = top, gWinRight = right, gWinBottom = bottom;
}
void CC gbh_SetAmbient(float a)
{
    gAmbient = a * 255.0f;
}
void CC gbh_ResetLights()
{
    gLightCount = 0;
}
s32 CC gbh_AddLight(SLight* l)
{
    if (gLightCount >= 256)
    {
        return -1;
    }
    Light& d = gLights[gLightCount];
    const float k = 1.0f / 255.0f;
    d.flags = l->field_0;
    d.brightness = (l->field_0 & 0xFF) * k;
    d.x = l->field_4_x, d.y = l->field_8_y, d.z = l->field_C_z;
    d.r = ((l->field_10_colour >> 16) & 0xFF) * k;
    d.g = ((l->field_10_colour >> 8) & 0xFF) * k;
    d.b = (l->field_10_colour & 0xFF) * k;
    d.radius = ((l->field_0 >> 8) & 0xFF) * k * 8.0f;
    d.radiusSq = d.radius * d.radius;
    d.invRadius = d.radius > 0 ? 1.0f / d.radius : 0;
    return static_cast<s32>(gLightCount++ * 0x2C);
}

void CC gbh_BeginScene()
{
}
void CC gbh_EndScene()
{
}
void CC gbh_BeginLevel()
{
}
void CC gbh_EndLevel()
{
}

u32 CC gbh_RegisterPalette(s32 id, DWORD* data)
{
    if (id < 0 || id >= 16384)
    {
        return 0;
    }
    DWORD* p = data;
    for (int i = 0; i < 256; ++i, p += 64)
    {
        if (i == 0)
        {
            *p = 0; // colour 0 is transparent
        }
        else if (*p == 0)
        {
            *p = 0x10000; // keeps other black entries opaque
        }
    }
    Palette& pal = gPalettes[id];
    if (pal.data565)
    {
        free(pal.data565 - 2);
    }
    u16* block = static_cast<u16*>(malloc((2 + 512) * sizeof(u16)));
    const u32 id32 = static_cast<u32>(id);
    memcpy(block, &id32, 4);
    pal.data565 = block + 2;
    pal.original = data;
    pal.loaded = 1;
    for (int i = 0; i < 256; ++i)
    {
        pal.data565[i] = pal.data565[256 + i] = ToRGB565(data[i * 64]);
    }
    return static_cast<u32>(id);
}
void CC gbh_FreePalette(s32 id)
{
    if (id >= 0 && id < 16384 && gPalettes[id].data565)
    {
        free(gPalettes[id].data565 - 2);
        gPalettes[id] = Palette();
    }
}

STexture* CC gbh_RegisterTexture(s32 width, s32 height, BYTE* data, s32 palId, char_type)
{
    STexture* t = NewTexture(width, height, data);
    if (palId >= 0 && palId < 16384)
    {
        t->field_12_bPalIsValid = static_cast<u8>(gPalettes[palId].loaded);
        t->field_18_pPaltData = gPalettes[palId].data565;
    }
    UploadPaletted(t);
    return t;
}
void CC gbh_AssignPalette(STexture* t, s32 palId)
{
    if (palId < 0 || palId >= 16384)
    {
        return;
    }
    t->field_18_pPaltData = gPalettes[palId].data565;
    t->field_12_bPalIsValid = static_cast<u8>(gPalettes[palId].loaded);
    if (!(t->field_13_flags & 1))
    {
        UploadPaletted(t);
    }
}
STexture* CC gbh_LockTexture(STexture* t)
{
    t->field_8_locked_pixels_ptr = t->field_14_original_pixel_data_ptr;
    t->field_13_flags |= 1;
    t->field_6_pal_size = 256;
    return t;
}
STexture* CC gbh_UnlockTexture(STexture* t)
{
    t->field_6_pal_size = 0;
    t->field_8_locked_pixels_ptr = nullptr;
    t->field_13_flags &= 0xFE;
    UploadPaletted(t);
    return t;
}
void CC gbh_FreeTexture(STexture* t)
{
    // GPU textures are shared by content; they stay cached (see UploadPaletted).
    gLiveTextures.erase(t);
    free(t);
}

s32 CC gbh_InitImageTable(s32 size)
{
    gImages = static_cast<ImageEntry*>(calloc(size, sizeof(ImageEntry)));
    gImageCount = gImages ? static_cast<u32>(size) : 0;
    return gImages ? 0 : -1;
}
s32 CC gbh_FreeImageTable()
{
    for (u32 i = 0; i < gImageCount; ++i)
    {
        if (gImages[i].loaded)
        {
            gbh_FreeTexture(gImages[i].tex);
            free(gImages[i].pixels);
        }
    }
    free(gImages);
    gImages = nullptr;
    gImageCount = 0;
    return 0;
}
// SImage is a TGA header followed by the image id and 16-bit pixels.
s32 CC gbh_LoadImage(SImage* img)
{
    if (!img || img->field_1 || img->field_2 != 2 || img->field_10 != 16)
    {
        return -2;
    }
    for (u32 i = 0; i < gImageCount; ++i)
    {
        if (!gImages[i].loaded)
        {
            STexture* t = NewTexture(img->field_C_width, img->field_E_height, nullptr);
            t->field_1C_ptr = reinterpret_cast<void*>(static_cast<intptr_t>(gNextTextureId++));
            const u8* src = reinterpret_cast<const u8*>(&img->field_12) + img->field_0;
            UploadImage(t, src);
            const size_t bytes = static_cast<size_t>(img->field_C_width) * img->field_E_height * 2;
            u8* copy = static_cast<u8*>(malloc(bytes));
            if (copy)
            {
                memcpy(copy, src, bytes);
            }
            gImages[i] = {TRUE, img->field_C_width, img->field_E_height, t, copy};
            return static_cast<s32>(i);
        }
    }
    return -1;
}
s32 CC gbh_BlitImage(s32 index, s32 left, s32 top, s32 right, s32 bottom, s32 x, s32 y)
{
    if (index < 0 || static_cast<u32>(index) >= gImageCount || !gImages[index].loaded)
    {
        return -1;
    }
    Vert v[8] = {};
    const float w = static_cast<float>(right - left), h = static_cast<float>(bottom - top);
    const float xs[4] = {0, w, w, 0}, ys[4] = {0, 0, h, h};
    for (int i = 0; i < 4; ++i)
    {
        v[i].x = x + xs[i];
        v[i].y = y + ys[i];
        v[i].z = v[i].w = 1.0f;
        v[i].u = left + xs[i];
        v[i].v = top + ys[i];
        v[i].diff = 0xFFFFFFFF;
    }
    Draw(kUseVertexDiffuse, gImages[index].tex, v, 4, 0xFF);
    return 0;
}

void CC gbh_DrawQuad(s32 flags, STexture* t, Vert* v, s32 colour)
{
    Draw(static_cast<u32>(flags), t, v, 4, static_cast<u32>(colour));
}
void CC gbh_DrawTriangle(s32 flags, STexture* t, Vert* v, u8 colour)
{
    Draw(static_cast<u32>(flags), t, v, 3, colour);
}
s32 CC gbh_DrawTilePart(u32 flags, STexture* t, Vert* v, s32 colour)
{
    DrawTile(flags, t, v, static_cast<u32>(colour));
    return 0;
}
s32 CC gbh_DrawTile(u32 flags, STexture* t, Vert* v, u8 colour)
{
    DrawTile(flags, t, v, colour);
    return 0;
}

// Present in the interface but not used by the game in practice.
s32 CC gbh_BlitBuffer(s32, s32, s32, s32, s32, s32)
{
    return 0;
}
void CC gbh_DrawQuadClipped(s32, s32, s32, s32, s32)
{
}
s32 CC gbh_DrawFlatRect(Vert*, s32)
{
    return 0;
}
void CC gbh_Plot(f32, f32, s32, s32)
{
}
s32 CC gbh_PrintBitmap(s32, s32)
{
    return 0;
}
u32 CC gbh_Convert16BitGraphic(s32, u32, WORD*, s32)
{
    return 0;
}
u32 CC gbh_ConvertColour(u8 r, u8 g, u8 b)
{
    return (static_cast<u32>(r) << 16) | (static_cast<u32>(g) << 8) | b;
}

} // extern "C"

// Quick load (savestate_web.cpp): the game's memory was replaced, so the browser's textures no
// longer match the ids in it (after a page reload there are none). Every texture the game holds
// is uploaded again, under fresh ids, and the browser forgets the rest.
void Gta2Port_ReuploadTextures()
{
    gta2_js_free_all_textures();
    gTextureByContent.clear();
    for (STexture* t : gLiveTextures)
    {
        if (t->field_14_original_pixel_data_ptr)
        {
            UploadPaletted(t);
        }
    }
    for (u32 i = 0; i < gImageCount; ++i)
    {
        if (gImages[i].loaded && gImages[i].pixels)
        {
            UploadImage(gImages[i].tex, gImages[i].pixels);
        }
    }
}
