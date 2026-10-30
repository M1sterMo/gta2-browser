// Draw-list storage and presentation (see frame.h).
#include "render/frame.h"
#include <emscripten.h>
#include <vector>

#include "platform/port_api.h"

EM_JS(void, gta2_js_present, (const void* cmds, int cmdCount, const void* verts, int vertCount, int refWidth), {
    Module.gta2Renderer && Module.gta2Renderer.present(cmds, cmdCount, verts, vertCount, refWidth);
});

namespace
{
std::vector<FrameVertex> gVerts;
std::vector<FrameCommand> gCmds;
uint32_t gPresents = 0;

// Gameplay frames are as wide as the selected view (widescreen); everything
// else (menus, loading screens, movies) is laid out in the 640x480 box and
// shown pillarboxed. The game sets the layout per frame (Game_0x40::Draw).
int32_t gFrameWidth = 640;
float gHudOffsetX = 0.0f;

// The HUD part of the last full draw, replayed by interpolated draws between
// game updates (Game_0x40::Draw, port patch; D04).
std::vector<FrameVertex> gHudVerts;
std::vector<FrameCommand> gHudCmds;
size_t gHudCmdStart = 0, gHudVertStart = 0;
} // namespace

extern "C" {

void gta2_frame_push_vertex(uint32_t texture, uint32_t blend, const FrameVertex& v)
{
    if (gCmds.empty() || gCmds.back().kind != 0 || gCmds.back().texture != texture || gCmds.back().blend != blend)
    {
        FrameCommand c = {0, texture, blend, static_cast<uint32_t>(gVerts.size()), 0, 0, {0, 0, 0, 0}};
        gCmds.push_back(c);
    }
    gCmds.back().count++;
    gVerts.push_back(v);
    gVerts.back().x += gHudOffsetX;
}

void gta2_frame_clear(uint8_t r, uint8_t g, uint8_t b, int32_t left, int32_t top, int32_t right, int32_t bottom)
{
    FrameCommand c = {1, 0, 0, 0, 0, static_cast<uint32_t>(r) | (static_cast<uint32_t>(g) << 8) | (static_cast<uint32_t>(b) << 16),
                      {left, top, right, bottom}};
    gCmds.push_back(c);
}

void gta2_frame_present()
{
    gta2_js_present(gCmds.data(), static_cast<int>(gCmds.size()), gVerts.data(), static_cast<int>(gVerts.size()), gFrameWidth);
    gCmds.clear();
    gVerts.clear();
    gFrameWidth = 640;
    gHudOffsetX = 0.0f;
    ++gPresents;
}

// A draw nobody sees (co-op prediction, winmain.cpp): its commands are dropped, not presented.
void gta2_frame_discard()
{
    gCmds.clear();
    gVerts.clear();
    gFrameWidth = 640;
    gHudOffsetX = 0.0f;
}

// Read by the game's HUD (Hud.cpp, port patch): anchor HUD parts to the screen edges in widescreen.
int32_t gGta2PortHudEdges = 1;

EMSCRIPTEN_KEEPALIVE void gta2_port_set_hud_edges(int on)
{
    gGta2PortHudEdges = on ? 1 : 0;
}

void Gta2Port_HudBegin()
{
    gHudCmdStart = gCmds.size();
    gHudVertStart = gVerts.size();
}

void Gta2Port_HudEnd()
{
    gHudVerts.assign(gVerts.begin() + static_cast<long>(gHudVertStart), gVerts.end());
    gHudCmds.assign(gCmds.begin() + static_cast<long>(gHudCmdStart), gCmds.end());
    for (FrameCommand& c : gHudCmds)
    {
        if (c.kind == 0)
        {
            c.first -= static_cast<uint32_t>(gHudVertStart);
        }
    }
}

void Gta2Port_HudReplay()
{
    const uint32_t base = static_cast<uint32_t>(gVerts.size());
    gVerts.insert(gVerts.end(), gHudVerts.begin(), gHudVerts.end());
    for (FrameCommand c : gHudCmds)
    {
        if (c.kind == 0)
        {
            c.first += base;
        }
        gCmds.push_back(c);
    }
}

// Read by the game (Source/port_interpolation.cpp): display-rate interpolation on/off.
extern "C" int32_t gGta2PortInterpolate;
EMSCRIPTEN_KEEPALIVE void gta2_port_set_interpolation(int on)
{
    gGta2PortInterpolate = on ? 1 : 0;
}

void Gta2Port_SetFrameLayout(int32_t width, int32_t hudOffsetX)
{
    gFrameWidth = width > 0 ? width : 640;
    gHudOffsetX = static_cast<float>(hudOffsetX);
}

uint32_t gta2_port_present_count()
{
    return gPresents;
}

} // extern "C"
