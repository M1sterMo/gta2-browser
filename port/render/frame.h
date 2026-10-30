// Per-frame draw list shared by the GBH renderer and the video driver, read
// by web/renderer.js when a frame is presented.
#pragma once
#include <stdint.h>

enum : uint32_t
{
    kBlendOpaque = 0, // texture alpha 0 is discarded (palette colour 0)
    kBlendAlpha = 1,  // src-alpha / one-minus-src-alpha, alpha modulated by diffuse
    kBlendAdditive = 2
};

// 24 bytes. x/y are in the game's reference space (480 high, 640 or the
// widescreen view width across); w is the
// reciprocal-W the game supplies (used for perspective-correct texturing).
struct FrameVertex
{
    float x, y, w, u, v;
    uint32_t rgba; // little-endian R,G,B,A bytes
};

// 40 bytes. kind 0 = triangles, kind 1 = clear (colour + rect).
struct FrameCommand
{
    uint32_t kind, texture, blend, first, count, colour;
    int32_t rect[4];
};

extern "C" {
void gta2_frame_push_vertex(uint32_t texture, uint32_t blend, const FrameVertex& v);
void gta2_frame_clear(uint8_t r, uint8_t g, uint8_t b, int32_t left, int32_t top, int32_t right, int32_t bottom);
void gta2_frame_present();
void gta2_frame_discard(); // the commands so far are dropped (a draw nobody sees)
// Called by the game (port patch in Game_0x40::Draw); reset after each present.
void Gta2Port_SetFrameLayout(int32_t width, int32_t hudOffsetX);
// Keep the HUD's commands of a full draw / replay them in an interpolated draw (D04).
void Gta2Port_HudBegin();
void Gta2Port_HudEnd();
void Gta2Port_HudReplay();
}
