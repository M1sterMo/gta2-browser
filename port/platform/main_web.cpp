// Browser entry point.
//
// The shell (web/shell.js) copies the user's game files into the in-memory
// filesystem under /gta2, seeds the registry, then calls gta2_start. That runs
// the original WinMain initialisation; the message loop then continues one
// slice per animation frame (Gta2Port_RunLoopSlice in winmain.cpp).
#include <emscripten.h>
#include <string.h>
#include <unistd.h>
#include <windows.h>

#include "winmain.hpp"

int __stdcall WinMain_5E53F0(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd);
extern "C" int Gta2Port_RunLoopSlice();
extern "C" void Gta2Port_StaticInit();

void Gta2Port_TrackJobBriefs(); // jobs_web.cpp

namespace
{
constexpr int kRunning = 0x7FFFFFFF;
bool gPaused = false;
bool gStarted = false; // WinMain's initialisation has run
double gFrameMs = 0;    // time spent in the game's loop slices, and how many (performance report)
int gFrameCount = 0;
bool gExited = false;

void Exit(int code)
{
    gExited = true;
    emscripten_cancel_main_loop();
    EM_ASM({ if (Module.onGameExit) Module.onGameExit($0); }, code);
}

// Co-op prediction (web/rollback.js, rollback_web.cpp): the page runs its ticks before the slice.
EM_JS(void, gta2_js_before_slice, (), { Module.gta2Rollback && Module.gta2Rollback.frame(); });

void Frame()
{
    if (!gStarted || gPaused || gExited)
    {
        return; // the shell's map screen is open (the game does not advance), or the game has ended
    }
    const double t0 = emscripten_get_now();
    gta2_js_before_slice();
    const int r = Gta2Port_RunLoopSlice();
    Gta2Port_TrackJobBriefs(); // the current job's instructions, for the map screen
    gFrameMs += emscripten_get_now() - t0;
    ++gFrameCount;
    if (r != -1)
    {
        Exit(r);
    }
}
} // namespace

// commandLine: the original's switches; "-N" starts a network game (D20) with the
// players configured through gta2_port_net_configure.
extern "C" EMSCRIPTEN_KEEPALIVE int gta2_start(const char* gameDir, const char* commandLine)
{
    if (chdir(gameDir) != 0)
    {
        return -1;
    }
    Gta2Port_StaticInit(); // what the original's C runtime start-up did
    static char cmd[256];
    strncpy(cmd, commandLine ? commandLine : "", sizeof(cmd) - 1);
    const int r = WinMain_5E53F0(reinterpret_cast<HINSTANCE>(0x400000), nullptr, cmd, SW_SHOWNORMAL);
    if (r != kRunning)
    {
        Exit(r);
        return r;
    }
    gStarted = true;
    emscripten_set_main_loop(Frame, 0, false);
    // Developer option (?fastloop=1): drive the loop with postMessage instead of
    // requestAnimationFrame, which browsers throttle in hidden tabs/panes.
    if (EM_ASM_INT({ return Module.fastLoop ? 1 : 0; }))
    {
        emscripten_set_main_loop_timing(EM_TIMING_SETIMMEDIATE, 1);
    }
    return 0;
}

// One loop slice outside the animation frames. Co-op (D20) calls it from a
// worker's timer while the tab is hidden: browsers stop animation frames in
// hidden tabs, and in lockstep every other player would wait for this one.
extern "C" EMSCRIPTEN_KEEPALIVE void gta2_port_run_slice()
{
    Frame();
}

// Performance report (?perfbeacon): milliseconds spent in loop slices and how many ran since the
// last call; resets both.
extern "C" EMSCRIPTEN_KEEPALIVE double gta2_port_take_frame_ms(int* count)
{
    const double ms = gFrameMs;
    *count = gFrameCount;
    gFrameMs = 0;
    gFrameCount = 0;
    return ms;
}

// Pauses the whole game (no simulation, no frames) while the shell shows its
// map screen. On resume the game's frame timer restarts, so the paused time
// is not simulated as one long frame.
extern "C" EMSCRIPTEN_KEEPALIVE void gta2_port_set_paused(int paused)
{
    if (gPaused && !paused)
    {
        ResetFrameTimer_4DA830();
    }
    gPaused = paused != 0;
}

int main()
{
    return 0; // the shell calls gta2_start once the game files are in place
}
