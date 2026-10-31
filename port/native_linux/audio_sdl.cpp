// Native Linux SDL2 Audio Mixer for GTA 2
// Replaces Emscripten web audio shims with direct ALSA/PulseAudio/PipeWire output via SDL2.

#include <SDL2/SDL.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <algorithm>
#include <vector>
#include <string>

extern "C" const char* gta2_port_normalise_path(const char* path);

namespace {

constexpr int MAX_VOICES = 64;
constexpr int MAX_STREAMS = 8;
constexpr int TARGET_FREQ = 44100;
constexpr int TARGET_CHANNELS = 2;

struct Voice {
    int id = 0;
    const uint8_t* data = nullptr;
    int len = 0;
    int rate = 22050;
    int format = 1; // DIG_F_MONO_16 = 1, DIG_F_STEREO_16 = 3, DIG_F_MONO_8 = 0, DIG_F_STEREO_8 = 2
    int loops = 1;
    int loopStart = 0;
    int loopEnd = -1;
    int volume = 127;
    int pan = 64;
    double pos = 0.0;
    bool active = false;
};

struct StreamVoice {
    int id = 0;
    uint8_t* cvt_data = nullptr;
    int cvt_len = 0;
    int loops = 1;
    int volume = 127;
    int rate = TARGET_FREQ;
    double pos = 0.0;
    bool active = false;
    bool playing = false;
    uint32_t total_ms = 0;
};

SDL_AudioDeviceID g_audioDev = 0;
int g_masterVolume = 127;
Voice g_voices[MAX_VOICES];
StreamVoice g_streams[MAX_STREAMS];

static void AudioMixerCallback(void* userdata, Uint8* stream, int len) {
    memset(stream, 0, len);
    int16_t* out = reinterpret_cast<int16_t*>(stream);
    int total_frames = len / (TARGET_CHANNELS * sizeof(int16_t));

    for (int f = 0; f < total_frames; ++f) {
        int32_t mix_l = 0;
        int32_t mix_r = 0;

        // 1. Mix Sound Effect Voices
        for (int v = 0; v < MAX_VOICES; ++v) {
            Voice& voice = g_voices[v];
            if (!voice.active || !voice.data || voice.len <= 0) continue;

            const float master = static_cast<float>(g_masterVolume) / 127.0f;
            const float vol = (static_cast<float>(voice.volume) / 127.0f) * master;
            float pan_l = 1.0f;
            float pan_r = 1.0f;
            if (voice.pan < 64) {
                pan_r = static_cast<float>(voice.pan) / 64.0f;
            } else if (voice.pan > 64) {
                pan_l = static_cast<float>(127 - voice.pan) / 63.0f;
            }

            int16_t sample_l = 0;
            int16_t sample_r = 0;
            const int frame_idx = static_cast<int>(voice.pos);

            const bool is16 = (voice.format & 1) != 0;
            const bool isStereo = (voice.format & 2) != 0;
            const int bytes_per_frame = (is16 ? 2 : 1) * (isStereo ? 2 : 1);
            const int max_frames = voice.len / bytes_per_frame;

            if (frame_idx >= max_frames) {
                if (voice.loops == 0 || voice.loops > 1) {
                    if (voice.loops > 1) voice.loops--;
                    int loopStartFrame = (voice.loopStart > 0) ? (voice.loopStart / bytes_per_frame) : 0;
                    voice.pos = loopStartFrame;
                    continue;
                } else {
                    voice.active = false;
                    continue;
                }
            }

            if (is16) {
                const int16_t* pcm16 = reinterpret_cast<const int16_t*>(voice.data);
                if (isStereo) {
                    sample_l = pcm16[frame_idx * 2];
                    sample_r = pcm16[frame_idx * 2 + 1];
                } else {
                    sample_l = pcm16[frame_idx];
                    sample_r = sample_l;
                }
            } else {
                if (isStereo) {
                    sample_l = static_cast<int16_t>((voice.data[frame_idx * 2] - 128) << 8);
                    sample_r = static_cast<int16_t>((voice.data[frame_idx * 2 + 1] - 128) << 8);
                } else {
                    sample_l = static_cast<int16_t>((voice.data[frame_idx] - 128) << 8);
                    sample_r = sample_l;
                }
            }

            mix_l += static_cast<int32_t>(sample_l * vol * pan_l);
            mix_r += static_cast<int32_t>(sample_r * vol * pan_r);

            const double step = (voice.rate > 0) ? (static_cast<double>(voice.rate) / static_cast<double>(TARGET_FREQ)) : 1.0;
            voice.pos += step;
        }

        // 2. Mix Streams (Radio & Vocal WAVs)
        for (int s = 0; s < MAX_STREAMS; ++s) {
            StreamVoice& streamVoice = g_streams[s];
            if (!streamVoice.active || !streamVoice.playing || !streamVoice.cvt_data || streamVoice.cvt_len <= 0) continue;

            const float master = static_cast<float>(g_masterVolume) / 127.0f;
            const float vol = (static_cast<float>(streamVoice.volume) / 127.0f) * master;

            const int max_frames = streamVoice.cvt_len / (TARGET_CHANNELS * sizeof(int16_t));
            const int frame_idx = static_cast<int>(streamVoice.pos);

            if (frame_idx >= max_frames) {
                if (streamVoice.loops == 0 || streamVoice.loops > 1) {
                    if (streamVoice.loops > 1) streamVoice.loops--;
                    streamVoice.pos = 0;
                    continue;
                } else {
                    streamVoice.playing = false;
                    continue;
                }
            }

            const int16_t* pcm = reinterpret_cast<const int16_t*>(streamVoice.cvt_data);
            int16_t sample_l = pcm[frame_idx * 2];
            int16_t sample_r = pcm[frame_idx * 2 + 1];

            mix_l += static_cast<int32_t>(sample_l * vol);
            mix_r += static_cast<int32_t>(sample_r * vol);

            const double step = (streamVoice.rate > 0) ? (static_cast<double>(streamVoice.rate) / static_cast<double>(TARGET_FREQ)) : 1.0;
            streamVoice.pos += step;
        }

        // Clamp to 16-bit signed PCM
        mix_l = std::max(-32768, std::min(32767, mix_l));
        mix_r = std::max(-32768, std::min(32767, mix_r));

        *out++ = static_cast<int16_t>(mix_l);
        *out++ = static_cast<int16_t>(mix_r);
    }
}

} // namespace

extern "C" {

void Gta2Audio_Init() {
    if (g_audioDev != 0) return;

    SDL_AudioSpec want, have;
    SDL_zero(want);
    want.freq = TARGET_FREQ;
    want.format = AUDIO_S16SYS;
    want.channels = TARGET_CHANNELS;
    want.samples = 1024;
    want.callback = AudioMixerCallback;

    g_audioDev = SDL_OpenAudioDevice(nullptr, 0, &want, &have, 0);
    if (g_audioDev == 0) {
        // Fallback: try enumerated audio playback devices
        const int count = SDL_GetNumAudioDevices(0);
        for (int i = 0; i < count; ++i) {
            const char* devName = SDL_GetAudioDeviceName(i, 0);
            g_audioDev = SDL_OpenAudioDevice(devName, 0, &want, &have, 0);
            if (g_audioDev != 0) {
                printf("Gta2Audio: Connected to audio device '%s'\n", devName ? devName : "unknown");
                break;
            }
        }
    }
    if (g_audioDev == 0) {
        // Fallback to direct ALSA hardware device
        g_audioDev = SDL_OpenAudioDevice("hw:0,0", 0, &want, &have, 0);
    }
    if (g_audioDev == 0) {
        fprintf(stderr, "Gta2Audio: SDL_OpenAudioDevice failed: %s\n", SDL_GetError());
        return;
    }

    printf("Gta2Audio: Native Linux SDL2 audio initialized (%d Hz, %d channels)\n", have.freq, have.channels);
    SDL_PauseAudioDevice(g_audioDev, 0); // start playback
}

void Gta2Audio_Shutdown() {
    if (g_audioDev != 0) {
        SDL_CloseAudioDevice(g_audioDev);
        g_audioDev = 0;
    }
    for (int s = 0; s < MAX_STREAMS; ++s) {
        if (g_streams[s].cvt_data) {
            free(g_streams[s].cvt_data);
            g_streams[s].cvt_data = nullptr;
        }
    }
}

void gta2_js_sample_start(int id, const void* data, int len, int rate, int format, int loops, int loopStart, int loopEnd, int volume, int pan) {
    if (g_audioDev == 0) Gta2Audio_Init();
    if (g_audioDev == 0) return;

    SDL_LockAudioDevice(g_audioDev);

    // Find existing voice by ID or an unused slot
    Voice* slot = nullptr;
    for (int i = 0; i < MAX_VOICES; ++i) {
        if (g_voices[i].active && g_voices[i].id == id) {
            slot = &g_voices[i];
            break;
        }
    }
    if (!slot) {
        for (int i = 0; i < MAX_VOICES; ++i) {
            if (!g_voices[i].active) {
                slot = &g_voices[i];
                break;
            }
        }
    }
    if (!slot) {
        slot = &g_voices[0]; // steal slot 0 if all occupied
    }

    slot->id = id;
    slot->data = static_cast<const uint8_t*>(data);
    slot->len = len;
    slot->rate = (rate > 0) ? rate : 22050;
    slot->format = format;
    slot->loops = loops;
    slot->loopStart = loopStart;
    slot->loopEnd = loopEnd;
    slot->volume = volume;
    slot->pan = pan;
    slot->pos = 0.0;
    slot->active = true;

    SDL_UnlockAudioDevice(g_audioDev);
}

void gta2_js_sample_update(int id, int volume, int pan, int rate) {
    if (g_audioDev == 0) return;
    SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_VOICES; ++i) {
        if (g_voices[i].active && g_voices[i].id == id) {
            g_voices[i].volume = volume;
            g_voices[i].pan = pan;
            if (rate > 0) g_voices[i].rate = rate;
            break;
        }
    }
    SDL_UnlockAudioDevice(g_audioDev);
}

void gta2_js_sample_stop(int id) {
    if (g_audioDev == 0) return;
    SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_VOICES; ++i) {
        if (g_voices[i].active && g_voices[i].id == id) {
            g_voices[i].active = false;
            break;
        }
    }
    SDL_UnlockAudioDevice(g_audioDev);
}

int gta2_js_stream_open(int id, const char* path) {
    if (g_audioDev == 0) Gta2Audio_Init();
    if (!path) return 0;

    const char* norm = gta2_port_normalise_path(path);

    SDL_AudioSpec wavSpec;
    Uint8* wavBuf = nullptr;
    Uint32 wavLen = 0;

    if (!SDL_LoadWAV(norm, &wavSpec, &wavBuf, &wavLen)) {
        // Also try under data/ or data/data/audio/Vocals
        std::string alt = std::string("data/data/audio/Vocals/") + path;
        if (!SDL_LoadWAV(alt.c_str(), &wavSpec, &wavBuf, &wavLen)) {
            return 0;
        }
    }

    // Convert audio to TARGET_FREQ (44100 Hz), 16-bit signed stereo
    SDL_AudioCVT cvt;
    if (SDL_BuildAudioCVT(&cvt, wavSpec.format, wavSpec.channels, wavSpec.freq,
                          AUDIO_S16SYS, TARGET_CHANNELS, TARGET_FREQ) < 0) {
        SDL_FreeWAV(wavBuf);
        return 0;
    }

    cvt.len = wavLen;
    cvt.buf = static_cast<Uint8*>(malloc(wavLen * cvt.len_mult));
    memcpy(cvt.buf, wavBuf, wavLen);
    SDL_FreeWAV(wavBuf);

    if (SDL_ConvertAudio(&cvt) < 0) {
        free(cvt.buf);
        return 0;
    }

    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);

    StreamVoice* slot = nullptr;
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (!g_streams[i].active || g_streams[i].id == id) {
            slot = &g_streams[i];
            break;
        }
    }
    if (!slot) slot = &g_streams[0];

    if (slot->cvt_data) free(slot->cvt_data);
    slot->id = id;
    slot->cvt_data = cvt.buf;
    slot->cvt_len = cvt.len_cvt;
    slot->loops = 1;
    slot->volume = 127;
    slot->rate = TARGET_FREQ;
    slot->pos = 0.0;
    slot->active = true;
    slot->playing = false;
    slot->total_ms = static_cast<uint32_t>((static_cast<double>(cvt.len_cvt) / (TARGET_CHANNELS * sizeof(int16_t) * TARGET_FREQ)) * 1000.0);

    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);

    return 1;
}

void gta2_js_stream_close(int id) {
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (g_streams[i].active && g_streams[i].id == id) {
            g_streams[i].active = false;
            g_streams[i].playing = false;
            if (g_streams[i].cvt_data) {
                free(g_streams[i].cvt_data);
                g_streams[i].cvt_data = nullptr;
            }
            break;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
}

void gta2_js_stream_start(int id, int loops) {
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (g_streams[i].active && g_streams[i].id == id) {
            g_streams[i].loops = loops;
            g_streams[i].pos = 0.0;
            g_streams[i].playing = true;
            break;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
}

int gta2_js_stream_playing(int id) {
    int playing = 0;
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (g_streams[i].active && g_streams[i].id == id) {
            playing = g_streams[i].playing ? 1 : 0;
            break;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
    return playing;
}

void gta2_js_stream_set(int id, int volume, int rate) {
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (g_streams[i].active && g_streams[i].id == id) {
            g_streams[i].volume = volume;
            if (rate > 0) g_streams[i].rate = rate;
            break;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
}

void gta2_js_stream_seek(int id, int ms) {
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (g_streams[i].active && g_streams[i].id == id) {
            double target_frame = (static_cast<double>(ms) / 1000.0) * TARGET_FREQ;
            int max_frames = g_streams[i].cvt_len / (TARGET_CHANNELS * sizeof(int16_t));
            if (target_frame < 0) target_frame = 0;
            if (target_frame > max_frames) target_frame = max_frames;
            g_streams[i].pos = target_frame;
            break;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
}

int gta2_js_stream_ms(int id, int which) {
    int result = 0;
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_STREAMS; ++i) {
        if (g_streams[i].active && g_streams[i].id == id) {
            if (which == 0) { // total ms
                result = static_cast<int>(g_streams[i].total_ms);
            } else { // current ms
                result = static_cast<int>((g_streams[i].pos / TARGET_FREQ) * 1000.0);
            }
            break;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
    return result;
}

void gta2_js_audio_reset() {
    if (g_audioDev != 0) SDL_LockAudioDevice(g_audioDev);
    for (int i = 0; i < MAX_VOICES; ++i) {
        g_voices[i].active = false;
    }
    for (int s = 0; s < MAX_STREAMS; ++s) {
        g_streams[s].active = false;
        g_streams[s].playing = false;
        if (g_streams[s].cvt_data) {
            free(g_streams[s].cvt_data);
            g_streams[s].cvt_data = nullptr;
        }
    }
    if (g_audioDev != 0) SDL_UnlockAudioDevice(g_audioDev);
}

void gta2_js_master_volume(int volume) {
    g_masterVolume = std::max(0, std::min(127, volume));
}

} // extern "C"
