/* Browser-port declaration of the GBH renderer interface (d3ddll.dll).
 *
 * Shadows 3rdParty/GTA2Hax/d3ddll/d3ddll.hpp on the include path. Written for
 * the port from the interface the game uses (gbh_graphics.hpp typedefs and
 * the structures passed through it). No GTA2Hax or Direct3D SDK code.
 * Implementation: port/render/gbh_web.cpp.
 */
#pragma once
#include "../DmaVideo/DmaVideo.hpp"

typedef void(CC* TBeginSceneCB)();

struct STexture
{
    u16 field_0_id;
    u16 field_2;
    u16 field_4_pal_is_trans;
    u16 field_6_pal_size;
    void* field_8_locked_pixels_ptr;
    u8 field_C;
    u8 field_D;
    u16 field_E_width;
    u16 field_10_height;
    u8 field_12_bPalIsValid;
    u8 field_13_flags;
    BYTE* field_14_original_pixel_data_ptr;
    WORD* field_18_pPaltData;
    void* field_1C_ptr; // renderer-owned handle (a WebGL texture slot in the port)
};
#if !defined(GTA2_PORT)
static_assert(sizeof(STexture) == 0x20, "STexture layout");
#endif

/* Pre-transformed vertex: screen x/y, depth z, reciprocal w, colours, uv. */
struct Vert
{
    float x, y, z, w;
    DWORD diff;
    DWORD spec;
    float u, v;
};
static_assert(sizeof(Vert) == 0x20, "Vert layout");

struct Verts
{
    Vert mVerts[4];
};

struct SLight
{
    DWORD field_0;
    float field_4_x;
    float field_8_y;
    float field_C_z;
    DWORD field_10_colour;
};
static_assert(sizeof(SLight) == 0x14, "SLight layout");

#pragma pack(push, 1)
struct SImage
{
    BYTE field_0;
    BYTE field_1;
    BYTE field_2;
    BYTE field_3;
    DWORD field_4;
    DWORD field_8;
    WORD field_C_width;
    WORD field_E_height;
    BYTE field_10;
    BYTE field_11;
    DWORD field_12;
};
#pragma pack(pop)
static_assert(sizeof(SImage) == 0x16, "SImage layout");
