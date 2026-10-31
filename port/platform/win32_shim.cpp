// The Win32 surface gta2_re uses, implemented for a single browser canvas.
//
// One window, one message queue fed by the shell's input events, an in-memory
// registry (seeded and persisted by the shell), and LoadLibrary/GetProcAddress
// that hand out the port's renderer (gbh_*) and video (Vid_*) functions.
#include <windows.h>
#include <dinput.h>
#include <deque>
#include <emscripten.h>
#include <map>
#include <string>
#include <vector>

#include "platform/port_api.h"

namespace
{
// ---------------------------------------------------------------- window
struct WindowClass
{
    WNDPROC proc = nullptr;
};
inline std::map<std::string, WindowClass>& GetClasses() {
    static std::map<std::string, WindowClass> sClasses;
    return sClasses;
}
#define gClasses (GetClasses())

WNDPROC gWndProc = nullptr;
HWND const kMainWindow = reinterpret_cast<HWND>(0x1000);
bool gWindowAlive = false;
LONG gWindowLongs[32] = {};
int gCursorCount = 0;
bool gShown = false;

inline std::deque<MSG>& GetQueue() {
    static std::deque<MSG> sQueue;
    return sQueue;
}
#define gQueue (GetQueue())

std::string Lower(const char* s)
{
    std::string r = s ? s : "";
    for (char& c : r)
    {
        c = static_cast<char>(tolower(static_cast<unsigned char>(c)));
    }
    return r;
}

LRESULT Send(UINT msg, WPARAM wp, LPARAM lp)
{
    return gWndProc && gWindowAlive ? gWndProc(kMainWindow, msg, wp, lp) : 0;
}

// ---------------------------------------------------------------- registry
struct RegValue
{
    DWORD type = REG_NONE;
    std::vector<BYTE> data;
};
inline std::map<std::string, std::map<std::string, RegValue>>& GetRegistry() {
    static std::map<std::string, std::map<std::string, RegValue>> sRegistry;
    return sRegistry;
}
#define gRegistry (GetRegistry())

inline std::map<uintptr_t, std::string>& GetOpenKeys() {
    static std::map<uintptr_t, std::string> sOpenKeys;
    return sOpenKeys;
}
#define gOpenKeys (GetOpenKeys())

uintptr_t gNextKey = 0x100;

std::string RootName(HKEY root)
{
    switch (reinterpret_cast<uintptr_t>(root))
    {
        case 0x80000000:
            return "hkcr";
        case 0x80000001:
            return "hkcu";
        case 0x80000002:
            return "hklm";
        case 0x80000003:
            return "hku";
    }
    auto it = gOpenKeys.find(reinterpret_cast<uintptr_t>(root));
    return it != gOpenKeys.end() ? it->second : std::string();
}

std::string KeyPath(HKEY root, const char* sub)
{
    std::string path = RootName(root);
    std::string s = Lower(sub);
    for (char& c : s)
    {
        if (c == '/')
        {
            c = '\\';
        }
    }
    // The 32-bit game sees HKLM\SOFTWARE; normalise away any WOW64 alias.
    if (!s.empty())
    {
        path += "\\" + s;
    }
    return path;
}

HKEY NewHandle(const std::string& path)
{
    const uintptr_t h = gNextKey++;
    gOpenKeys[h] = path;
    return reinterpret_cast<HKEY>(h);
}
} // namespace

// ------------------------------------------------------------------ exports for the shell and renderer
extern "C" {

EMSCRIPTEN_KEEPALIVE void gta2_port_reg_set_dword(const char* path, const char* name, DWORD value)
{
    RegValue& v = gRegistry[Lower(path)][Lower(name)];
    v.type = REG_DWORD;
    v.data.assign(reinterpret_cast<BYTE*>(&value), reinterpret_cast<BYTE*>(&value) + 4);
}

EMSCRIPTEN_KEEPALIVE void gta2_port_reg_set_string(const char* path, const char* name, const char* value)
{
    RegValue& v = gRegistry[Lower(path)][Lower(name)];
    v.type = REG_SZ;
    v.data.assign(value, value + strlen(value) + 1);
}

// Serialises DWORD and string values as "path|name|type|value\n" for the
// shell to persist in browser storage.
EMSCRIPTEN_KEEPALIVE const char* gta2_port_reg_export()
{
    static std::string out;
    out.clear();
    for (auto& key : gRegistry)
    {
        for (auto& val : key.second)
        {
            if (val.second.type == REG_DWORD && val.second.data.size() == 4)
            {
                DWORD d;
                memcpy(&d, val.second.data.data(), 4);
                out += key.first + "|" + val.first + "|d|" + std::to_string(d) + "\n";
            }
            else if (val.second.type == REG_SZ && !val.second.data.empty())
            {
                out += key.first + "|" + val.first + "|s|" + reinterpret_cast<const char*>(val.second.data.data()) + "\n";
            }
        }
    }
    return out.c_str();
}

void gta2_port_post_message(UINT msg, WPARAM wp, LPARAM lp)
{
    MSG m = {};
    m.hwnd = kMainWindow;
    m.message = msg;
    m.wParam = wp;
    m.lParam = lp;
    m.time = static_cast<DWORD>(gta2_port_now_ms());
    gQueue.push_back(m);
}

// ------------------------------------------------------------------ time, process, misc
DWORD timeGetTime(void)
{
    return static_cast<DWORD>(gta2_port_now_ms());
}
DWORD GetTickCount(void)
{
    return timeGetTime();
}
void Sleep(DWORD)
{
    // The browser cannot block; callers only use Sleep to yield or pause briefly.
}
BOOL QueryPerformanceCounter(LARGE_INTEGER* c)
{
    c->QuadPart = static_cast<LONGLONG>(gta2_port_now_ms() * 1000.0);
    return TRUE;
}
BOOL QueryPerformanceFrequency(LARGE_INTEGER* f)
{
    f->QuadPart = 1000000;
    return TRUE;
}
DWORD GetLastError(void)
{
    return 0;
}
void SetLastError(DWORD)
{
}
void OutputDebugStringA(LPCSTR s)
{
    fprintf(stderr, "%s", s);
}
int MessageBoxA(HWND, LPCSTR text, LPCSTR caption, UINT)
{
    fprintf(stderr, "[MessageBox] %s: %s\n", caption ? caption : "", text ? text : "");
    EM_ASM({ if (Module.onGameMessage) Module.onGameMessage(UTF8ToString($0), UTF8ToString($1)); }, caption ? caption : "",
           text ? text : "");
    return IDOK;
}
HRESULT CoInitialize(LPVOID)
{
    return S_OK;
}
void CoUninitialize(void)
{
}
HANDLE CreateMutexA(LPSECURITY_ATTRIBUTES, BOOL, LPCSTR)
{
    return reinterpret_cast<HANDLE>(0x2000);
}
HANDLE OpenMutexA(DWORD, BOOL, LPCSTR)
{
    return nullptr; // no other instance is running
}
BOOL ReleaseMutex(HANDLE)
{
    return TRUE;
}
BOOL CloseHandle(HANDLE)
{
    return TRUE;
}
BOOL GetComputerNameA(LPSTR buf, LPDWORD size)
{
    const char name[] = "BROWSER";
    if (*size < sizeof(name))
    {
        return FALSE;
    }
    memcpy(buf, name, sizeof(name));
    *size = sizeof(name) - 1;
    return TRUE;
}
BOOL GetKeyboardLayoutNameA(LPSTR buf)
{
    strcpy(buf, "00000409"); // US English
    return TRUE;
}
HINSTANCE ShellExecuteA(HWND, LPCSTR, LPCSTR file, LPCSTR, LPCSTR, INT)
{
    fprintf(stderr, "ShellExecute(%s) is not available in the browser\n", file ? file : "");
    return reinterpret_cast<HINSTANCE>(2); // <= 32 means failure
}
int wsprintfA(LPSTR buf, LPCSTR fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    const int n = vsprintf(buf, fmt, ap);
    va_end(ap);
    return n;
}
int wvsprintfA(LPSTR buf, LPCSTR fmt, va_list ap)
{
    return vsprintf(buf, fmt, ap);
}

// ------------------------------------------------------------------ libraries
HMODULE LoadLibraryA(LPCSTR name)
{
    const std::string n = Lower(name);
    if (n == "d3ddll.dll" || n == "dmavideo.dll")
    {
        return reinterpret_cast<HMODULE>(n == "d3ddll.dll" ? 0x3001 : 0x3002);
    }
    fprintf(stderr, "LoadLibrary(%s): not available\n", name);
    return nullptr;
}
BOOL FreeLibrary(HMODULE)
{
    return TRUE;
}
FARPROC GetProcAddress(HMODULE module, LPCSTR name)
{
    FARPROC p = gta2_port_find_export(name);
    if (!p)
    {
        fprintf(stderr, "GetProcAddress(%p, %s): not exported by the port\n", module, name);
    }
    return p;
}

// ------------------------------------------------------------------ window and messages
ATOM RegisterClassA(const WNDCLASSA* wc)
{
    gClasses[Lower(wc->lpszClassName)].proc = wc->lpfnWndProc;
    return 1;
}
HWND CreateWindowExA(DWORD, LPCSTR cls, LPCSTR, DWORD, int, int, int, int, HWND, HMENU, HINSTANCE, LPVOID)
{
    gWndProc = gClasses[Lower(cls)].proc;
    gWindowAlive = true;
    Send(WM_CREATE, 0, 0);
    return kMainWindow;
}
BOOL DestroyWindow(HWND)
{
    if (gWindowAlive)
    {
        Send(WM_DESTROY, 0, 0);
        gWindowAlive = false;
    }
    return TRUE;
}
BOOL ShowWindow(HWND, int cmd)
{
    if (cmd == SW_HIDE || cmd == SW_MINIMIZE || cmd == SW_SHOWMINNOACTIVE || cmd == SW_SHOWMINIMIZED)
    {
        // The page cannot be minimised; the game asks for this on focus loss.
        return TRUE;
    }
    // As on Windows, activation messages are sent only when the window becomes
    // visible/active, not on every ShowWindow call (the game calls ShowWindow
    // from its own activation handler).
    if (!gShown)
    {
        gShown = true;
        Send(WM_SHOWWINDOW, TRUE, 0);
        Send(WM_ACTIVATEAPP, TRUE, 0);
        Send(WM_ACTIVATE, WA_ACTIVE, 0);
        Send(WM_SETFOCUS, 0, 0);
        Send(WM_SIZE, SIZE_RESTORED, MAKELONG(640, 480));
    }
    return TRUE;
}
BOOL UpdateWindow(HWND)
{
    return TRUE;
}
BOOL SetForegroundWindow(HWND)
{
    return TRUE;
}
HWND FindWindowExA(HWND, HWND, LPCSTR, LPCSTR)
{
    return nullptr;
}
BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT)
{
    return TRUE;
}
BOOL GetWindowRect(HWND, LPRECT r)
{
    r->left = r->top = 0;
    r->right = 640;
    r->bottom = 480;
    return TRUE;
}
BOOL GetClientRect(HWND, LPRECT r)
{
    return GetWindowRect(nullptr, r);
}
LONG SetWindowLongA(HWND, int index, LONG value)
{
    const int slot = (index + 32) & 31;
    const LONG old = gWindowLongs[slot];
    gWindowLongs[slot] = value;
    return old;
}
LRESULT DefWindowProcA(HWND, UINT msg, WPARAM, LPARAM)
{
    if (msg == WM_CLOSE)
    {
        DestroyWindow(kMainWindow);
    }
    return 0;
}
BOOL PeekMessageA(LPMSG msg, HWND, UINT, UINT, UINT remove)
{
    if (gQueue.empty())
    {
        return FALSE;
    }
    *msg = gQueue.front();
    if (remove & PM_REMOVE)
    {
        gQueue.pop_front();
    }
    return TRUE;
}
BOOL TranslateMessage(const MSG*)
{
    return TRUE; // the shell posts WM_CHAR itself
}
LRESULT DispatchMessageA(const MSG* msg)
{
    return Send(msg->message, msg->wParam, msg->lParam);
}
BOOL PostMessageA(HWND, UINT msg, WPARAM wp, LPARAM lp)
{
    gta2_port_post_message(msg, wp, lp);
    return TRUE;
}
void PostQuitMessage(int code)
{
    gta2_port_post_message(WM_QUIT, static_cast<WPARAM>(code), 0);
}
int ShowCursor(BOOL show)
{
    gCursorCount += show ? 1 : -1;
    EM_ASM({ if (Module.onCursor) Module.onCursor($0 >= 0); }, gCursorCount);
    return gCursorCount;
}
HCURSOR LoadCursorA(HINSTANCE, LPCSTR)
{
    return reinterpret_cast<HCURSOR>(0x4000);
}
HICON LoadIconA(HINSTANCE, LPCSTR)
{
    return reinterpret_cast<HICON>(0x4001);
}
int GetSystemMetrics(int index)
{
    return index == SM_CXSCREEN ? 1920 : index == SM_CYSCREEN ? 1080 : 0;
}
HDC GetDC(HWND)
{
    return reinterpret_cast<HDC>(0x5000);
}
int ReleaseDC(HWND, HDC)
{
    return 1;
}
int GetDeviceCaps(HDC, int index)
{
    switch (index)
    {
        case BITSPIXEL:
            return 32;
        case HORZRES:
            return 1920;
        case VERTRES:
            return 1080;
    }
    return 0;
}

// ------------------------------------------------------------------ registry
LONG RegOpenKeyExA(HKEY root, LPCSTR sub, DWORD, REGSAM, PHKEY out)
{
    const std::string path = KeyPath(root, sub);
    if (!gRegistry.count(path))
    {
        return ERROR_FILE_NOT_FOUND;
    }
    *out = NewHandle(path);
    return ERROR_SUCCESS;
}
LONG RegOpenKeyA(HKEY root, LPCSTR sub, PHKEY out)
{
    return RegOpenKeyExA(root, sub, 0, KEY_ALL_ACCESS, out);
}
LONG RegCreateKeyExA(HKEY root, LPCSTR sub, DWORD, LPSTR, DWORD, REGSAM, LPSECURITY_ATTRIBUTES, PHKEY out, LPDWORD disp)
{
    const std::string path = KeyPath(root, sub);
    const bool existed = gRegistry.count(path) != 0;
    gRegistry[path];
    *out = NewHandle(path);
    if (disp)
    {
        *disp = existed ? REG_OPENED_EXISTING_KEY : REG_CREATED_NEW_KEY;
    }
    return ERROR_SUCCESS;
}
LONG RegCloseKey(HKEY key)
{
    gOpenKeys.erase(reinterpret_cast<uintptr_t>(key));
    return ERROR_SUCCESS;
}
LONG RegQueryValueExA(HKEY key, LPCSTR name, LPDWORD, LPDWORD type, LPBYTE data, LPDWORD size)
{
    auto k = gRegistry.find(RootName(key));
    if (k == gRegistry.end())
    {
        return ERROR_FILE_NOT_FOUND;
    }
    auto v = k->second.find(Lower(name));
    if (v == k->second.end())
    {
        return ERROR_FILE_NOT_FOUND;
    }
    if (type)
    {
        *type = v->second.type;
    }
    const DWORD needed = static_cast<DWORD>(v->second.data.size());
    if (data)
    {
        if (!size || *size < needed)
        {
            if (size)
            {
                *size = needed;
            }
            return ERROR_MORE_DATA;
        }
        memcpy(data, v->second.data.data(), needed);
    }
    if (size)
    {
        *size = needed;
    }
    return ERROR_SUCCESS;
}
LONG RegSetValueExA(HKEY key, LPCSTR name, DWORD, DWORD type, const BYTE* data, DWORD size)
{
    RegValue& v = gRegistry[RootName(key)][Lower(name)];
    v.type = type;
    v.data.assign(data, data + size);
    return ERROR_SUCCESS;
}
LONG RegDeleteValueA(HKEY key, LPCSTR name)
{
    auto k = gRegistry.find(RootName(key));
    if (k == gRegistry.end() || !k->second.erase(Lower(name)))
    {
        return ERROR_FILE_NOT_FOUND;
    }
    return ERROR_SUCCESS;
}

} // extern "C"
