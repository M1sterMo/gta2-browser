// Co-op prediction (D20): what web/rollback.js needs to run the match's ticks itself.
//
// Every game simulates the whole match from the same inputs (GTA2's lockstep), and the match
// clock (web/clock.js) decides which inputs each tick uses. Without prediction a game plays a tick
// once the clock's bundle for it has arrived, so this player's own inputs show a round trip late.
// With it the page plays this player's inputs at once, and the others' as last seen, ahead of the
// clock; it keeps a snapshot of the game at the last tick the clock confirmed and, as bundles come
// in, goes back to it, plays the confirmed ticks, takes a new snapshot and predicts again. The
// confirmed ticks, the only ones that count, are the same in every game; a prediction stays local.
//
// A snapshot is the WebAssembly memory, as for quick saves (savestate_web.cpp), without the stack:
// the page takes and restores it from inside the loop's slice (main_web.cpp), whose calls are on
// the stack at the time.
#include <emscripten.h>
#include <emscripten/stack.h>
#include <stdint.h>
#include <unistd.h>

extern "C" {
// winmain.cpp
int32_t Gta2Port_RbTick(int32_t confirmed, int32_t show);
const int32_t* Gta2Port_RbState();
uint32_t Gta2Port_RbSample();
void Gta2Port_RbDue(double ms_from_now);
// net_web.cpp
void gta2_port_net_bundle(const uint8_t* data, int len);
}

namespace
{
// one tick's bundle, from the clock or predicted by the page (web/clock.js has the format)
uint8_t gBundle[256];
} // namespace

extern "C" {

// [0] 1 while the page runs the ticks, [1] 1 once the loop has taken them back (the match ends),
// [2] 1 while the game waits for a bundle, [3] the bundle buffer and [4] its size, [5] the stack's
// low end and [6] its high end, [7] the heap's end. A snapshot is [0, [5]) and [[6], [7]).
EMSCRIPTEN_KEEPALIVE const int32_t* gta2_port_rb_state()
{
    static int32_t v[8];
    const int32_t* s = Gta2Port_RbState();
    v[0] = s[0];
    v[1] = s[1];
    v[2] = s[2];
    v[3] = static_cast<int32_t>(reinterpret_cast<uintptr_t>(gBundle));
    v[4] = sizeof(gBundle);
    v[5] = static_cast<int32_t>(emscripten_stack_get_end());
    v[6] = static_cast<int32_t>(emscripten_stack_get_base());
    v[7] = static_cast<int32_t>(reinterpret_cast<uintptr_t>(sbrk(0)));
    return v;
}

// One tick with the bundle the page wrote into the buffer (len bytes): confirmed 1 for the clock's
// own, 0 for a prediction; show 1 for the step's last tick. Returns what Gta2Port_RbTick does.
EMSCRIPTEN_KEEPALIVE int gta2_port_rb_tick(int len, int confirmed, int show)
{
    const int32_t* state = Gta2Port_RbState();
    if (len < 6 || len > static_cast<int>(sizeof(gBundle)) || !state[0] || !state[2])
    {
        return -1; // not waiting for a bundle: it would stay in the inbox for a later tick
    }
    gta2_port_net_bundle(gBundle, len);
    return Gta2Port_RbTick(confirmed, show);
}

// This player's inputs for a new tick (held controls and at most one key event).
EMSCRIPTEN_KEEPALIVE unsigned gta2_port_rb_sample()
{
    return Gta2Port_RbSample();
}

// When the page's next tick is due, in milliseconds from now.
EMSCRIPTEN_KEEPALIVE void gta2_port_rb_due(double ms_from_now)
{
    Gta2Port_RbDue(ms_from_now);
}

} // extern "C"
