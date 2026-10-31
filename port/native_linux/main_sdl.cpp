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
        case SDL_SCANCODE_ESCAPE: return {0x01, 0x1B}; // DIK_ESCAPE
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
        case SDL_SCANCODE_TAB: return {0x0F, 0x09}; // DIK_TAB (Horn)
        
        // Enter Vehicle / Menu Select: Return, Keypad Enter, or F
        case SDL_SCANCODE_RETURN:
        case SDL_SCANCODE_KP_ENTER:
        case SDL_SCANCODE_F: return {0x1C, 0x0D}; // DIK_RETURN
        
        // Jump / Handbrake
        case SDL_SCANCODE_SPACE: return {0x39, 0x20}; // DIK_SPACE

        // Directional controls: Both Arrow Keys and WASD map to DIK_UP/DOWN/LEFT/RIGHT
        case SDL_SCANCODE_UP:
        case SDL_SCANCODE_W: return {0xC8, 0x26}; // DIK_UP (Forward / Menu Up)
        
        case SDL_SCANCODE_DOWN:
        case SDL_SCANCODE_S: return {0xD0, 0x28}; // DIK_DOWN (Back / Menu Down)
        
        case SDL_SCANCODE_LEFT:
        case SDL_SCANCODE_A: return {0xCB, 0x25}; // DIK_LEFT (Turn Left / Menu Left)
        
        case SDL_SCANCODE_RIGHT:
        case SDL_SCANCODE_D: return {0xCD, 0x27}; // DIK_RIGHT (Turn Right / Menu Right)

        // Attack / Punch / Shoot: Left Ctrl, Right Ctrl, or L
        case SDL_SCANCODE_LCTRL:
        case SDL_SCANCODE_RCTRL:
        case SDL_SCANCODE_L: return {0x1D, 0x11}; // DIK_LCONTROL

        // Weapons
        case SDL_SCANCODE_Z:
        case SDL_SCANCODE_J:
        case SDL_SCANCODE_Q: return {0x2C, 'Z'}; // DIK_Z (Prev Weapon)
        case SDL_SCANCODE_X:
        case SDL_SCANCODE_K:
        case SDL_SCANCODE_E: return {0x2D, 'X'}; // DIK_X (Next Weapon)

        // Horn / Special 1
        case SDL_SCANCODE_H:
        case SDL_SCANCODE_I: return {0x0F, 0x09}; // DIK_TAB

        // Special 2 (Car Extras)
        case SDL_SCANCODE_LALT:
        case SDL_SCANCODE_RALT:
        case SDL_SCANCODE_O: return {0x38, 0x12}; // DIK_LMENU

        // Status
        case SDL_SCANCODE_LSHIFT:
        case SDL_SCANCODE_RSHIFT:
        case SDL_SCANCODE_P: return {0x36, 0x10}; // DIK_RSHIFT

        case SDL_SCANCODE_M: return {0x32, 'M'};
        case SDL_SCANCODE_C: return {0x2E, 'C'};
        case SDL_SCANCODE_V: return {0x2F, 'V'};
        case SDL_SCANCODE_B: return {0x30, 'B'};
        case SDL_SCANCODE_N: return {0x31, 'N'};
        case SDL_SCANCODE_R: return {0x13, 'R'};
        case SDL_SCANCODE_T: return {0x14, 'T'};
        case SDL_SCANCODE_Y: return {0x15, 'Y'};
        case SDL_SCANCODE_U: return {0x16, 'U'};
        case SDL_SCANCODE_G: return {0x22, 'G'};

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
        default: return {0, 0};
    }
}

void SeedRegistry() {
    const char* roots[] = {
        "hklm\\software\\dma design ltd\\gta2",
        "hkcu\\software\\dma design ltd\\gta2"
    };

    // Standard DirectInput scan code bindings
    int controls[12] = {
        0xC8, // 0 forward: DIK_UP (Arrow Up or W)
        0xD0, // 1 back: DIK_DOWN (Arrow Down or S)
        0xCB, // 2 left: DIK_LEFT (Arrow Left or A)
        0xCD, // 3 right: DIK_RIGHT (Arrow Right or D)
        0x1D, // 4 attack: DIK_LCONTROL (LCtrl, RCtrl or L)
        0x1C, // 5 enter vehicle: DIK_RETURN (Enter or F)
        0x39, // 6 jump/handbrake: DIK_SPACE (Space)
        0x2C, // 7 prev weapon: DIK_Z (Z, J, or Q)
        0x2D, // 8 next weapon: DIK_X (X, K, or E)
        0x0F, // 9 special 1: DIK_TAB (Tab or H)
        0x38, // 10 special 2: DIK_LMENU (Alt or O)
        0x36  // 11 status: DIK_RSHIFT (Shift or P)
    };

    for (const char* regRoot : roots) {
        char pathBuf[128];
        snprintf(pathBuf, sizeof(pathBuf), "%s\\screen", regRoot);
        gta2_port_reg_set_dword(pathBuf, "start_mode", 0);
        gta2_port_reg_set_dword(pathBuf, "do_play_movie", 0);

        snprintf(pathBuf, sizeof(pathBuf), "%s\\option", regRoot);
        gta2_port_reg_set_string(pathBuf, "language", "e");

        snprintf(pathBuf, sizeof(pathBuf), "%s\\debug", regRoot);
        gta2_port_reg_set_dword(pathBuf, "skip_trains", 0);

        for (int i = 0; i < 12; ++i) {
            char keyBuf[16];
            snprintf(keyBuf, sizeof(keyBuf), "%d", i);
            snprintf(pathBuf, sizeof(pathBuf), "%s\\control", regRoot);
            gta2_port_reg_set_dword(pathBuf, keyBuf, controls[i]);
        }
    }
    gta2_port_reg_set_dword("hklm\\software\\freeloader.com\\gta2", "cityinstalled", 2);
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
            if (ev.type == SDL_KEYDOWN) {
                // Instant hotkey quit from anywhere: Alt+F4 or Ctrl+Q
                if ((ev.key.keysym.sym == SDLK_F4 && (SDL_GetModState() & KMOD_ALT)) ||
                    (ev.key.keysym.sym == SDLK_q && (SDL_GetModState() & KMOD_CTRL))) {
                    running = false;
                    break;
                }
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
                    if (ev.key.keysym.scancode == SDL_SCANCODE_F7) {
                        gCameraMode = !gCameraMode;
                        gta2_port_set_camera(gCameraMode, gCameraHeightBias);
                        printf("[Camera] Mode: %s\n", gCameraMode ? "Modern Smoothed" : "Classic 1999");
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

                if (km.di_scan != 0) {
                    gta2_port_key(km.di_scan, km.vk, down, ch);
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
