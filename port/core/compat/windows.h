/* Minimal Win32 surface for compiling gta2_re to wasm32 (browser port).
 *
 * Declarations only: implementations live in port/platform (or are no-ops
 * there). Sizes follow 32-bit Windows so struct layouts and GTA2_ASSERT_SIZEOF
 * checks keep their original meaning. Add entries as the compile probe asks
 * for them; don't pull in anything that hides a real platform dependency.
 */
#pragma once
#ifndef GTA2_COMPAT_WINDOWS_H
#define GTA2_COMPAT_WINDOWS_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <wchar.h>
#include <stdarg.h>

#ifdef __cplusplus
extern "C" {
#endif

#define WINAPI
#define APIENTRY
#define CALLBACK
#define PASCAL
#define FAR
#define NEAR
#define CONST const
#define IN
#define OUT
#define OPTIONAL
#define DECLSPEC_IMPORT
#define STDMETHODCALLTYPE
#define __cdecl
#ifndef __stdcall
#define __stdcall
#endif
#define __fastcall
#define __thiscall
#define _cdecl
#define _stdcall
#define __forceinline inline __attribute__((always_inline))

typedef int BOOL;
typedef unsigned char BYTE;
typedef unsigned short WORD;
typedef uint32_t DWORD; /* 4 bytes on Win32, wasm32, and Linux 64-bit */
typedef unsigned int UINT;
typedef int INT;
typedef int32_t LONG;
typedef uint32_t ULONG;
typedef short SHORT;
typedef unsigned short USHORT;
typedef char CHAR;
typedef unsigned char UCHAR;
typedef wchar_t WCHAR;
typedef float FLOAT;
typedef double DOUBLE;
typedef void VOID;
typedef int64_t LONGLONG;
typedef uint64_t ULONGLONG;
typedef int64_t __int64_t_compat;
typedef BYTE BOOLEAN;
typedef long HRESULT;
typedef intptr_t INT_PTR, LONG_PTR;
typedef uintptr_t UINT_PTR, ULONG_PTR, DWORD_PTR;
typedef ULONG_PTR SIZE_T;
typedef UINT_PTR WPARAM;
typedef LONG_PTR LPARAM;
typedef LONG_PTR LRESULT;
typedef WORD ATOM;
typedef DWORD COLORREF;

typedef void *LPVOID, *PVOID;
typedef const void *LPCVOID;
typedef BYTE *LPBYTE, *PBYTE;
typedef WORD *LPWORD;
typedef DWORD *LPDWORD, *PDWORD;
typedef LONG *LPLONG, *PLONG;
typedef BOOL *LPBOOL;
typedef int *LPINT;
typedef UINT *PUINT;
typedef char *LPSTR, *PSTR, *LPTSTR;
typedef const char *LPCSTR, *PCSTR, *LPCTSTR;
typedef wchar_t *LPWSTR, *PWSTR;
typedef const wchar_t *LPCWSTR, *PCWSTR;
typedef char TCHAR;

typedef void *HANDLE;
#define DECLARE_HANDLE(name) typedef struct name##__ { int unused; } *name
DECLARE_HANDLE(HWND);
DECLARE_HANDLE(HINSTANCE);
DECLARE_HANDLE(HKEY);
DECLARE_HANDLE(HMENU);
DECLARE_HANDLE(HICON);
DECLARE_HANDLE(HDC);
DECLARE_HANDLE(HBRUSH);
DECLARE_HANDLE(HFONT);
DECLARE_HANDLE(HBITMAP);
DECLARE_HANDLE(HGDIOBJ_);
DECLARE_HANDLE(HPALETTE);
DECLARE_HANDLE(HMONITOR);
DECLARE_HANDLE(HACCEL);
DECLARE_HANDLE(HRSRC);
DECLARE_HANDLE(HGLOBAL_);
typedef HICON HCURSOR;
typedef HINSTANCE HMODULE;
typedef void *HGDIOBJ;
typedef HANDLE HGLOBAL, HLOCAL;
typedef HKEY *PHKEY;
typedef DWORD REGSAM;
typedef DWORD ACCESS_MASK;
typedef int (*FARPROC)(void);
typedef LRESULT (*WNDPROC)(HWND, UINT, WPARAM, LPARAM);
typedef void (*LPTHREAD_START_ROUTINE_)(void);

#define TRUE 1
#define FALSE 0
#ifndef NULL
#define NULL 0
#endif
#define MAX_PATH 260
#define INFINITE 0xFFFFFFFFu
#define INVALID_HANDLE_VALUE ((HANDLE)(intptr_t)-1)

#define LOWORD(l) ((WORD)(((DWORD_PTR)(l)) & 0xffff))
#define HIWORD(l) ((WORD)((((DWORD_PTR)(l)) >> 16) & 0xffff))
#define LOBYTE(w) ((BYTE)(((DWORD_PTR)(w)) & 0xff))
#define HIBYTE(w) ((BYTE)((((DWORD_PTR)(w)) >> 8) & 0xff))
#define MAKELONG(a, b) ((LONG)(((WORD)(((DWORD_PTR)(a)) & 0xffff)) | ((DWORD)((WORD)(((DWORD_PTR)(b)) & 0xffff))) << 16))
#define MAKEWORD(a, b) ((WORD)(((BYTE)(((DWORD_PTR)(a)) & 0xff)) | ((WORD)((BYTE)(((DWORD_PTR)(b)) & 0xff))) << 8))
#define RGB(r, g, b) ((COLORREF)(((BYTE)(r) | ((WORD)((BYTE)(g)) << 8)) | (((DWORD)(BYTE)(b)) << 16)))
#define MAKEINTRESOURCEA(i) ((LPSTR)((ULONG_PTR)((WORD)(i))))
#define MAKEINTRESOURCE MAKEINTRESOURCEA
#define ZeroMemory(d, n) memset((d), 0, (n))
#define FillMemory(d, n, v) memset((d), (v), (n))
#define CopyMemory(d, s, n) memcpy((d), (s), (n))
#define MoveMemory(d, s, n) memmove((d), (s), (n))
#define SUCCEEDED(hr) (((HRESULT)(hr)) >= 0)
#define FAILED(hr) (((HRESULT)(hr)) < 0)
#define S_OK ((HRESULT)0)
#define S_FALSE ((HRESULT)1)
#define E_FAIL ((HRESULT)0x80004005L)
#define E_OUTOFMEMORY ((HRESULT)0x8007000EL)
#define E_INVALIDARG ((HRESULT)0x80070057L)
#define E_NOINTERFACE ((HRESULT)0x80004002L)
#define MAKE_HRESULT(sev, fac, code) ((HRESULT)(((unsigned long)(sev) << 31) | ((unsigned long)(fac) << 16) | ((unsigned long)(code))))

typedef struct tagRECT { LONG left, top, right, bottom; } RECT, *PRECT, *LPRECT;
typedef const RECT *LPCRECT;
typedef struct tagPOINT { LONG x, y; } POINT, *PPOINT, *LPPOINT;
typedef struct tagSIZE { LONG cx, cy; } SIZE, *PSIZE, *LPSIZE;
typedef struct _GUID { DWORD Data1; WORD Data2, Data3; BYTE Data4[8]; } GUID, IID, CLSID, *LPGUID, *REFGUID_;
typedef const GUID *LPCGUID;
#ifdef __cplusplus
#define REFGUID const GUID &
#define REFIID const IID &
#define REFCLSID const CLSID &
#else
#define REFGUID const GUID *
#define REFIID const IID *
#define REFCLSID const CLSID *
#endif
typedef union _LARGE_INTEGER { struct { DWORD LowPart; LONG HighPart; } u; struct { DWORD LowPart; LONG HighPart; }; LONGLONG QuadPart; } LARGE_INTEGER, *PLARGE_INTEGER;
typedef struct _FILETIME { DWORD dwLowDateTime, dwHighDateTime; } FILETIME;
typedef struct _SYSTEMTIME { WORD wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds; } SYSTEMTIME, *LPSYSTEMTIME;
typedef struct _SECURITY_ATTRIBUTES { DWORD nLength; LPVOID lpSecurityDescriptor; BOOL bInheritHandle; } SECURITY_ATTRIBUTES, *LPSECURITY_ATTRIBUTES;
typedef struct _CRITICAL_SECTION { int unused[6]; } CRITICAL_SECTION, *LPCRITICAL_SECTION;
typedef struct _OSVERSIONINFOA { DWORD dwOSVersionInfoSize, dwMajorVersion, dwMinorVersion, dwBuildNumber, dwPlatformId; CHAR szCSDVersion[128]; } OSVERSIONINFOA, OSVERSIONINFO, *LPOSVERSIONINFOA, *LPOSVERSIONINFO;
typedef struct _MEMORYSTATUS { DWORD dwLength, dwMemoryLoad; SIZE_T dwTotalPhys, dwAvailPhys, dwTotalPageFile, dwAvailPageFile, dwTotalVirtual, dwAvailVirtual; } MEMORYSTATUS, *LPMEMORYSTATUS;
typedef struct _WIN32_FIND_DATAA { DWORD dwFileAttributes; FILETIME ftCreationTime, ftLastAccessTime, ftLastWriteTime; DWORD nFileSizeHigh, nFileSizeLow, dwReserved0, dwReserved1; CHAR cFileName[MAX_PATH]; CHAR cAlternateFileName[14]; } WIN32_FIND_DATAA, WIN32_FIND_DATA, *LPWIN32_FIND_DATAA, *LPWIN32_FIND_DATA;
typedef struct tagMSG { HWND hwnd; UINT message; WPARAM wParam; LPARAM lParam; DWORD time; POINT pt; } MSG, *LPMSG;
typedef struct tagWNDCLASSA { UINT style; WNDPROC lpfnWndProc; int cbClsExtra, cbWndExtra; HINSTANCE hInstance; HICON hIcon; HCURSOR hCursor; HBRUSH hbrBackground; LPCSTR lpszMenuName, lpszClassName; } WNDCLASSA, WNDCLASS, *LPWNDCLASSA;
typedef struct tagWNDCLASSEXA { UINT cbSize, style; WNDPROC lpfnWndProc; int cbClsExtra, cbWndExtra; HINSTANCE hInstance; HICON hIcon; HCURSOR hCursor; HBRUSH hbrBackground; LPCSTR lpszMenuName, lpszClassName; HICON hIconSm; } WNDCLASSEXA, WNDCLASSEX;
typedef struct tagWINDOWPOS { HWND hwnd, hwndInsertAfter; int x, y, cx, cy; UINT flags; } WINDOWPOS, *LPWINDOWPOS, *PWINDOWPOS;
typedef struct tagPAINTSTRUCT { HDC hdc; BOOL fErase; RECT rcPaint; BOOL fRestore, fIncUpdate; BYTE rgbReserved[32]; } PAINTSTRUCT, *LPPAINTSTRUCT;
typedef struct tagPALETTEENTRY { BYTE peRed, peGreen, peBlue, peFlags; } PALETTEENTRY, *LPPALETTEENTRY;
typedef struct tagRGBQUAD { BYTE rgbBlue, rgbGreen, rgbRed, rgbReserved; } RGBQUAD;
typedef struct tagBITMAPINFOHEADER { DWORD biSize; LONG biWidth, biHeight; WORD biPlanes, biBitCount; DWORD biCompression, biSizeImage; LONG biXPelsPerMeter, biYPelsPerMeter; DWORD biClrUsed, biClrImportant; } BITMAPINFOHEADER;
typedef struct tagBITMAPINFO { BITMAPINFOHEADER bmiHeader; RGBQUAD bmiColors[1]; } BITMAPINFO;
typedef struct _devicemodeA { BYTE dmDeviceName[32]; WORD dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; DWORD dmFields; short dmOrientation, dmPaperSize, dmPaperLength, dmPaperWidth, dmScale, dmCopies, dmDefaultSource, dmPrintQuality, dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate; BYTE dmFormName[32]; WORD dmLogPixels; DWORD dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency; } DEVMODEA, DEVMODE;

/* Messages and flags the game references. */
#define WM_NULL 0x0000
#define WM_CREATE 0x0001
#define WM_DESTROY 0x0002
#define WM_MOVE 0x0003
#define WM_SIZE 0x0005
#define WM_ACTIVATE 0x0006
#define WM_SETFOCUS 0x0007
#define WM_KILLFOCUS 0x0008
#define WM_PAINT 0x000F
#define WM_CLOSE 0x0010
#define WM_QUIT 0x0012
#define WM_ERASEBKGND 0x0014
#define WM_SHOWWINDOW 0x0018
#define WM_ACTIVATEAPP 0x001C
#define WM_SETCURSOR 0x0020
#define WM_GETMINMAXINFO 0x0024
#define WM_WINDOWPOSCHANGING 0x0046
#define WM_WINDOWPOSCHANGED 0x0047
#define WM_DISPLAYCHANGE 0x007E
#define WM_NCACTIVATE 0x0086
#define WM_KEYDOWN 0x0100
#define WM_KEYUP 0x0101
#define WM_CHAR 0x0102
#define WM_SYSKEYDOWN 0x0104
#define WM_SYSKEYUP 0x0105
#define WM_SYSCHAR 0x0106
#define WM_INITDIALOG 0x0110
#define WM_COMMAND 0x0111
#define WM_SYSCOMMAND 0x0112
#define WM_TIMER 0x0113
#define WM_MOUSEMOVE 0x0200
#define WM_LBUTTONDOWN 0x0201
#define WM_LBUTTONUP 0x0202
#define WM_RBUTTONDOWN 0x0204
#define WM_RBUTTONUP 0x0205
#define WM_ENTERMENULOOP 0x0211
#define WM_EXITMENULOOP 0x0212
#define WM_POWERBROADCAST 0x0218
#define WM_SIZING 0x0214
#define WM_ENTERSIZEMOVE 0x0231
#define WM_EXITSIZEMOVE 0x0232
#define WM_USER 0x0400
#define WA_INACTIVE 0
#define WA_ACTIVE 1
#define WA_CLICKACTIVE 2
#define SC_SCREENSAVE 0xF140
#define SC_MONITORPOWER 0xF170
#define SC_KEYMENU 0xF100
#define SC_CLOSE 0xF060
#define SC_MINIMIZE 0xF020
#define SC_MAXIMIZE 0xF030
#define SC_RESTORE 0xF120
#define SIZE_RESTORED 0
#define SIZE_MINIMIZED 1
#define SIZE_MAXIMIZED 2
#define SW_HIDE 0
#define SW_SHOWNORMAL 1
#define SW_NORMAL 1
#define SW_SHOWMINIMIZED 2
#define SW_SHOWMAXIMIZED 3
#define SW_MAXIMIZE 3
#define SW_SHOWNOACTIVATE 4
#define SW_SHOW 5
#define SW_MINIMIZE 6
#define SW_SHOWMINNOACTIVE 7
#define SW_SHOWNA 8
#define SW_RESTORE 9
#define SW_SHOWDEFAULT 10
#define CS_VREDRAW 0x0001
#define CS_HREDRAW 0x0002
#define CS_DBLCLKS 0x0008
#define CS_OWNDC 0x0020
#define WS_OVERLAPPED 0x00000000L
#define WS_POPUP 0x80000000L
#define WS_CHILD 0x40000000L
#define WS_MINIMIZE 0x20000000L
#define WS_VISIBLE 0x10000000L
#define WS_DISABLED 0x08000000L
#define WS_CLIPSIBLINGS 0x04000000L
#define WS_CLIPCHILDREN 0x02000000L
#define WS_MAXIMIZE 0x01000000L
#define WS_CAPTION 0x00C00000L
#define WS_BORDER 0x00800000L
#define WS_DLGFRAME 0x00400000L
#define WS_SYSMENU 0x00080000L
#define WS_THICKFRAME 0x00040000L
#define WS_MINIMIZEBOX 0x00020000L
#define WS_MAXIMIZEBOX 0x00010000L
#define WS_OVERLAPPEDWINDOW (WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX)
#define WS_EX_TOPMOST 0x00000008L
#define WS_EX_APPWINDOW 0x00040000L
#define CW_USEDEFAULT ((int)0x80000000)
#define GWL_STYLE (-16)
#define GWL_EXSTYLE (-20)
#define GWL_WNDPROC (-4)
#define HWND_TOP ((HWND)0)
#define HWND_TOPMOST ((HWND)-1)
#define HWND_NOTOPMOST ((HWND)-2)
#define SWP_NOSIZE 0x0001
#define SWP_NOMOVE 0x0002
#define SWP_NOZORDER 0x0004
#define SWP_NOACTIVATE 0x0010
#define SWP_SHOWWINDOW 0x0040
#define PM_NOREMOVE 0x0000
#define PM_REMOVE 0x0001
#define MB_OK 0x00000000L
#define MB_OKCANCEL 0x00000001L
#define MB_YESNO 0x00000004L
#define MB_ICONHAND 0x00000010L
#define MB_ICONSTOP MB_ICONHAND
#define MB_ICONERROR MB_ICONHAND
#define MB_ICONQUESTION 0x00000020L
#define MB_ICONEXCLAMATION 0x00000030L
#define MB_ICONWARNING MB_ICONEXCLAMATION
#define MB_ICONINFORMATION 0x00000040L
#define MB_SYSTEMMODAL 0x00001000L
#define MB_TASKMODAL 0x00002000L
#define MB_SETFOREGROUND 0x00010000L
#define MB_TOPMOST 0x00040000L
#define IDOK 1
#define IDCANCEL 2
#define IDYES 6
#define IDNO 7
#define IDC_ARROW MAKEINTRESOURCE(32512)
#define IDI_APPLICATION MAKEINTRESOURCE(32512)
#define BLACK_BRUSH 4
#define SM_CXSCREEN 0
#define SM_CYSCREEN 1
#define VK_LBUTTON 0x01
#define VK_RBUTTON 0x02
#define VK_BACK 0x08
#define VK_TAB 0x09
#define VK_RETURN 0x0D
#define VK_SHIFT 0x10
#define VK_CONTROL 0x11
#define VK_MENU 0x12
#define VK_PAUSE 0x13
#define VK_CAPITAL 0x14
#define VK_ESCAPE 0x1B
#define VK_SPACE 0x20
#define VK_PRIOR 0x21
#define VK_NEXT 0x22
#define VK_END 0x23
#define VK_HOME 0x24
#define VK_LEFT 0x25
#define VK_UP 0x26
#define VK_RIGHT 0x27
#define VK_DOWN 0x28
#define VK_SNAPSHOT 0x2C
#define VK_INSERT 0x2D
#define VK_DELETE 0x2E
#define VK_F1 0x70
#define VK_F2 0x71
#define VK_F3 0x72
#define VK_F4 0x73
#define VK_F5 0x74
#define VK_F6 0x75
#define VK_F7 0x76
#define VK_F8 0x77
#define VK_F9 0x78
#define VK_F10 0x79
#define VK_F11 0x7A
#define VK_F12 0x7B
#define VK_LSHIFT 0xA0
#define VK_RSHIFT 0xA1
#define VK_LCONTROL 0xA2
#define VK_RCONTROL 0xA3
#define VK_LMENU 0xA4
#define VK_RMENU 0xA5
#define VK_NUMLOCK 0x90
#define VK_SCROLL 0x91

/* Registry. */
#define HKEY_CLASSES_ROOT ((HKEY)(ULONG_PTR)0x80000000)
#define HKEY_CURRENT_USER ((HKEY)(ULONG_PTR)0x80000001)
#define HKEY_LOCAL_MACHINE ((HKEY)(ULONG_PTR)0x80000002)
#define HKEY_USERS ((HKEY)(ULONG_PTR)0x80000003)
#define KEY_QUERY_VALUE 0x0001
#define KEY_SET_VALUE 0x0002
#define KEY_READ 0x20019
#define KEY_WRITE 0x20006
#define KEY_ALL_ACCESS 0xF003F
#define REG_NONE 0
#define REG_SZ 1
#define REG_BINARY 3
#define REG_DWORD 4
#define REG_OPTION_NON_VOLATILE 0
#define REG_CREATED_NEW_KEY 1
#define REG_OPENED_EXISTING_KEY 2
#define ERROR_SUCCESS 0L
#define ERROR_FILE_NOT_FOUND 2L
#define ERROR_ALREADY_EXISTS 183L
#define ERROR_MORE_DATA 234L
#define NO_ERROR 0L

/* Files, memory, sync. */
#define GENERIC_READ 0x80000000L
#define GENERIC_WRITE 0x40000000L
#define FILE_SHARE_READ 0x1
#define FILE_SHARE_WRITE 0x2
#define CREATE_NEW 1
#define CREATE_ALWAYS 2
#define OPEN_EXISTING 3
#define OPEN_ALWAYS 4
#define FILE_ATTRIBUTE_READONLY 0x1
#define FILE_ATTRIBUTE_DIRECTORY 0x10
#define FILE_ATTRIBUTE_NORMAL 0x80
#define FILE_BEGIN 0
#define FILE_CURRENT 1
#define FILE_END 2
#define GMEM_FIXED 0x0000
#define GMEM_MOVEABLE 0x0002
#define GMEM_ZEROINIT 0x0040
#define GPTR (GMEM_FIXED | GMEM_ZEROINIT)
#define GHND (GMEM_MOVEABLE | GMEM_ZEROINIT)
#define MEM_COMMIT 0x1000
#define MEM_RESERVE 0x2000
#define MEM_RELEASE 0x8000
#define PAGE_READWRITE 0x04
#define WAIT_OBJECT_0 0
#define WAIT_TIMEOUT 258L
#define MUTEX_ALL_ACCESS 0x1F0001
#define THREAD_PRIORITY_NORMAL 0
#define THREAD_PRIORITY_HIGHEST 2
#define THREAD_PRIORITY_TIME_CRITICAL 15
#define SEM_FAILCRITICALERRORS 0x0001
#define DRIVE_CDROM 5
#define CP_ACP 0
#define VER_PLATFORM_WIN32s 0
#define VER_PLATFORM_WIN32_WINDOWS 1
#define VER_PLATFORM_WIN32_NT 2
#define KL_NAMELENGTH 9
#define MAX_COMPUTERNAME_LENGTH 15

/* Functions the game calls. Implemented (or deliberately stubbed) in
 * port/platform/win32_shim.cpp. */
DWORD timeGetTime(void);
void Sleep(DWORD ms);
DWORD GetTickCount(void);
BOOL QueryPerformanceCounter(LARGE_INTEGER *);
BOOL QueryPerformanceFrequency(LARGE_INTEGER *);
void GetLocalTime(LPSYSTEMTIME);
void GetSystemTime(LPSYSTEMTIME);
DWORD GetLastError(void);
void SetLastError(DWORD);
void OutputDebugStringA(LPCSTR);
#define OutputDebugString OutputDebugStringA
int MessageBoxA(HWND, LPCSTR, LPCSTR, UINT);
#define MessageBox MessageBoxA
void ExitProcess(UINT);
HMODULE GetModuleHandleA(LPCSTR);
#define GetModuleHandle GetModuleHandleA
DWORD GetModuleFileNameA(HMODULE, LPSTR, DWORD);
#define GetModuleFileName GetModuleFileNameA
HMODULE LoadLibraryA(LPCSTR);
#define LoadLibrary LoadLibraryA
BOOL FreeLibrary(HMODULE);
FARPROC GetProcAddress(HMODULE, LPCSTR);
DWORD GetCurrentDirectoryA(DWORD, LPSTR);
#define GetCurrentDirectory GetCurrentDirectoryA
BOOL SetCurrentDirectoryA(LPCSTR);
#define SetCurrentDirectory SetCurrentDirectoryA
UINT GetDriveTypeA(LPCSTR);
#define GetDriveType GetDriveTypeA
DWORD GetLogicalDrives(void);
UINT SetErrorMode(UINT);
BOOL GetVersionExA(LPOSVERSIONINFOA);
#define GetVersionEx GetVersionExA
void GlobalMemoryStatus(LPMEMORYSTATUS);
HGLOBAL GlobalAlloc(UINT, SIZE_T);
HGLOBAL GlobalFree(HGLOBAL);
LPVOID GlobalLock(HGLOBAL);
BOOL GlobalUnlock(HGLOBAL);
LPVOID VirtualAlloc(LPVOID, SIZE_T, DWORD, DWORD);
BOOL VirtualFree(LPVOID, SIZE_T, DWORD);
HANDLE CreateMutexA(LPSECURITY_ATTRIBUTES, BOOL, LPCSTR);
#define CreateMutex CreateMutexA
HANDLE OpenMutexA(DWORD, BOOL, LPCSTR);
#define OpenMutex OpenMutexA
BOOL ReleaseMutex(HANDLE);
BOOL CloseHandle(HANDLE);
DWORD WaitForSingleObject(HANDLE, DWORD);
HANDLE CreateFileA(LPCSTR, DWORD, DWORD, LPSECURITY_ATTRIBUTES, DWORD, DWORD, HANDLE);
#define CreateFile CreateFileA
BOOL ReadFile(HANDLE, LPVOID, DWORD, LPDWORD, void *);
BOOL WriteFile(HANDLE, LPCVOID, DWORD, LPDWORD, void *);
DWORD GetFileSize(HANDLE, LPDWORD);
DWORD SetFilePointer(HANDLE, LONG, PLONG, DWORD);
BOOL DeleteFileA(LPCSTR);
#define DeleteFile DeleteFileA
BOOL CreateDirectoryA(LPCSTR, LPSECURITY_ATTRIBUTES);
#define CreateDirectory CreateDirectoryA
DWORD GetFileAttributesA(LPCSTR);
#define GetFileAttributes GetFileAttributesA
HANDLE FindFirstFileA(LPCSTR, LPWIN32_FIND_DATAA);
#define FindFirstFile FindFirstFileA
BOOL FindNextFileA(HANDLE, LPWIN32_FIND_DATAA);
#define FindNextFile FindNextFileA
BOOL FindClose(HANDLE);
void InitializeCriticalSection(LPCRITICAL_SECTION);
void DeleteCriticalSection(LPCRITICAL_SECTION);
void EnterCriticalSection(LPCRITICAL_SECTION);
void LeaveCriticalSection(LPCRITICAL_SECTION);
int MultiByteToWideChar(UINT, DWORD, LPCSTR, int, LPWSTR, int);
int WideCharToMultiByte(UINT, DWORD, LPCWSTR, int, LPSTR, int, LPCSTR, LPBOOL);
int wsprintfA(LPSTR, LPCSTR, ...);
#define wsprintf wsprintfA
int lstrlenA(LPCSTR);
#define lstrlen lstrlenA
LPSTR lstrcpyA(LPSTR, LPCSTR);
#define lstrcpy lstrcpyA
LPSTR lstrcatA(LPSTR, LPCSTR);
#define lstrcat lstrcatA
int lstrcmpiA(LPCSTR, LPCSTR);
#define lstrcmpi lstrcmpiA

LONG RegOpenKeyExA(HKEY, LPCSTR, DWORD, REGSAM, PHKEY);
#define RegOpenKeyEx RegOpenKeyExA
LONG RegCreateKeyExA(HKEY, LPCSTR, DWORD, LPSTR, DWORD, REGSAM, LPSECURITY_ATTRIBUTES, PHKEY, LPDWORD);
#define RegCreateKeyEx RegCreateKeyExA
LONG RegQueryValueExA(HKEY, LPCSTR, LPDWORD, LPDWORD, LPBYTE, LPDWORD);
#define RegQueryValueEx RegQueryValueExA
LONG RegSetValueExA(HKEY, LPCSTR, DWORD, DWORD, const BYTE *, DWORD);
#define RegSetValueEx RegSetValueExA
LONG RegCloseKey(HKEY);
LONG RegOpenKeyA(HKEY, LPCSTR, PHKEY);
#define RegOpenKey RegOpenKeyA
int wvsprintfA(LPSTR, LPCSTR, va_list);
#define wvsprintf wvsprintfA
BOOL GetComputerNameA(LPSTR, LPDWORD);
#define GetComputerName GetComputerNameA
BOOL GetKeyboardLayoutNameA(LPSTR);
#define GetKeyboardLayoutName GetKeyboardLayoutNameA
LONG RegDeleteValueA(HKEY, LPCSTR);
#define RegDeleteValue RegDeleteValueA
LONG RegDeleteKeyA(HKEY, LPCSTR);
#define RegDeleteKey RegDeleteKeyA

ATOM RegisterClassA(const WNDCLASSA *);
#define RegisterClass RegisterClassA
ATOM RegisterClassExA(const WNDCLASSEXA *);
#define RegisterClassEx RegisterClassExA
BOOL UnregisterClassA(LPCSTR, HINSTANCE);
#define UnregisterClass UnregisterClassA
HWND CreateWindowExA(DWORD, LPCSTR, LPCSTR, DWORD, int, int, int, int, HWND, HMENU, HINSTANCE, LPVOID);
#define CreateWindowEx CreateWindowExA
#define CreateWindowA(c, w, s, x, y, cx, cy, p, m, i, l) CreateWindowExA(0, c, w, s, x, y, cx, cy, p, m, i, l)
#define CreateWindow CreateWindowA
BOOL DestroyWindow(HWND);
BOOL ShowWindow(HWND, int);
BOOL UpdateWindow(HWND);
BOOL SetForegroundWindow(HWND);
HWND GetForegroundWindow(void);
HWND SetFocus(HWND);
HWND GetFocus(void);
HWND GetActiveWindow(void);
HWND SetActiveWindow(HWND);
BOOL IsIconic(HWND);
BOOL IsWindow(HWND);
BOOL IsWindowVisible(HWND);
HWND FindWindowA(LPCSTR, LPCSTR);
#define FindWindow FindWindowA
HWND FindWindowExA(HWND, HWND, LPCSTR, LPCSTR);
#define FindWindowEx FindWindowExA
BOOL SetWindowTextA(HWND, LPCSTR);
#define SetWindowText SetWindowTextA
BOOL SetWindowPos(HWND, HWND, int, int, int, int, UINT);
BOOL MoveWindow(HWND, int, int, int, int, BOOL);
BOOL GetWindowRect(HWND, LPRECT);
BOOL GetClientRect(HWND, LPRECT);
BOOL ClientToScreen(HWND, LPPOINT);
BOOL ScreenToClient(HWND, LPPOINT);
BOOL AdjustWindowRect(LPRECT, DWORD, BOOL);
BOOL AdjustWindowRectEx(LPRECT, DWORD, BOOL, DWORD);
LONG GetWindowLongA(HWND, int);
#define GetWindowLong GetWindowLongA
LONG SetWindowLongA(HWND, int, LONG);
#define SetWindowLong SetWindowLongA
LRESULT DefWindowProcA(HWND, UINT, WPARAM, LPARAM);
#define DefWindowProc DefWindowProcA
LRESULT CallWindowProcA(WNDPROC, HWND, UINT, WPARAM, LPARAM);
#define CallWindowProc CallWindowProcA
BOOL PeekMessageA(LPMSG, HWND, UINT, UINT, UINT);
#define PeekMessage PeekMessageA
BOOL GetMessageA(LPMSG, HWND, UINT, UINT);
#define GetMessage GetMessageA
BOOL TranslateMessage(const MSG *);
LRESULT DispatchMessageA(const MSG *);
#define DispatchMessage DispatchMessageA
BOOL PostMessageA(HWND, UINT, WPARAM, LPARAM);
#define PostMessage PostMessageA
LRESULT SendMessageA(HWND, UINT, WPARAM, LPARAM);
#define SendMessage SendMessageA
void PostQuitMessage(int);
BOOL WaitMessage(void);
int ShowCursor(BOOL);
HCURSOR SetCursor(HCURSOR);
HCURSOR LoadCursorA(HINSTANCE, LPCSTR);
#define LoadCursor LoadCursorA
HICON LoadIconA(HINSTANCE, LPCSTR);
#define LoadIcon LoadIconA
BOOL GetCursorPos(LPPOINT);
BOOL SetCursorPos(int, int);
BOOL ClipCursor(const RECT *);
HWND SetCapture(HWND);
BOOL ReleaseCapture(void);
SHORT GetAsyncKeyState(int);
SHORT GetKeyState(int);
BOOL GetKeyboardState(BYTE *);
UINT MapVirtualKeyA(UINT, UINT);
#define MapVirtualKey MapVirtualKeyA
int GetKeyNameTextA(LONG, LPSTR, int);
#define GetKeyNameText GetKeyNameTextA
int GetSystemMetrics(int);
BOOL SystemParametersInfoA(UINT, UINT, PVOID, UINT);
#define SystemParametersInfo SystemParametersInfoA
HGDIOBJ GetStockObject(int);
HDC GetDC(HWND);
int GetDeviceCaps(HDC, int);
#define BITSPIXEL 12
#define HORZRES 8
#define VERTRES 10
int ReleaseDC(HWND, HDC);
HDC BeginPaint(HWND, LPPAINTSTRUCT);
BOOL EndPaint(HWND, const PAINTSTRUCT *);
BOOL InvalidateRect(HWND, const RECT *, BOOL);
BOOL ValidateRect(HWND, const RECT *);
LONG ChangeDisplaySettingsA(DEVMODEA *, DWORD);
#define ChangeDisplaySettings ChangeDisplaySettingsA
BOOL EnumDisplaySettingsA(LPCSTR, DWORD, DEVMODEA *);
#define EnumDisplaySettings EnumDisplaySettingsA
UINT_PTR SetTimer(HWND, UINT_PTR, UINT, void *);
BOOL KillTimer(HWND, UINT_PTR);
HINSTANCE ShellExecuteA(HWND, LPCSTR, LPCSTR, LPCSTR, LPCSTR, INT);
#define ShellExecute ShellExecuteA
HRESULT CoInitialize(LPVOID);
void CoUninitialize(void);
HRESULT CoCreateInstance(REFCLSID, void *, DWORD, REFIID, LPVOID *);
#define CLSCTX_INPROC_SERVER 0x1
#define CLSCTX_ALL 0x17
BOOL IsEqualGUID(REFGUID, REFGUID);

#ifdef __cplusplus
} /* extern "C" */

/* Minimal COM base used by the DirectX interface declarations. */
struct IUnknown {
    virtual HRESULT QueryInterface(REFIID, void **) = 0;
    virtual ULONG AddRef() = 0;
    virtual ULONG Release() = 0;
};
typedef IUnknown *LPUNKNOWN;
#define STDMETHOD(method) virtual HRESULT method
#define STDMETHOD_(type, method) virtual type method
#define PURE = 0
#define THIS_
#define THIS void
#define DECLARE_INTERFACE(iface) struct iface
#define DECLARE_INTERFACE_(iface, base) struct iface : public base
#define interface struct
#define DEFINE_GUID(name, l, w1, w2, b1, b2, b3, b4, b5, b6, b7, b8) \
    static const GUID name = {l, w1, w2, {b1, b2, b3, b4, b5, b6, b7, b8}}
#endif

#endif
