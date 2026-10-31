#pragma once
#include <chrono>
#include <stdint.h>
#include <stddef.h>

#define EMSCRIPTEN_KEEPALIVE
#define EM_ASM(...)
#define EM_ASM_INT(...) 0
#define EM_ASM_DOUBLE(...) 0.0
#ifdef __cplusplus
#define EM_JS(ret, name, args, code) extern "C" ret name args;
#else
#define EM_JS(ret, name, args, code) ret name args;
#endif

#ifdef __cplusplus
inline double emscripten_get_now() {
    using namespace std::chrono;
    static auto start = steady_clock::now();
    auto now = steady_clock::now();
    return duration_cast<duration<double, std::milli>>(now - start).count();
}

inline void emscripten_cancel_main_loop() {}
inline size_t emscripten_get_heap_size() { return 256 * 1024 * 1024; }
inline int emscripten_resize_heap(size_t) { return 1; }
#endif
