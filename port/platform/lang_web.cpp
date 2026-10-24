// Live language switch for the shell's language setting (en/es/fr). Does exactly
// what the debug UI's "Change language" button does (ImGuiDebug.cpp), guarded so
// the shell can call it before the game has created its text and menu objects.
#include <emscripten.h>

#include "Frontend.hpp"
#include "text_0x14.hpp"

extern "C" {

// letter: first char of the registry "language" string ('e', 'f', 'g', 'i', 's',
// 'j', 'r', as accepted by text_0x14's constructor). Returns 1 when applied.
EMSCRIPTEN_KEEPALIVE int gta2_port_set_language(const char* letter)
{
    if (!gText_0x14_704DFC || !letter || !letter[0])
    {
        return 0;
    }
    const char_type code = letter[0];
    if (code != 'e' && code != 'f' && code != 'g' && code != 'i' && code != 's' && code != 'j' && code != 'r')
    {
        return 0;
    }
    gText_0x14_704DFC->field_10_lang_code = code;
    gText_0x14_704DFC->Load_5B5E90();
    if (gFrontend_67DC84)
    {
        gFrontend_67DC84->SetupMenuStringsOptionsElements_4B0220();
    }
    return 1;
}

} // extern "C"
