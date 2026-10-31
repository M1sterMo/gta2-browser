/* Force-included before every gta2_re translation unit in the browser build.
 *
 * The build uses -fshort-wchar so wchar_t is 2 bytes as on Win32 (struct
 * layouts and GXT text depend on it). The C library's wide functions assume
 * 4-byte wchar_t, so the ones the game uses are redirected to UTF-16
 * implementations in port/platform/crt_compat.cpp. System headers are
 * included first so the redirects never rename their declarations.
 */
#pragma once
#define __NT__ 1 /* selects the Win32 branch of 3rdParty/mss.h only */

#define __declspec(x)
#ifndef __cdecl
#define __cdecl
#endif
#ifndef __stdcall
#define __stdcall
#endif
#define __fastcall
#define __thiscall
#ifndef __forceinline
#define __forceinline inline __attribute__((always_inline))
#endif
#define __int8 char
#define __int16 short
#define __int32 int
typedef long long __int64;
typedef unsigned long long __uint64;

#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <wchar.h>
#include <sys/stat.h>
#ifdef __cplusplus
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <string>
#include <algorithm>
#include <vector>
#endif

#ifdef __cplusplus
extern "C" {
#endif
size_t gta2_wcslen(const wchar_t* s);
wchar_t* gta2_wcscpy(wchar_t* d, const wchar_t* s);
wchar_t* gta2_wcsncpy(wchar_t* d, const wchar_t* s, size_t n);
int gta2_wcscmp(const wchar_t* a, const wchar_t* b);
size_t gta2_wcstombs(char* d, const wchar_t* s, size_t n);
size_t gta2_mbstowcs(wchar_t* d, const char* s, size_t n);
int gta2_swprintf(wchar_t* buf, const wchar_t* fmt, ...); /* MSVC non-conforming form */
int gta2_vswprintf(wchar_t* buf, const wchar_t* fmt, va_list ap);
wchar_t* gta2_itow(int value, wchar_t* buf, int radix);
char* gta2_itoa(int value, char* buf, int radix);
char* gta2_strupr(char* s);
FILE* gta2_fopen(const char* path, const char* mode);
int gta2_fclose(FILE* f);
int gta2_remove(const char* path);
#ifdef __cplusplus
}
/* MSVC's _stat is both a struct and a function; C++ allows the pair. */
struct _stat : stat
{
};
int _stat(const char* path, struct _stat* st);
#endif

#define wcslen gta2_wcslen
#define wcscpy gta2_wcscpy
#define wcsncpy gta2_wcsncpy
#define wcscmp gta2_wcscmp
#define wcstombs gta2_wcstombs
#define mbstowcs gta2_mbstowcs
#define swprintf gta2_swprintf
#define vswprintf gta2_vswprintf
#define _itow gta2_itow
#define _itoa gta2_itoa
#define _strupr gta2_strupr
#define _strnicmp strncasecmp
#define _stricmp strcasecmp
#define fopen gta2_fopen
#define fclose gta2_fclose
