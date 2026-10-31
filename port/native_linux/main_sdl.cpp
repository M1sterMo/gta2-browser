#include <SDL2/SDL.h>
#include <SDL2/SDL_opengl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <string>
#include <vector>

#include "windows.h"

extern bool InitNativeRenderer(SDL_Window* window);

int __stdcall WinMain_5E53F0(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd);

// GTA 2 Port Core APIs
extern "C" {
void Gta2Port_StaticInit();
int Gta2Port_RunLoopSlice();

void gta2_port_reg_set_dword(const char* path, const char* name, DWORD value);
void gta2_port_reg_set_string(const char* path, const char* name, const char* value);
void gta2_port_key(int scancode, int vk, int down, int ch);
void gta2_port_mouse_move(int dx, int dy);
void gta2_port_mouse_button(int button, int down);
void gta2_port_release_all_keys();
void gta2_port_set_view_width(int width);
void gta2_port_set_camera(int mode, float heightBias);
void gta2_port_set_hud_edges(int on);
void gta2_port_set_interpolation(int on);
bool ToggleTextureFilter();
bool IsSmoothFilterEnabled();
}

// Map SDL_Scancode to DirectInput Scan Code and Virtual Key
struct KeyMap {
    int di_scan;
    int vk;
};

KeyMap GetKeyMapping(SDL_Scancode sc) {
    switch (sc) {
        case SDL_SCANCODE_ESCAPE: return {0x01, 0x1B};
        case SDL_SCANCODE_1: return {0x02, '1'};
        case SDL_SCANCODE_2: return {0x03, '2'};
        case SDL_SCANCODE_3: return {0x04, '3'};
        case SDL_SCANCODE_4: return {0x05, '4'};
        case SDL_SCANCODE_5: return {0x06, '5'};
        case SDL_SCANCODE_6: return {0x07, '6'};
        case SDL_SCANCODE_7: return {0x08, '7'};
        case SDL_SCANCODE_8: return {0x09, '8'};
        case SDL_SCANCODE_9: return {0x0A, '9'};
        case SDL_SCANCODE_0: return {0x0B, '0'};
        case SDL_SCANCODE_MINUS: return {0x0C, 0xBD};
        case SDL_SCANCODE_EQUALS: return {0x0D, 0xBB};
        case SDL_SCANCODE_BACKSPACE: return {0x0E, 0x08};
        case SDL_SCANCODE_TAB: return {0x0F, 0x09};
        case SDL_SCANCODE_Q: return {0x10, 'Q'};
        case SDL_SCANCODE_W: return {0x11, 'W'};
        case SDL_SCANCODE_E: return {0x12, 'E'};
        case SDL_SCANCODE_R: return {0x13, 'R'};
        case SDL_SCANCODE_T: return {0x14, 'T'};
        case SDL_SCANCODE_Y: return {0x15, 'Y'};
        case SDL_SCANCODE_U: return {0x16, 'U'};
        case SDL_SCANCODE_I: return {0x17, 'I'};
        case SDL_SCANCODE_O: return {0x18, 'O'};
        case SDL_SCANCODE_P: return {0x19, 'P'};
        case SDL_SCANCODE_RETURN: return {0x1C, 0x0D};
        case SDL_SCANCODE_LCTRL: return {0x1D, 0x11};
        case SDL_SCANCODE_A: return {0x1E, 'A'};
        case SDL_SCANCODE_S: return {0x1F, 'S'};
        case SDL_SCANCODE_D: return {0x20, 'D'};
        case SDL_SCANCODE_F: return {0x21, 'F'};
        case SDL_SCANCODE_G: return {0x22, 'G'};
        case SDL_SCANCODE_H: return {0x23, 'H'};
        case SDL_SCANCODE_J: return {0x24, 'J'};
        case SDL_SCANCODE_K: return {0x25, 'K'};
        case SDL_SCANCODE_L: return {0x26, 'L'};
        case SDL_SCANCODE_LSHIFT: return {0x2A, 0x10};
        case SDL_SCANCODE_Z: return {0x2C, 'Z'};
        case SDL_SCANCODE_X: return {0x2D, 'X'};
        case SDL_SCANCODE_C: return {0x2E, 'C'};
        case SDL_SCANCODE_V: return {0x2F, 'V'};
        case SDL_SCANCODE_B: return {0x30, 'B'};
        case SDL_SCANCODE_N: return {0x31, 'N'};
        case SDL_SCANCODE_M: return {0x32, 'M'};
        case SDL_SCANCODE_RSHIFT: return {0x36, 0x10};
        case SDL_SCANCODE_LALT: return {0x38, 0x12};
        case SDL_SCANCODE_SPACE: return {0x39, 0x20};
        case SDL_SCANCODE_F1: return {0x3B, 0x70};
        case SDL_SCANCODE_F2: return {0x3C, 0x71};
        case SDL_SCANCODE_F3: return {0x3D, 0x72};
        case SDL_SCANCODE_F4: return {0x3E, 0x73};
        case SDL_SCANCODE_F5: return {0x3F, 0x74};
        case SDL_SCANCODE_F6: return {0x40, 0x75};
        case SDL_SCANCODE_F7: return {0x41, 0x76};
        case SDL_SCANCODE_F8: return {0x42, 0x77};
        case SDL_SCANCODE_F9: return {0x43, 0x78};
        case SDL_SCANCODE_F10: return {0x44, 0x79};
        case SDL_SCANCODE_F11: return {0x57, 0x7A};
        case SDL_SCANCODE_F12: return {0x58, 0x7B};
        case SDL_SCANCODE_RCTRL: return {0x9D, 0x11};
        case SDL_SCANCODE_RALT: return {0xB8, 0x12};
        case SDL_SCANCODE_UP: return {0xC8, 0x26};
        case SDL_SCANCODE_LEFT: return {0xCB, 0x25};
        case SDL_SCANCODE_RIGHT: return {0xCD, 0x27};
        case SDL_SCANCODE_DOWN: return {0xD0, 0x28};
        default: return {0, 0};
    }
}

void SeedRegistry() {
    const char* REG_ROOT = "hkcu\\software\\dma design ltd\\gta2";
    gta2_port_reg_set_dword("hkcu\\software\\dma design ltd\\gta2\\screen", "start_mode", 0);
    gta2_port_reg_set_dword("hkcu\\software\\dma design ltd\\gta2\\screen", "do_play_movie", 0);
    gta2_port_reg_set_dword("hklm\\software\\freeloader.com\\gta2", "cityinstalled", 2);
    gta2_port_reg_set_string("hkcu\\software\\dma design ltd\\gta2\\option", "language", "e");

    // Controls: Forward, Back, Left, Right, Attack, Enter Vehicle, Jump, Prev Wpn, Next Wpn, Special1, Special2, Status
    int controls[12] = {
        0x11, // 0 forward: W
        0x1F, // 1 back: S
        0x1E, // 2 left: A
        0x20, // 3 right: D
        0x26, // 4 attack: L
        0x1C, // 5 enter vehicle: Enter
        0x39, // 6 jump/handbrake: Space
        0x24, // 7 prev weapon: J
        0x25, // 8 next weapon: K
        0x17, // 9 special 1: I
        0x18, // 10 special 2: O
        0x19  // 11 status: P
    };

    for (int i = 0; i < 12; ++i) {
        char keyBuf[16];
        snprintf(keyBuf, sizeof(keyBuf), "%d", i);
        char pathBuf[128];
        snprintf(pathBuf, sizeof(pathBuf), "%s\\control", REG_ROOT);
        gta2_port_reg_set_dword(pathBuf, keyBuf, controls[i]);
    }
}

extern "C" void Gta2Audio_Init();
extern "C" void Gta2Audio_Shutdown();

int main(int argc, char** argv) {
    printf("========================================================\n");
    printf(" GTA 2 - Native Linux Port (OpenGL / SDL2)\n");
    printf(" Zero Wine - Native 64-bit ELF Binary\n");
    printf("========================================================\n");

    // Change directory to game asset directory if passed or exists
    const char* gameDir = (argc > 1) ? argv[1] : ".";
    if (chdir(gameDir) != 0) {
        perror("Failed to chdir to game directory");
    }

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_EVENTS) != 0) {
        fprintf(stderr, "SDL_Init Error: %s\n", SDL_GetError());
        return 1;
    }
    Gta2Audio_Init();

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);

    int winWidth = 1280, winHeight = 720; // 16:9 720p HD
    SDL_Window* window = SDL_CreateWindow(
        "Grand Theft Auto 2 (Native Linux 16:9)",
        SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
        winWidth, winHeight,
        SDL_WINDOW_OPENGL | SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE
    );

    if (!window) {
        fprintf(stderr, "Failed to create SDL window: %s\n", SDL_GetError());
        SDL_Quit();
        return 1;
    }

    SDL_GLContext glContext = SDL_GL_CreateContext(window);
    if (!glContext) {
        fprintf(stderr, "Failed to create OpenGL context: %s\n", SDL_GetError());
        SDL_DestroyWindow(window);
        SDL_Quit();
        return 1;
    }

    SDL_GL_SetSwapInterval(1); // VSync

    if (!InitNativeRenderer(window)) {
        fprintf(stderr, "Failed to initialize native OpenGL renderer!\n");
        return 1;
    }

    SeedRegistry();
    Gta2Port_StaticInit();

    // 16:9 Widescreen, Modern Smooth Camera, and Motion Interpolation setup
    int initialViewW = (int)std::round(480.0f * (1280.0f / 720.0f));
    if (initialViewW < 640) initialViewW = 640;
    if (initialViewW > 1280) initialViewW = 1280;
    initialViewW &= ~1;
    gta2_port_set_view_width(initialViewW);
    gta2_port_set_hud_edges(1);
    
    static float gCameraHeightBias = 1.2f;
    static int gCameraMode = 1; // 1 = Modern, 0 = Classic
    gta2_port_set_camera(gCameraMode, gCameraHeightBias);
    gta2_port_set_interpolation(1);

    char cmd[256] = "";
    int r = WinMain_5E53F0(reinterpret_cast<HINSTANCE>(0x400000), nullptr, cmd, SW_SHOWNORMAL);
    if (r != 0x7FFFFFFF) {
        printf("WinMain returned %d\n", r);
        return r;
    }

    printf("GTA 2 initialized! Entering native Linux game loop (16:9 Widescreen, Smooth Graphics)...\n");

    bool running = true;
    while (running) {
        SDL_Event ev;
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_QUIT) {
                running = false;
                break;
            }
            if (ev.type == SDL_KEYDOWN || ev.type == SDL_KEYUP) {
                // Ignore OS auto-repeat events so controls remain crisp and responsive with zero sticking!
                if (ev.key.repeat) {
                    continue;
                }

                int down = (ev.type == SDL_KEYDOWN) ? 1 : 0;

                // Hotkeys (only on press)
                if (down) {
                    if (ev.key.keysym.scancode == SDL_SCANCODE_F8) {
                        bool smooth = ToggleTextureFilter();
                        printf("[Graphics] Texture filter: %s\n", smooth ? "Smooth (Bilinear)" : "Retro (Pixelated / Nearest)");
                        continue;
                    }
                    if (ev.key.keysym.scancode == SDL_SCANCODE_EQUALS) {
                        gCameraHeightBias = std::max(gCameraHeightBias - 0.5f, -0.6f);
                        gta2_port_set_camera(gCameraMode, gCameraHeightBias);
                        printf("[Camera] Zoom in (height bias: %.1f)\n", gCameraHeightBias);
                        continue;
                    }
                    if (ev.key.keysym.scancode == SDL_SCANCODE_MINUS) {
                        gCameraHeightBias = std::min(gCameraHeightBias + 0.5f, 3.6f);
                        gta2_port_set_camera(gCameraMode, gCameraHeightBias);
                        printf("[Camera] Zoom out (height bias: %.1f)\n", gCameraHeightBias);
                        continue;
                    }
                }

                KeyMap km = GetKeyMapping(ev.key.keysym.scancode);
                char ch = (ev.key.keysym.sym < 128) ? (char)ev.key.keysym.sym : 0;
                
                int di_scan = km.di_scan;
                int vk = km.vk;

                // Also route Arrow Keys and Right Ctrl to match default controls without double-posting
                if (ev.key.keysym.scancode == SDL_SCANCODE_UP) { di_scan = 0x11; vk = 'W'; }
                else if (ev.key.keysym.scancode == SDL_SCANCODE_DOWN) { di_scan = 0x1F; vk = 'S'; }
                else if (ev.key.keysym.scancode == SDL_SCANCODE_LEFT) { di_scan = 0x1E; vk = 'A'; }
                else if (ev.key.keysym.scancode == SDL_SCANCODE_RIGHT) { di_scan = 0x20; vk = 'D'; }
                else if (ev.key.keysym.scancode == SDL_SCANCODE_RCTRL) { di_scan = 0x26; vk = 'L'; }

                if (di_scan != 0) {
                    gta2_port_key(di_scan, vk, down, ch);
                }
            } else if (ev.type == SDL_MOUSEMOTION) {
                gta2_port_mouse_move(ev.motion.xrel, ev.motion.yrel);
            } else if (ev.type == SDL_MOUSEBUTTONDOWN || ev.type == SDL_MOUSEBUTTONUP) {
                int down = (ev.type == SDL_MOUSEBUTTONDOWN) ? 1 : 0;
                int btn = (ev.button.button == SDL_BUTTON_LEFT) ? 0 :
                          (ev.button.button == SDL_BUTTON_RIGHT) ? 1 :
                          (ev.button.button == SDL_BUTTON_MIDDLE) ? 2 : 3;
                gta2_port_mouse_button(btn, down);
            } else if (ev.type == SDL_WINDOWEVENT) {
                if (ev.window.event == SDL_WINDOWEVENT_RESIZED) {
                    // Update view width dynamically when user resizes window
                    int w = ev.window.data1;
                    int h = ev.window.data2;
                    if (h > 0) {
                        int viewW = (int)std::round(480.0f * (float)w / (float)h);
                        if (viewW < 640) viewW = 640;
                        if (viewW > 1280) viewW = 1280;
                        viewW &= ~1;
                        gta2_port_set_view_width(viewW);
                    }
                }
            }
        }

        int loopResult = Gta2Port_RunLoopSlice();
        if (loopResult != -1 && loopResult != 0x7FFFFFFF) {
            printf("Game exited with code %d\n", loopResult);
            break;
        }

        SDL_Delay(1);
    }

    SDL_GL_DeleteContext(glContext);
    SDL_DestroyWindow(window);
    Gta2Audio_Shutdown();
    SDL_Quit();

    printf("Exited cleanly.\n");
    return 0;
}
