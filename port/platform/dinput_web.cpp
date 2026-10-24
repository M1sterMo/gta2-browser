// DirectInput 7 keyboard and mouse over browser input events.
//
// The shell calls gta2_port_key / gta2_port_mouse_* with DirectInput scan
// codes; devices expose both immediate state (GetDeviceState) and the
// buffered event queue (GetDeviceData) the game uses. No joysticks are
// enumerated yet (controller support is a later enhancement).
#include <windows.h>
#include <dinput.h>
#include <deque>
#include <emscripten.h>

#include "platform/port_api.h"

extern "C" {
const GUID GUID_XAxis = {0xA36D02E0, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_YAxis = {0xA36D02E1, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_ZAxis = {0xA36D02E2, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_RxAxis = {0xA36D02F4, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_RyAxis = {0xA36D02F5, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_RzAxis = {0xA36D02E3, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_Slider = {0xA36D02E4, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_Button = {0xA36D02F0, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_Key = {0x55728220, 0xD33C, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_POV = {0xA36D02F2, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_Unknown = {0xA36D02F3, 0xC9F3, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_SysMouse = {0x6F1D2B60, 0xD5A0, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID GUID_Joystick = {0x6F1D2B70, 0xD5A0, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID IID_IDirectInputDevice2A = {0x5944E682, 0xC92E, 0x11CF, {0xBF, 0xC7, 0x44, 0x45, 0x53, 0x54, 0x00, 0x00}};
const GUID gta2_diprop_guids[8] = {};
}

namespace
{
bool SameGuid(const GUID& a, const GUID& b)
{
    return memcmp(&a, &b, sizeof(GUID)) == 0;
}

BYTE gKeys[256];
// Keys pressed since the last state read: a tap shorter than one game frame
// still reads as down once (the game polls key state once per frame).
BYTE gLatched[256];
std::deque<DIDEVICEOBJECTDATA> gKeyEvents;
LONG gMouseDX = 0, gMouseDY = 0, gMouseDZ = 0;
BYTE gMouseButtons[4];
std::deque<DIDEVICEOBJECTDATA> gMouseEvents;
DWORD gSequence = 0;
// Diagnostics, read by the shell: [kbd GetDeviceData calls, events returned, GetDeviceState calls, acquires]
uint32_t gInputStats[4];

void Push(std::deque<DIDEVICEOBJECTDATA>& q, DWORD ofs, DWORD data)
{
    DIDEVICEOBJECTDATA e = {ofs, data, static_cast<DWORD>(gta2_port_now_ms()), ++gSequence};
    q.push_back(e);
    while (q.size() > 256)
    {
        q.pop_front();
    }
}

enum class Kind
{
    Keyboard,
    Mouse
};

class WebDevice final : public IDirectInputDevice2A
{
  public:
    explicit WebDevice(Kind k) : mKind(k)
    {
    }

    HRESULT QueryInterface(REFIID, void** out) override
    {
        AddRef();
        *out = this;
        return S_OK;
    }
    ULONG AddRef() override
    {
        return ++mRefs;
    }
    ULONG Release() override
    {
        const ULONG r = --mRefs;
        if (!r)
        {
            delete this;
        }
        return r;
    }
    HRESULT GetCapabilities(LPVOID) override
    {
        return DI_OK;
    }
    HRESULT EnumObjects(LPVOID, LPVOID, DWORD) override
    {
        return DI_OK;
    }
    HRESULT GetProperty(REFGUID, LPDIPROPHEADER) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT SetProperty(REFGUID, LPCDIPROPHEADER) override
    {
        return DI_OK;
    }
    HRESULT Acquire() override
    {
        gInputStats[3]++;
        mAcquired = true;
        return DI_OK;
    }
    HRESULT Unacquire() override
    {
        mAcquired = false;
        return DI_OK;
    }
    HRESULT GetDeviceState(DWORD size, LPVOID data) override
    {
        if (!mAcquired)
        {
            return DIERR_NOTACQUIRED;
        }
        if (mKind == Kind::Keyboard)
        {
            gInputStats[2]++;
            BYTE state[256];
            for (int i = 0; i < 256; ++i)
            {
                state[i] = gKeys[i] | gLatched[i];
            }
            memset(gLatched, 0, sizeof(gLatched));
            memcpy(data, state, size < sizeof(state) ? size : sizeof(state));
        }
        else
        {
            DIMOUSESTATE s = {gMouseDX, gMouseDY, gMouseDZ, {gMouseButtons[0], gMouseButtons[1], gMouseButtons[2], gMouseButtons[3]}};
            gMouseDX = gMouseDY = gMouseDZ = 0;
            memcpy(data, &s, size < sizeof(s) ? size : sizeof(s));
        }
        return DI_OK;
    }
    HRESULT GetDeviceData(DWORD objSize, LPDIDEVICEOBJECTDATA out, LPDWORD inOut, DWORD flags) override
    {
        if (!mAcquired)
        {
            return DIERR_NOTACQUIRED;
        }
        std::deque<DIDEVICEOBJECTDATA>& q = mKind == Kind::Keyboard ? gKeyEvents : gMouseEvents;
        if (mKind == Kind::Keyboard)
        {
            gInputStats[0]++;
        }
        const DWORD want = *inOut;
        DWORD n = 0;
        for (; n < want && n < q.size(); ++n)
        {
            if (out)
            {
                memcpy(reinterpret_cast<BYTE*>(out) + n * objSize, &q[n], sizeof(DIDEVICEOBJECTDATA));
            }
        }
        if (!(flags & DIGDD_PEEK))
        {
            q.erase(q.begin(), q.begin() + n);
        }
        *inOut = n;
        if (mKind == Kind::Keyboard && out && !(flags & DIGDD_PEEK))
        {
            gInputStats[1] += n;
        }
        return DI_OK;
    }
    HRESULT SetDataFormat(LPCDIDATAFORMAT) override
    {
        return DI_OK;
    }
    HRESULT SetEventNotification(HANDLE) override
    {
        return DI_OK;
    }
    HRESULT SetCooperativeLevel(HWND, DWORD) override
    {
        return DI_OK;
    }
    HRESULT GetObjectInfo(LPVOID, DWORD, DWORD) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT GetDeviceInfo(LPDIDEVICEINSTANCEA info) override
    {
        memset(info, 0, sizeof(*info));
        info->dwSize = sizeof(*info);
        info->dwDevType = mKind == Kind::Keyboard ? DIDEVTYPE_KEYBOARD : DIDEVTYPE_MOUSE;
        strcpy(info->tszInstanceName, mKind == Kind::Keyboard ? "Keyboard" : "Mouse");
        strcpy(info->tszProductName, info->tszInstanceName);
        return DI_OK;
    }
    HRESULT RunControlPanel(HWND, DWORD) override
    {
        return DI_OK;
    }
    HRESULT Initialize(HINSTANCE, DWORD, REFGUID) override
    {
        return DI_OK;
    }
    HRESULT CreateEffect(REFGUID, LPVOID, LPVOID*, LPUNKNOWN) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT EnumEffects(LPVOID, LPVOID, DWORD) override
    {
        return DI_OK;
    }
    HRESULT GetEffectInfo(LPVOID, REFGUID) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT GetForceFeedbackState(LPDWORD) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT SendForceFeedbackCommand(DWORD) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT EnumCreatedEffectObjects(LPVOID, LPVOID, DWORD) override
    {
        return DI_OK;
    }
    HRESULT Escape(LPVOID) override
    {
        return DIERR_UNSUPPORTED;
    }
    HRESULT Poll() override
    {
        return DI_NOEFFECT;
    }
    HRESULT SendDeviceData(DWORD, LPVOID, LPDWORD, DWORD) override
    {
        return DIERR_UNSUPPORTED;
    }

  private:
    Kind mKind;
    ULONG mRefs = 1;
    bool mAcquired = false;
};

class WebDirectInput final : public IDirectInputA
{
  public:
    HRESULT QueryInterface(REFIID, void** out) override
    {
        *out = this;
        return S_OK;
    }
    ULONG AddRef() override
    {
        return 1;
    }
    ULONG Release() override
    {
        return 1;
    }
    HRESULT CreateDevice(REFGUID guid, IDirectInputDeviceA** out, LPUNKNOWN) override
    {
        if (SameGuid(guid, GUID_SysKeyboard))
        {
            *out = new WebDevice(Kind::Keyboard);
            return DI_OK;
        }
        if (SameGuid(guid, GUID_SysMouse))
        {
            *out = new WebDevice(Kind::Mouse);
            return DI_OK;
        }
        *out = nullptr;
        return DIERR_DEVICENOTREG;
    }
    HRESULT EnumDevices(DWORD, LPDIENUMDEVICESCALLBACKA, LPVOID, DWORD) override
    {
        return DI_OK; // no game controllers yet
    }
    HRESULT GetDeviceStatus(REFGUID) override
    {
        return DI_OK;
    }
    HRESULT RunControlPanel(HWND, DWORD) override
    {
        return DI_OK;
    }
    HRESULT Initialize(HINSTANCE, DWORD) override
    {
        return DI_OK;
    }
};
WebDirectInput gDirectInput;
} // namespace

extern "C" {

HRESULT DirectInputCreateA(HINSTANCE, DWORD, LPDIRECTINPUTA* out, LPUNKNOWN)
{
    *out = &gDirectInput;
    return DI_OK;
}

// Shell input entry points. scancode is a DirectInput DIK_* code, vk a Win32
// virtual-key code, ch the typed character (0 if none).
EMSCRIPTEN_KEEPALIVE void gta2_port_key(int scancode, int vk, int down, int ch)
{
    if (scancode > 0 && scancode < 256)
    {
        const BYTE state = down ? 0x80 : 0x00;
        if (gKeys[scancode] != state || down)
        {
            Push(gKeyEvents, static_cast<DWORD>(scancode), state);
        }
        gKeys[scancode] = state;
        if (down)
        {
            gLatched[scancode] = 0x80;
        }
    }
    const LPARAM lp = 1 | (static_cast<LPARAM>(scancode & 0xFF) << 16) | (down ? 0 : (3u << 30));
    gta2_port_post_message(down ? WM_KEYDOWN : WM_KEYUP, static_cast<WPARAM>(vk), lp);
    if (down && ch)
    {
        gta2_port_post_message(WM_CHAR, static_cast<WPARAM>(ch), lp);
    }
}

EMSCRIPTEN_KEEPALIVE void gta2_port_mouse_move(int dx, int dy)
{
    gMouseDX += dx;
    gMouseDY += dy;
    if (dx)
    {
        Push(gMouseEvents, 0, static_cast<DWORD>(dx));
    }
    if (dy)
    {
        Push(gMouseEvents, 4, static_cast<DWORD>(dy));
    }
}

EMSCRIPTEN_KEEPALIVE void gta2_port_mouse_button(int button, int down)
{
    if (button >= 0 && button < 4)
    {
        gMouseButtons[button] = down ? 0x80 : 0;
        Push(gMouseEvents, 12 + button, gMouseButtons[button]);
    }
}

EMSCRIPTEN_KEEPALIVE const uint32_t* gta2_port_input_stats()
{
    return gInputStats;
}

// Releases every held key, e.g. when the page loses focus.
// Frontend.cpp (patch 0025): whether a key is down, or was pressed since the game last read the
// keyboard. The menus that come back after a game treat such keys as held until released.
int Gta2Port_KeyHeld(int scancode)
{
    return scancode > 0 && scancode < 256 && (gKeys[scancode] | gLatched[scancode]) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void gta2_port_release_all_keys()
{
    for (int sc = 1; sc < 256; ++sc)
    {
        if (gKeys[sc])
        {
            gKeys[sc] = 0;
            Push(gKeyEvents, static_cast<DWORD>(sc), 0);
        }
    }
}

} // extern "C"
