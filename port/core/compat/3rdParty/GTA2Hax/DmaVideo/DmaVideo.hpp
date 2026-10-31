/* Browser-port declaration of the DMA video driver interface (dmavideo.dll).
 *
 * Shadows 3rdParty/GTA2Hax/DmaVideo/DmaVideo.hpp on the include path. Written
 * for the port from the interface the game uses: export names, argument
 * lists and the SVideo fields the game reads. No GTA2Hax or DirectX SDK code.
 * Implementation: port/render/vid_web.cpp.
 */
#pragma once
#include <windows.h>
#include "types.hpp"

#define CC __stdcall

struct SVideoFunctions;
struct SDisplayMode;
struct SDevice;
class IDirectDrawSurface7Stub;

/* Field offsets match the original driver; the game reads 0x04..0x6C and
 * passes 0x134 to the Bink player. DirectDraw blocks are opaque padding. */
struct SVideo
{
    u32 field_0;
    u32 field_4_flags;
    u32 field_8_found_width;
    u32 field_C_found_height;
    u32 field_10_found_rgb_bit_count;
    u32 field_14_display_mode_count_2_q;
    u32 field_18_num_guids;
    u32 field_1C_num_display_modes;
    u32 field_20_num_enums;
    SDisplayMode* field_24_head_ptr;
    SDisplayMode* field_28_display_mode_array;
    SDevice* field_2C_device_info_head_ptr;
    SDevice* field_30_device_info_last;
    u32 field_34_active_device_id;
    u32 field_38;
    SDisplayMode* field_3C_current_enum_ptr;
    u32 field_40_full_screen;
    u32 field_44;
    u32 field_48_rect_right;
    u32 field_4C_rect_bottom;
    void* field_50_surface_pixels_ptr;
    u32 field_54_surface_pixels_pitch;
    u32 field_58;
    u32 field_5C;
    u32 field_60_g;
    u32 field_64_r;
    u32 field_68_b;
    u32 field_6C;
    u32 field_70;
    u32 field_74;
    u32 field_78;
    HINSTANCE field_7C_self_dll_handle;
    u32 field_80_active_mode_q;
    SVideoFunctions* field_84_from_initDLL;
    u32 field_88_last_error;
    void* field_8C_DirectDraw7;
    char buffer[144];
    void* field_120_IDDraw4;
    GUID field_124;
    IDirectDrawSurface7Stub* field_134_SurfacePrimary;
    IDirectDrawSurface7Stub* field_138_Surface;
    u8 field_13C_DDSurfaceDesc7[0x7C];
    void* field_1B8_clipper;
    u32 field_1BC;
    u32 field_1C0;
    u32 field_1C4;
    u8 field_1C8_device_caps[0x17C];
    u8 field_344_hel_caps[0x17C];
    HWND field_4C0_hwnd;
};
#if !defined(GTA2_PORT)
static_assert(sizeof(SVideo) == 0x4C4, "SVideo layout");
#endif

struct SDevice
{
    u32 field_0_id;
    u32 field_4_flags; // 0x1 keeps the window from minimising on WM_KILLFOCUS
    char* field_8_driver_name;
    char* field_C_driver_desc;
    SDevice* field_10_next_ptr;
    GUID* field_14_pDeviceGuid;
    GUID field_18_guid;
    u32 field_28_dwVidMemTotal;
    u32 field_2C_end_buffer;
};
#if !defined(GTA2_PORT)
static_assert(sizeof(SDevice) == 0x30, "SDevice layout");
#endif

struct SDisplayMode
{
    u32 field_0_display_mode_idx;
    u32 field_4_deviceId;
    u32 field_8_width;
    u32 field_C_height;
    u32 field_10_pitch;
    u32 field_14_rgb_bit_count;
    u32 field_18[8];
    SDisplayMode* field_38_pnext;
    u32 field_3C;
};
#if !defined(GTA2_PORT)
static_assert(sizeof(SDisplayMode) == 0x40, "SDisplayMode layout");
#endif

struct SVidVersion
{
    u32 mVersion;
    char mVersionString[255];
};

extern "C" {
SVidVersion* CC Vid_GetVersion();
SVideo* CC Vid_Init_SYS(HINSTANCE param1, u16 param2_flags);
s32 CC Vid_CheckMode(SVideo* pVideoDriver, s32 width, s32 height, s32 rgbBitCount);
SDevice* CC Vid_FindDevice(SVideo* pVideoDriver, s32 deviceId);
SDisplayMode* CC Vid_FindMode(SVideo* pVideoDriver, s32 modeId);
s32 CC Vid_FindFirstMode(SVideo* pVideoDriver, s32 rgbBitCountFilter);
s32 CC Vid_FindNextMode(SVideo* pVideoDriver);
void CC Vid_CloseScreen(SVideo* pVideo);
s32 CC Vid_SetDevice(SVideo* pVideoDriver, s32 deviceId);
s32 CC Vid_SetMode(SVideo* pVideoDriver, HWND hWnd, s32 modeId);
void CC Vid_GrabSurface(SVideo* pVideoDriver);
void CC Vid_ReleaseSurface(SVideo* pVideoDriver);
void CC Vid_FlipBuffers(SVideo* pVideo);
void CC Vid_ShutDown_SYS(SVideo* pVideoDriver);
s32 CC Vid_EnableWrites(SVideo* pVideoDriver);
s32 CC Vid_DisableWrites(SVideo* pVideoDriver);
s32 CC Vid_GetSurface(SVideo* pVideoDriver);
s32 CC Vid_FreeSurface(SVideo* pVideoDriver);
s32 CC Vid_ClearScreen(SVideo* pVideoDriver, u8 aR, u8 aG, u8 aB, s32 aLeft, s32 aTop, s32 aRight, s32 aBottom);
s32 CC Vid_SetGamma(SVideo* pVideoDriver, f32 a2, f32 a3, f32 a4);
s32 CC Vid_WindowProc(SVideo* pVideoDriver, HWND hwnd, u32 uMsg, WPARAM wParam, LPARAM lParam);
s32 CC Vid_InitDLL(HINSTANCE hInstance, SVideoFunctions* a2);
}

typedef SVidVersion*(CC* T_Vid_GetVersion)();
typedef SVideo*(CC* T_Vid_Init_SYS)(HINSTANCE param1, u16 param2_flags);
typedef s32(CC* T_Vid_CheckMode)(SVideo* pVideoDriver, s32 width, s32 height, s32 rgbBitCount);
typedef SDisplayMode*(CC* T_Vid_FindMode)(SVideo* pVideoDriver, s32 modeId);
typedef s32(CC* T_Vid_FindFirstMode)(SVideo* pVideoDriver, s32 rgbBitCountFilter);
typedef s32(CC* T_Vid_FindNextMode)(SVideo* pVideoDriver);
typedef SDevice*(CC* T_Vid_FindDevice)(SVideo* pVideoDriver, s32 deviceId);
typedef s32(CC* T_Vid_SetDevice)(SVideo* pVideoDriver, s32 deviceId);
typedef void(CC* T_Vid_CloseScreen)(SVideo* pVideo);
typedef s32(CC* T_Vid_SetMode)(SVideo* pVideoDriver, HWND hWnd, s32 modeId);
typedef void(CC* T_Vid_FlipBuffers)(SVideo* pVideo);
typedef void(CC* T_Vid_ReleaseSurface)(SVideo* pVideoDriver);
typedef void(CC* T_Vid_GrabSurface)(SVideo* pVideoDriver);
typedef void(CC* T_Vid_ShutDown_SYS)(SVideo* pVideoDriver);
typedef s32(CC* T_Vid_EnableWrites)(SVideo* pVideoDriver);
typedef s32(CC* T_Vid_DisableWrites)(SVideo* pVideoDriver);
typedef s32(CC* T_Vid_GetSurface)(SVideo* pVideoDriver);
typedef s32(CC* T_Vid_FreeSurface)(SVideo* pVideoDriver);
typedef s32(CC* T_Vid_ClearScreen)(SVideo* pVideoDriver, u8 aR, u8 aG, u8 aB, s32 aLeft, s32 aTop, s32 aRight, s32 aBottom);
typedef s32(CC* T_Vid_WindowProc)(SVideo* pVideoDriver, HWND hwnd, u32 uMsg, WPARAM wParam, LPARAM lParam);
typedef s32(CC* T_Vid_InitDLL)(HINSTANCE hInstance, SVideoFunctions* a2);
typedef s32(CC* T_Vid_SetGamma)(SVideo* pVideoDriver, f32 a2, f32 a3, f32 a4);

struct SVideoFunctions
{
    T_Vid_GetVersion* pVid_GetVersion;
    T_Vid_Init_SYS* pVid_Init_SYS;
    T_Vid_CheckMode* pVid_CheckMode;
    T_Vid_FindMode* pVid_FindMode;
    T_Vid_FindFirstMode* pVid_FindFirstMode;
    T_Vid_FindNextMode* pVid_FindNextMode;
    T_Vid_FindDevice* pVid_FindDevice;
    T_Vid_SetDevice* pVid_SetDevice;
    T_Vid_CloseScreen* pVid_CloseScreen;
    T_Vid_SetMode* pVid_SetMode;
    T_Vid_FlipBuffers* pVid_FlipBuffers;
    T_Vid_ReleaseSurface* pVid_ReleaseSurface;
    T_Vid_GrabSurface* pVid_GrabSurface;
    T_Vid_ShutDown_SYS* pVid_ShutDown_SYS;
    T_Vid_EnableWrites* pVid_EnableWrites;
    T_Vid_DisableWrites* pVid_DisableWrites;
    T_Vid_GetSurface* pVid_GetSurface;
    T_Vid_FreeSurface* pVid_FreeSurface;
    T_Vid_ClearScreen* pVid_ClearScreen;
    T_Vid_WindowProc* pVid_WindowProc;
    T_Vid_InitDLL* pVid_InitDLL;
    T_Vid_SetGamma* pVid_SetGamma;
};
