// MSVC C-runtime behaviour the game relies on, for the wasm32 build.
//
// wchar_t is 2 bytes here (-fshort-wchar) while the C library assumes 4, so
// the wide-string functions the game uses are reimplemented over UTF-16.
// File paths arrive Windows-style ("data\\Bil.sty"); the shell stores the
// game files lowercased with '/' separators, and every path is normalised
// the same way before it reaches the filesystem.
#include <ctype.h>
#include <errno.h>
#include <dirent.h>
#include <emscripten.h>
#include <fnmatch.h>
#include <io.h>
#include <map>
#include <string>
#include <vector>

#undef fopen
#undef fclose
#undef remove
#undef wcslen
#undef wcscpy
#undef wcsncpy
#undef wcscmp
#undef wcstombs
#undef mbstowcs
#undef swprintf
#undef vswprintf

namespace
{
std::string NormalisePath(const char* path)
{
    std::string out;
    for (const char* p = path; *p; ++p)
    {
        char c = *p == '\\' ? '/' : *p;
        out.push_back(static_cast<char>(tolower(static_cast<unsigned char>(c))));
    }
    while (out.size() > 2 && out[0] == '.' && out[1] == '/')
    {
        out.erase(0, 2);
    }
    // The game looks for its music CD as "<drive>:\GTAUDIO\". The music files are
    // installed in data/gtaudio, so drive C stands in for the CD.
    if (out.compare(0, 10, "c:/gtaudio") == 0)
    {
        out = "data/gtaudio" + out.substr(10);
    }
    return out;
}

void AppendWide(std::vector<wchar_t>& out, const char* s)
{
    while (*s)
    {
        out.push_back(static_cast<unsigned char>(*s++));
    }
}

void AppendWide(std::vector<wchar_t>& out, const wchar_t* s)
{
    while (*s)
    {
        out.push_back(*s++);
    }
}
} // namespace

extern "C" {

size_t gta2_wcslen(const wchar_t* s)
{
    size_t n = 0;
    while (s[n])
    {
        ++n;
    }
    return n;
}

wchar_t* gta2_wcscpy(wchar_t* d, const wchar_t* s)
{
    wchar_t* r = d;
    while ((*d++ = *s++))
    {
    }
    return r;
}

wchar_t* gta2_wcsncpy(wchar_t* d, const wchar_t* s, size_t n)
{
    size_t i = 0;
    for (; i < n && s[i]; ++i)
    {
        d[i] = s[i];
    }
    for (; i < n; ++i)
    {
        d[i] = 0;
    }
    return d;
}

int gta2_wcscmp(const wchar_t* a, const wchar_t* b)
{
    while (*a && *a == *b)
    {
        ++a;
        ++b;
    }
    return static_cast<int>(static_cast<unsigned short>(*a)) - static_cast<int>(static_cast<unsigned short>(*b));
}

size_t gta2_wcstombs(char* d, const wchar_t* s, size_t n)
{
    size_t i = 0;
    for (; s[i]; ++i)
    {
        if (d)
        {
            if (i >= n)
            {
                return n;
            }
            d[i] = s[i] < 0x100 ? static_cast<char>(s[i]) : '?';
        }
    }
    if (d && i < n)
    {
        d[i] = 0;
    }
    return i;
}

size_t gta2_mbstowcs(wchar_t* d, const char* s, size_t n)
{
    size_t i = 0;
    for (; s[i]; ++i)
    {
        if (d)
        {
            if (i >= n)
            {
                return n;
            }
            d[i] = static_cast<unsigned char>(s[i]);
        }
    }
    if (d && i < n)
    {
        d[i] = 0;
    }
    return i;
}

// MSVC wide printf: %s is a wide string and %S a narrow one, the reverse of C99.
int gta2_vswprintf(wchar_t* buf, const wchar_t* fmt, va_list ap)
{
    std::vector<wchar_t> out;
    for (const wchar_t* f = fmt; *f;)
    {
        if (*f != L'%')
        {
            out.push_back(*f++);
            continue;
        }
        std::string spec = "%";
        ++f;
        while (*f == L'-' || *f == L'+' || *f == L' ' || *f == L'#' || *f == L'0')
        {
            spec.push_back(static_cast<char>(*f++));
        }
        while (*f && (*f == L'*' || (*f >= L'0' && *f <= L'9') || *f == L'.'))
        {
            if (*f == L'*')
            {
                spec += std::to_string(va_arg(ap, int));
                ++f;
            }
            else
            {
                spec.push_back(static_cast<char>(*f++));
            }
        }
        bool isLong = false;
        bool isShort = false;
        while (*f == L'l' || *f == L'h' || *f == L'I' || *f == L'w')
        {
            isLong |= *f == L'l' || *f == L'w';
            isShort |= *f == L'h';
            ++f;
        }
        const wchar_t conv = *f ? *f++ : 0;
        char tmp[512];
        switch (conv)
        {
            case L'%':
                out.push_back(L'%');
                break;
            case L'c':
                out.push_back(static_cast<wchar_t>(va_arg(ap, int)));
                break;
            case L's':
            {
                if (isShort)
                {
                    AppendWide(out, va_arg(ap, const char*));
                    break;
                }
                const wchar_t* s = va_arg(ap, const wchar_t*);
                // Width/precision for wide strings: format a padded narrow placeholder
                // of the right length, then substitute the characters.
                std::vector<wchar_t> w;
                AppendWide(w, s ? s : L"(null)");
                std::string narrow(w.size(), 'x');
                spec += "s";
                snprintf(tmp, sizeof(tmp), spec.c_str(), narrow.c_str());
                size_t wi = 0;
                for (const char* t = tmp; *t; ++t)
                {
                    out.push_back(*t == 'x' && wi < w.size() ? w[wi++] : static_cast<wchar_t>(*t));
                }
                break;
            }
            case L'S':
            {
                const char* s = va_arg(ap, const char*);
                spec += "s";
                snprintf(tmp, sizeof(tmp), spec.c_str(), s ? s : "(null)");
                AppendWide(out, tmp);
                break;
            }
            case L'd':
            case L'i':
            case L'u':
            case L'x':
            case L'X':
            case L'o':
                spec.push_back(static_cast<char>(conv));
                snprintf(tmp, sizeof(tmp), spec.c_str(), va_arg(ap, int));
                AppendWide(out, tmp);
                break;
            case L'f':
            case L'g':
            case L'e':
                spec.push_back(static_cast<char>(conv));
                snprintf(tmp, sizeof(tmp), spec.c_str(), va_arg(ap, double));
                AppendWide(out, tmp);
                break;
            case L'p':
                snprintf(tmp, sizeof(tmp), "%p", va_arg(ap, void*));
                AppendWide(out, tmp);
                break;
            default:
                break;
        }
        (void)isLong;
    }
    for (size_t i = 0; i < out.size(); ++i)
    {
        buf[i] = out[i];
    }
    buf[out.size()] = 0;
    return static_cast<int>(out.size());
}

int gta2_swprintf(wchar_t* buf, const wchar_t* fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    const int n = gta2_vswprintf(buf, fmt, ap);
    va_end(ap);
    return n;
}

char* gta2_itoa(int value, char* buf, int radix)
{
    if (radix == 10)
    {
        sprintf(buf, "%d", value);
        return buf;
    }
    unsigned v = static_cast<unsigned>(value);
    char tmp[40];
    int n = 0;
    do
    {
        const unsigned d = v % radix;
        tmp[n++] = static_cast<char>(d < 10 ? '0' + d : 'a' + d - 10);
        v /= radix;
    } while (v);
    for (int i = 0; i < n; ++i)
    {
        buf[i] = tmp[n - 1 - i];
    }
    buf[n] = 0;
    return buf;
}

wchar_t* gta2_itow(int value, wchar_t* buf, int radix)
{
    char tmp[40];
    gta2_itoa(value, tmp, radix);
    int i = 0;
    for (; tmp[i]; ++i)
    {
        buf[i] = static_cast<unsigned char>(tmp[i]);
    }
    buf[i] = 0;
    return buf;
}

char* gta2_strupr(char* s)
{
    for (char* p = s; *p; ++p)
    {
        *p = static_cast<char>(toupper(static_cast<unsigned char>(*p)));
    }
    return s;
}

// Files written under player/ (profiles and saved games) are handed to the
// shell when closed, which persists them in IndexedDB (web/storage.js).
static std::map<FILE*, std::string> gPersistentWrites;

EM_JS(void, gta2_js_file_written, (const char* path), {
    if (Module.gta2Storage) Module.gta2Storage.fileWritten(UTF8ToString(path));
});
EM_JS(void, gta2_js_file_removed, (const char* path), {
    if (Module.gta2Storage) Module.gta2Storage.fileRemoved(UTF8ToString(path));
});

static bool IsPersistent(const std::string& norm)
{
    return norm.compare(0, 7, "player/") == 0;
}

FILE* gta2_fopen(const char* path, const char* mode)
{
    const std::string norm = NormalisePath(path);
    FILE* f = fopen(norm.c_str(), mode);
    if (!f && (strchr(mode, 'w') || strchr(mode, 'a') || strchr(mode, '+')))
    {
        size_t slash = norm.find_last_of('/');
        if (slash != std::string::npos)
        {
            std::string dir = norm.substr(0, slash);
            char cmd[256];
            snprintf(cmd, sizeof(cmd), "mkdir -p \"%s\"", dir.c_str());
            system(cmd);
            f = fopen(norm.c_str(), mode);
        }
    }
    if (!f)
    {
        fprintf(stderr, "fopen(\"%s\" -> \"%s\", \"%s\"): %s\n", path, norm.c_str(), mode, strerror(errno));
    }
    else if (IsPersistent(norm) && (strchr(mode, 'w') || strchr(mode, 'a') || strchr(mode, '+')))
    {
        gPersistentWrites[f] = norm;
    }
    return f;
}

int gta2_fclose(FILE* f)
{
    const int r = fclose(f);
    auto it = gPersistentWrites.find(f);
    if (it != gPersistentWrites.end())
    {
        gta2_js_file_written(it->second.c_str());
        gPersistentWrites.erase(it);
    }
    return r;
}

int gta2_remove(const char* path)
{
    const std::string norm = NormalisePath(path);
    const int r = remove(norm.c_str());
    if (r == 0 && IsPersistent(norm))
    {
        gta2_js_file_removed(norm.c_str());
    }
    return r;
}

// Path normalisation for other port layers (e.g. audio streams).
const char* gta2_port_normalise_path(const char* path)
{
    static std::string last;
    last = NormalisePath(path);
    return last.c_str();
}

// Monotonic milliseconds: since page load, or continuing from a loaded quick save's clock
// (gta2_port_set_clock), so the game never sees time jump or run backwards.
static double gClockOffset = 0;
double gta2_port_now_ms()
{
    return emscripten_get_now() + gClockOffset;
}
void gta2_port_set_clock(double ms)
{
    gClockOffset = ms - emscripten_get_now();
}

// The game reads the x86 time-stamp counter for its profiler and CPU-speed
// estimate. A 1 GHz counter derived from the monotonic clock serves both.
unsigned long long gta2_port_rdtsc()
{
    return static_cast<unsigned long long>(gta2_port_now_ms() * 1.0e6);
}

} // extern "C"

int _stat(const char* path, struct _stat* st)
{
    return stat(NormalisePath(path).c_str(), st);
}

// _findfirst/_findnext/_findclose over the in-memory filesystem.
namespace
{
struct FindState
{
    std::vector<std::string> names;
    std::string dir;
    size_t next = 0;
};

void FillFindData(const FindState& fs, const std::string& name, _finddata_t* data)
{
    memset(data, 0, sizeof(*data));
    strncpy(data->name, name.c_str(), sizeof(data->name) - 1);
    struct stat st;
    const std::string full = fs.dir.empty() ? name : fs.dir + "/" + name;
    if (stat(full.c_str(), &st) == 0)
    {
        data->size = static_cast<unsigned long>(st.st_size);
        data->time_write = st.st_mtime;
        data->attrib = S_ISDIR(st.st_mode) ? _A_SUBDIR : _A_NORMAL;
    }
}
} // namespace

extern "C" intptr_t _findfirst(const char* pattern, struct _finddata_t* data)
{
    const std::string norm = NormalisePath(pattern);
    auto* fs = new FindState();
    const size_t slash = norm.rfind('/');
    fs->dir = slash == std::string::npos ? "" : norm.substr(0, slash);
    const std::string mask = slash == std::string::npos ? norm : norm.substr(slash + 1);
    if (DIR* d = opendir(fs->dir.empty() ? "." : fs->dir.c_str()))
    {
        while (dirent* e = readdir(d))
        {
            if (strcmp(e->d_name, ".") && strcmp(e->d_name, "..") && fnmatch(mask.c_str(), e->d_name, 0) == 0)
            {
                fs->names.push_back(e->d_name);
            }
        }
        closedir(d);
    }
    if (fs->names.empty())
    {
        delete fs;
        return -1;
    }
    FillFindData(*fs, fs->names[fs->next++], data);
    return reinterpret_cast<intptr_t>(fs);
}

extern "C" int _findnext(intptr_t handle, struct _finddata_t* data)
{
    auto* fs = reinterpret_cast<FindState*>(handle);
    if (!fs || fs->next >= fs->names.size())
    {
        return -1;
    }
    FillFindData(*fs, fs->names[fs->next++], data);
    return 0;
}

extern "C" int _findclose(intptr_t handle)
{
    delete reinterpret_cast<FindState*>(handle);
    return 0;
}
