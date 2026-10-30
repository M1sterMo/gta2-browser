// Miles Sound System calls used by the game (55 of them), over Web Audio.
//
// Effects: the game points samples at PCM inside its loaded sound bank; on
// start the bytes and parameters go to web/audio.js, which plays them.
// Status ("is it still playing?") is answered here from the sample's real
// duration on the wall clock, so game logic keeps the original pacing even
// while the browser holds audio back (before the first user gesture).
// Streams (speech, radio, music) are IMA ADPCM WAV files decoded and played
// by web/audio.js; their status and position come from there.
#include "3rdParty/mss.h"
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <algorithm>
#include <vector>

extern "C" const char* gta2_port_normalise_path(const char* path);
extern "C" double gta2_port_now_ms();

EM_JS(void, gta2_js_sample_start,
      (int id, const void* data, int len, int rate, int format, int loops, int loopStart, int loopEnd, int volume, int pan), {
          Module.gta2Audio && Module.gta2Audio.sampleStart(id, data, len, rate, format, loops, loopStart, loopEnd, volume, pan);
      });
EM_JS(void, gta2_js_sample_update, (int id, int volume, int pan, int rate), {
    Module.gta2Audio && Module.gta2Audio.sampleUpdate(id, volume, pan, rate);
});
EM_JS(void, gta2_js_sample_stop, (int id), { Module.gta2Audio && Module.gta2Audio.sampleStop(id); });
EM_JS(int, gta2_js_stream_open, (int id, const char* path), {
    return Module.gta2Audio ? Module.gta2Audio.streamOpen(id, UTF8ToString(path)) : 0;
});
EM_JS(void, gta2_js_stream_close, (int id), { Module.gta2Audio && Module.gta2Audio.streamClose(id); });
EM_JS(void, gta2_js_stream_start, (int id, int loops), { Module.gta2Audio && Module.gta2Audio.streamStart(id, loops); });
EM_JS(int, gta2_js_stream_playing, (int id), { return Module.gta2Audio ? Module.gta2Audio.streamPlaying(id) : 0; });
EM_JS(void, gta2_js_stream_set, (int id, int volume, int rate), { Module.gta2Audio && Module.gta2Audio.streamSet(id, volume, rate); });
EM_JS(void, gta2_js_stream_seek, (int id, int ms), { Module.gta2Audio && Module.gta2Audio.streamSeek(id, ms); });
EM_JS(int, gta2_js_stream_ms, (int id, int which), {
    return Module.gta2Audio ? Module.gta2Audio.streamMs(id, which) : 0;
});
EM_JS(void, gta2_js_audio_reset, (), { Module.gta2Audio && Module.gta2Audio.reset(); });
EM_JS(void, gta2_js_master_volume, (int volume), { Module.gta2Audio && Module.gta2Audio.setMasterVolume(volume); });

namespace
{
struct Sample
{
    const void* data = nullptr;
    U32 len = 0;
    S32 rate = 22050;
    S32 format = DIG_F_MONO_16;
    S32 loops = 1;
    S32 loopStart = 0;
    S32 loopEnd = -1;
    S32 volume = 127;
    S32 pan = 64;
    double startMs = -1;
    bool stopped = false;
};

struct Stream
{
    S32 loops = 1;
    S32 rate = 22050;
    S32 volume = 127;
    char path[192] = {}; // to reopen it after a quick load
    bool started = false;
    bool playing = false; // as of the last quick save
    S32 positionMs = 0;
};

// Co-op prediction (winmain.cpp): a predicted tick is silent. The game's state goes back to the
// last confirmed tick before the next one, and only confirmed ticks play sound, so nothing a
// predicted tick does may reach web/audio.js (its questions still do: they change nothing).
bool gMuted = false;

// Every sample and stream handle, so a quick load can rebuild what web/audio.js plays.
std::vector<Sample*> gSamples;
std::vector<Stream*> gStreams;

template <typename T> void Forget(std::vector<T*>& list, T* p)
{
    list.erase(std::remove(list.begin(), list.end(), p), list.end());
}

double Now()
{
    return gta2_port_now_ms(); // continues across a quick load
}

int Id(const void* p)
{
    return static_cast<int>(reinterpret_cast<intptr_t>(p));
}

U32 Status(const Sample* s)
{
    if (!s || s->startMs < 0 || s->stopped)
    {
        return SMP_DONE;
    }
    if (s->loops == 0)
    {
        return SMP_PLAYING; // loops until ended
    }
    const int bytesPerFrame = ((s->format & DIG_F_16BITS_MASK) ? 2 : 1) * ((s->format & DIG_F_STEREO_MASK) ? 2 : 1);
    const double ms = s->rate > 0 ? 1000.0 * s->len / (static_cast<double>(s->rate) * bytesPerFrame) * s->loops : 0;
    return Now() - s->startMs < ms ? SMP_PLAYING : SMP_DONE;
}

bool Playing(const Sample* s)
{
    return Status(s) == SMP_PLAYING;
}

void Start(Sample* s)
{
    s->startMs = Now();
    s->stopped = false;
    if (!gMuted)
    {
        gta2_js_sample_start(Id(s), s->data, static_cast<int>(s->len), s->rate, s->format, s->loops, s->loopStart, s->loopEnd,
                             s->volume, s->pan);
    }
}

void Stop(Sample* s)
{
    if (Playing(s) && !gMuted)
    {
        gta2_js_sample_stop(Id(s));
    }
    s->stopped = true;
}

void Update(Sample* s)
{
    if (Playing(s) && !gMuted)
    {
        gta2_js_sample_update(Id(s), s->volume, s->pan, s->rate);
    }
}

Sample* AsSample(void* h)
{
    return static_cast<Sample*>(h);
}

int gDriver;
} // namespace

extern "C" void Gta2Port_AudioMute(int on)
{
    gMuted = on != 0;
}

extern "C" {

S32 AILCALL AIL_startup(void)
{
    return 1;
}
void AILCALL AIL_shutdown(void)
{
}
S32 AILCALL AIL_set_preference(U32, S32 value)
{
    return value;
}
void AILCALL AIL_delay(S32)
{
}
void FAR* AILCALL AIL_mem_alloc_lock(U32 size)
{
    return malloc(size);
}
void AILCALL AIL_mem_free_lock(void FAR* p)
{
    free(p);
}
S32 AILCALL AIL_waveOutOpen(HDIGDRIVER FAR* drvr, LPHWAVEOUT FAR*, S32, LPWAVEFORMAT)
{
    *drvr = reinterpret_cast<HDIGDRIVER>(&gDriver);
    return 0;
}
void AILCALL AIL_waveOutClose(HDIGDRIVER)
{
}
S32 AILCALL AIL_digital_handle_release(HDIGDRIVER)
{
    return 1;
}
S32 AILCALL AIL_digital_handle_reacquire(HDIGDRIVER)
{
    return 1;
}
void AILCALL AIL_set_digital_master_volume(HDIGDRIVER, S32 volume)
{
    gta2_js_master_volume(volume);
}

// 2D samples
HSAMPLE AILCALL AIL_allocate_sample_handle(HDIGDRIVER)
{
    gSamples.push_back(new Sample());
    return reinterpret_cast<HSAMPLE>(gSamples.back());
}
void AILCALL AIL_release_sample_handle(HSAMPLE S)
{
    Stop(AsSample(S));
    Forget(gSamples, AsSample(S));
    delete AsSample(S);
}
void AILCALL AIL_init_sample(HSAMPLE S)
{
    Stop(AsSample(S));
    *AsSample(S) = Sample();
}
void AILCALL AIL_set_sample_address(HSAMPLE S, void FAR* start, U32 len)
{
    AsSample(S)->data = start;
    AsSample(S)->len = len;
    AsSample(S)->loopStart = 0;
    AsSample(S)->loopEnd = -1;
}
void AILCALL AIL_set_sample_type(HSAMPLE S, S32 format, U32)
{
    AsSample(S)->format = format;
}
void AILCALL AIL_set_sample_playback_rate(HSAMPLE S, S32 rate)
{
    AsSample(S)->rate = rate;
    Update(AsSample(S));
}
void AILCALL AIL_set_sample_volume(HSAMPLE S, S32 volume)
{
    AsSample(S)->volume = volume;
    Update(AsSample(S));
}
void AILCALL AIL_set_sample_pan(HSAMPLE S, S32 pan)
{
    AsSample(S)->pan = pan;
    Update(AsSample(S));
}
void AILCALL AIL_set_sample_loop_count(HSAMPLE S, S32 count)
{
    AsSample(S)->loops = count;
}
void AILCALL AIL_set_sample_loop_block(HSAMPLE S, S32 start, S32 end)
{
    AsSample(S)->loopStart = start;
    AsSample(S)->loopEnd = end;
}
void AILCALL AIL_start_sample(HSAMPLE S)
{
    Start(AsSample(S));
}
void AILCALL AIL_end_sample(HSAMPLE S)
{
    Stop(AsSample(S));
}
U32 AILCALL AIL_sample_status(HSAMPLE S)
{
    return Status(AsSample(S));
}

// 3D samples (no 3D providers are enumerated, so the game uses 2D samples)
S32 AILCALL AIL_enumerate_3D_providers(HPROENUM FAR*, HPROVIDER FAR*, C8 FAR* FAR*)
{
    return 0;
}
M3DRESULT AILCALL AIL_open_3D_provider(HPROVIDER)
{
    return 1; // M3D_NOERR is 0; anything else fails
}
void AILCALL AIL_close_3D_provider(HPROVIDER)
{
}
void AILCALL AIL_3D_provider_attribute(HPROVIDER, C8 FAR*, void FAR*)
{
}
void AILCALL AIL_set_3D_provider_preference(HPROVIDER, C8 FAR*, void FAR*)
{
}
H3DSAMPLE AILCALL AIL_allocate_3D_sample_handle(HPROVIDER)
{
    gSamples.push_back(new Sample());
    return reinterpret_cast<H3DSAMPLE>(gSamples.back());
}
void AILCALL AIL_release_3D_sample_handle(H3DSAMPLE S)
{
    Stop(reinterpret_cast<Sample*>(S));
    Forget(gSamples, reinterpret_cast<Sample*>(S));
    delete reinterpret_cast<Sample*>(S);
}
S32 AILCALL AIL_set_3D_sample_info(H3DSAMPLE S, AILSOUNDINFO FAR* info)
{
    Sample* s = reinterpret_cast<Sample*>(S);
    s->data = info->data_ptr;
    s->len = info->data_len;
    s->rate = info->rate;
    s->format = (info->bits == 16 ? DIG_F_16BITS_MASK : 0) | (info->channels == 2 ? DIG_F_STEREO_MASK : 0);
    return 1;
}
void AILCALL AIL_set_3D_sample_playback_rate(H3DSAMPLE S, S32 rate)
{
    reinterpret_cast<Sample*>(S)->rate = rate;
    Update(reinterpret_cast<Sample*>(S));
}
void AILCALL AIL_set_3D_sample_volume(H3DSAMPLE S, S32 volume)
{
    reinterpret_cast<Sample*>(S)->volume = volume;
    Update(reinterpret_cast<Sample*>(S));
}
void AILCALL AIL_set_3D_sample_loop_count(H3DSAMPLE S, U32 loops)
{
    reinterpret_cast<Sample*>(S)->loops = static_cast<S32>(loops);
}
void AILCALL AIL_set_3D_sample_loop_block(H3DSAMPLE S, S32 start, S32 end)
{
    reinterpret_cast<Sample*>(S)->loopStart = start;
    reinterpret_cast<Sample*>(S)->loopEnd = end;
}
void AILCALL AIL_set_3D_sample_float_distances(H3DSAMPLE, F32, F32, F32, F32)
{
}
void AILCALL AIL_set_3D_position(H3DPOBJECT, F32, F32, F32)
{
}
void AILCALL AIL_start_3D_sample(H3DSAMPLE S)
{
    Start(reinterpret_cast<Sample*>(S));
}
void AILCALL AIL_end_3D_sample(H3DSAMPLE S)
{
    Stop(reinterpret_cast<Sample*>(S));
}
U32 AILCALL AIL_3D_sample_status(H3DSAMPLE S)
{
    return Status(reinterpret_cast<Sample*>(S));
}

// Streams (speech, radio stations, music)
HSTREAM AILCALL AIL_open_stream(HDIGDRIVER, char FAR* filename, S32)
{
    Stream* s = new Stream();
    // a predicted tick's stream (a radio station) is only real once its tick is confirmed: web/audio.js
    // does not hear of it (it could replace a playing stream that had the same address)
    if (!gMuted && !gta2_js_stream_open(Id(s), gta2_port_normalise_path(filename)))
    {
        delete s;
        return nullptr; // missing or unreadable file: the game handles a null stream
    }
    strncpy(s->path, gta2_port_normalise_path(filename), sizeof(s->path) - 1);
    gStreams.push_back(s);
    return reinterpret_cast<HSTREAM>(s);
}
void AILCALL AIL_close_stream(HSTREAM s)
{
    if (!gMuted)
    {
        gta2_js_stream_close(Id(s));
    }
    Forget(gStreams, reinterpret_cast<Stream*>(s));
    delete reinterpret_cast<Stream*>(s);
}
void AILCALL AIL_start_stream(HSTREAM s)
{
    reinterpret_cast<Stream*>(s)->started = true;
    if (!gMuted)
    {
        gta2_js_stream_start(Id(s), reinterpret_cast<Stream*>(s)->loops);
    }
}
S32 AILCALL AIL_stream_status(HSTREAM s)
{
    return gta2_js_stream_playing(Id(s)) ? SMP_PLAYING : SMP_DONE;
}
void AILCALL AIL_set_stream_loop_count(HSTREAM s, S32 count)
{
    reinterpret_cast<Stream*>(s)->loops = count;
}
void AILCALL AIL_set_stream_ms_position(HSTREAM s, S32 ms)
{
    if (!gMuted)
    {
        gta2_js_stream_seek(Id(s), ms);
    }
}
void AILCALL AIL_stream_ms_position(HSTREAM s, S32 FAR* total, S32 FAR* current)
{
    if (total)
    {
        *total = gta2_js_stream_ms(Id(s), 0);
    }
    if (current)
    {
        *current = gta2_js_stream_ms(Id(s), 1);
    }
}
void AILCALL AIL_set_stream_playback_rate(HSTREAM s, S32 rate)
{
    Stream* st = reinterpret_cast<Stream*>(s);
    st->rate = rate;
    if (!gMuted)
    {
        gta2_js_stream_set(Id(s), st->volume, st->rate);
    }
}
S32 AILCALL AIL_stream_playback_rate(HSTREAM s)
{
    return reinterpret_cast<Stream*>(s)->rate;
}
void AILCALL AIL_set_stream_volume(HSTREAM s, S32 volume)
{
    Stream* st = reinterpret_cast<Stream*>(s);
    st->volume = volume;
    if (!gMuted)
    {
        gta2_js_stream_set(Id(s), st->volume, st->rate);
    }
}
S32 AILCALL AIL_stream_volume(HSTREAM s)
{
    return reinterpret_cast<Stream*>(s)->volume;
}

} // extern "C"

// Quick save (savestate_web.cpp): stream positions live in web/audio.js, so they are copied
// into the game's memory before it is saved.
void Gta2Port_AudioBeforeSave()
{
    for (Stream* s : gStreams)
    {
        s->playing = s->started && gta2_js_stream_playing(Id(s));
        s->positionMs = gta2_js_stream_ms(Id(s), 1);
    }
}

// Quick load: the game's memory now holds the saved sounds. web/audio.js drops what it was
// playing and gets the saved streams back where they were and the looping effects (engines,
// sirens). One-shot effects finish silently; the game still sees them for their real length.
void Gta2Port_AudioAfterRestore()
{
    gta2_js_audio_reset();
    for (Stream* s : gStreams)
    {
        if (!gta2_js_stream_open(Id(s), s->path))
        {
            continue;
        }
        gta2_js_stream_set(Id(s), s->volume, s->rate);
        gta2_js_stream_seek(Id(s), s->positionMs);
        if (s->playing)
        {
            gta2_js_stream_start(Id(s), s->loops);
        }
    }
    for (Sample* s : gSamples)
    {
        if (s->loops == 0 && Playing(s))
        {
            Start(s);
        }
    }
}
