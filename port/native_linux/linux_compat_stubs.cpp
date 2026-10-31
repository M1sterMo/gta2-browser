#include <windows.h>
#include <string.h>
#include <wchar.h>

#include "Network_20324.hpp"
#include "ImGuiDebug.hpp"

extern "C" {

void gta2_js_file_written(const char*) {}
void gta2_js_file_removed(const char*) {}
void gta2_js_net_send(int, const void*, int) {}
void gta2_js_open_options() {}

LPSTR WINAPI lstrcatA(LPSTR lpString1, LPCSTR lpString2) {
    return strcat(lpString1, lpString2);
}

UINT WINAPI GetDriveTypeA(LPCSTR) {
    return 5; // DRIVE_CDROM (so CD check passes)
}

HRESULT CoCreateInstance(REFCLSID, void*, DWORD, REFIID, LPVOID* ppv) {
    if (ppv) *ppv = nullptr;
    return 0x80004002;
}

int WINAPI WideCharToMultiByte(UINT, DWORD, LPCWSTR lpWideCharStr, int cchWideChar, LPSTR lpMultiByteStr, int cbMultiByte, LPCSTR, LPBOOL) {
    if (!lpWideCharStr || !lpMultiByteStr) return 0;
    int len = cchWideChar >= 0 ? cchWideChar : (int)wcslen(lpWideCharStr);
    int count = (cbMultiByte > 0 && len > cbMultiByte - 1) ? cbMultiByte - 1 : len;
    for (int i = 0; i < count; ++i) {
        lpMultiByteStr[i] = (char)lpWideCharStr[i];
    }
    if (cbMultiByte > count) lpMultiByteStr[count] = 0;
    return count;
}

} // extern "C"

void CC ImGuiDebugDraw() {}

s32 Network_20324::cb_FillSessionList_519D30(Network_20324*, Network_NameList*) {
    return 0;
}
