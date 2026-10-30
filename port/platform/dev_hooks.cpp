// Developer probes for automated testing (used by the shell's ?devdata mode
// and test scripts). They read game state and, as a test aid only, can spawn a
// car next to the player through the game's own Car_6C::SpawnCarAt_446230.
#include <emscripten.h>

#include "Camera.hpp"
#include "Car_BC.hpp"
#include "Game_0x40.hpp"
#include "Ped.hpp"
#include "Weapon_30.hpp"
#include "Player.hpp"
#include "char.hpp"
#include "map_0x370.hpp"
#include "sprite.hpp"
#include "Frontend.hpp"
#include "Gang.hpp"
#include "PlyDat_2BC0.hpp"
#include "rng.hpp"
#include "Char_Pool.hpp"
#include "port_coop.hpp"
#include "Object_2C_Pool.hpp"
#include "Object_5C.hpp"

namespace
{
Ped* PlayerPed()
{
    if (!gGame_0x40_67E008 || !gGame_0x40_67E008->field_38_orf1)
    {
        return nullptr;
    }
    return gGame_0x40_67E008->field_38_orf1->field_2C4_player_ped;
}

Sprite* PlayerSprite(Ped* ped)
{
    if (Car_BC* car = ped->get_car_416B60())
    {
        return car->field_50_car_sprite;
    }
    return ped->field_168_game_object ? ped->field_168_game_object->field_80_sprite_ptr : nullptr;
}

s32 gState[10];
} // namespace

extern "C" {

// [has player, in car, x, y, z (Fix16 raw, 1.0 = 16384 = one block), car speed
//  (Fix16 raw), car model, rotation (Ang16 raw), weapon kind (-1 none), ammo]
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_state()
{
    for (s32& v : gState)
    {
        v = 0;
    }
    Ped* ped = PlayerPed();
    if (!ped)
    {
        return gState;
    }
    gState[0] = 1;
    gState[8] = -1;
    if (Weapon_30* w = ped->field_170_selected_weapon)
    {
        gState[8] = w->field_1C_idx;
        gState[9] = w->get_ammo_4A4FE0();
    }
    Car_BC* car = ped->get_car_416B60();
    gState[1] = car ? 1 : 0;
    if (Sprite* s = PlayerSprite(ped))
    {
        gState[2] = s->field_14_xy.x.mValue;
        gState[3] = s->field_14_xy.y.mValue;
        gState[4] = s->field_1C_zpos.mValue;
        gState[7] = s->field_0.rValue;
    }
    if (car)
    {
        gState[5] = car->GetCarLinearSpeed_43A240().mValue;
        gState[6] = car->field_84_car_info_idx;
    }
    return gState;
}

// The view camera: [x, y, z, zoom, left, right, top, bottom (Fix16 raw),
//  screen width, screen height (reference pixels), drawn z (Fix16 raw)].
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_camera()
{
    static s32 out[11];
    for (s32& v : out)
    {
        v = 0;
    }
    const Camera_0xBC* c = gViewCamera_676978;
    if (!gGame_0x40_67E008 || !c)
    {
        return out;
    }
    out[0] = c->field_98_cam_pos2.field_0_x.mValue;
    out[1] = c->field_98_cam_pos2.field_4_y.mValue;
    out[2] = c->field_98_cam_pos2.field_8_z.mValue;
    out[3] = c->field_98_cam_pos2.field_C_zoom.mValue;
    out[4] = c->field_78_boundaries_non_neg.field_0_left.mValue;
    out[5] = c->field_78_boundaries_non_neg.field_4_right.mValue;
    out[6] = c->field_78_boundaries_non_neg.field_8_top.mValue;
    out[7] = c->field_78_boundaries_non_neg.field_C_bottom.mValue;
    out[8] = c->field_68_screen_px_width;
    out[9] = c->field_6C_screen_px_height;
    out[10] = Gta2Port_PresentedCameraZ(c).mValue;
    return out;
}

// Test aid: spawns a car of the given model at the player's position plus
// (dx, dy) blocks, facing angle `rot` (Ang16 units, 0..1439).
EMSCRIPTEN_KEEPALIVE int gta2_dev_spawn_car(int model, int dx, int dy, int rot)
{
    Ped* ped = PlayerPed();
    Sprite* s = ped ? PlayerSprite(ped) : nullptr;
    if (!s || !gCar_6C_677930)
    {
        return 0;
    }
    Car_BC* car = gCar_6C_677930->SpawnCarAt_446230(s->field_14_xy.x + Fix16(dx), s->field_14_xy.y + Fix16(dy),
                                                    s->field_1C_zpos, Ang16(rot), model, Fix16(1));
    return car ? 1 : 0;
}

// Test aid: moves the player (on foot) to the centre of block (x, y).
EMSCRIPTEN_KEEPALIVE int gta2_dev_teleport(int x, int y)
{
    Ped* ped = PlayerPed();
    if (!ped || ped->get_car_416B60())
    {
        return 0;
    }
    ped->TeleportToCoord_45BC10(Fix16(x) + Fix16(0x2000, 0), Fix16(y) + Fix16(0x2000, 0));
    return 1;
}

// Test aid: the longest straight run of road blocks with nothing on top, for
// camera tests at speed. Returns [x, y, z, length, along y (0/1)].
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_find_road()
{
    static s32 best[5];
    best[3] = 0;
    if (!gMap_0x370_6F6268)
    {
        return best;
    }
    auto isRoad = [](s32 x, s32 y, s32 z) {
        gmp_block_info* b = gMap_0x370_6F6268->get_block_4DFE10(x, y, z);
        gmp_block_info* above = z < 7 ? gMap_0x370_6F6268->get_block_4DFE10(x, y, z + 1) : nullptr;
        return b && (b->field_B_slope_type & 3) == ROAD && (b->field_B_slope_type >> 2) == 0 &&
            (!above || (above->field_B_slope_type & 3) == AIR);
    };
    for (s32 dir = 0; dir < 2; ++dir)
    {
        for (s32 z = 0; z < 7; ++z)
        {
            for (s32 a = 0; a < 256; ++a)
            {
                s32 run = 0;
                for (s32 b = 0; b < 256; ++b)
                {
                    const bool road = dir ? isRoad(a, b, z) : isRoad(b, a, z);
                    run = road ? run + 1 : 0;
                    if (run > best[3])
                    {
                        best[0] = dir ? a : b - run + 1;
                        best[1] = dir ? b - run + 1 : a;
                        best[2] = z;
                        best[3] = run;
                        best[4] = dir;
                    }
                }
            }
        }
    }
    return best;
}

// Test aid: unlocks all three areas for the current player, as the original's
// UKGAMER player-name cheat does (Frontend.cpp).
EMSCRIPTEN_KEEPALIVE int gta2_dev_unlock_areas()
{
    if (!gPlyDat_6FEAC0 || !gFrontend_67DC84)
    {
        return 0;
    }
    gPlyDat_6FEAC0->UnlockAllStages_56BC40();
    gFrontend_67DC84->UpdateMenuForCurrPlayer_4B42E0();
    return 1;
}

// Test aid: sets the player's respect with gang index (0..9) to value (-100..100).
EMSCRIPTEN_KEEPALIVE int gta2_dev_set_respect(int gang, int value)
{
    Player* player = gGame_0x40_67E008 ? gGame_0x40_67E008->field_38_orf1 : nullptr;
    if (!player || !gGangPool_CA8_67E274 || gang < 0 || gang > 9 || !gGangPool_CA8_67E274->field_0_gang_list[gang].field_0_used)
    {
        return 0;
    }
    gGangPool_CA8_67E274->field_0_gang_list[gang].SetRespect_4BEE30(player->get_idx_4219D0(), static_cast<char_type>(value));
    return 1;
}

namespace
{
Trailer* gTestTrailer = nullptr;
}

// Test aid: spawns an articulated truck (cab TRUKCAB1 + container trailer
// TRUKCONT) at the player's position plus (dx, dy) blocks, facing rot.
EMSCRIPTEN_KEEPALIVE int gta2_dev_spawn_truck(int dx, int dy, int rot)
{
    Ped* ped = PlayerPed();
    Sprite* s = ped ? PlayerSprite(ped) : nullptr;
    if (!s || !gCar_6C_677930)
    {
        return 0;
    }
    gTestTrailer = gCar_6C_677930->SpawnCabAndTrailer_446530(s->field_14_xy.x + Fix16(dx), s->field_14_xy.y + Fix16(dy),
                                                             Ang16(rot), car_model_enum::TRUKCAB1, car_model_enum::TRUKCONT);
    return gTestTrailer ? 1 : 0;
}

// The test truck: [cab x, y, rotation, trailer x, y, rotation] (Fix16 raw, Ang16).
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_truck_state()
{
    static s32 out[6];
    for (s32& v : out)
    {
        v = 0;
    }
    if (gTestTrailer && gTestTrailer->field_8_truck_cab && gTestTrailer->field_C_pCarOnTrailer)
    {
        const Sprite* cab = gTestTrailer->field_8_truck_cab->field_50_car_sprite;
        const Sprite* trl = gTestTrailer->field_C_pCarOnTrailer->field_50_car_sprite;
        out[0] = cab->field_14_xy.x.mValue;
        out[1] = cab->field_14_xy.y.mValue;
        out[2] = cab->field_0.rValue;
        out[3] = trl->field_14_xy.x.mValue;
        out[4] = trl->field_14_xy.y.mValue;
        out[5] = trl->field_0.rValue;
    }
    return out;
}

// The camera position the last draw used (interpolated when D04 is on), Fix16 raw.
extern "C" s32 gGta2PortDrawnCam[2];
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_drawn_camera()
{
    return gGta2PortDrawnCam;
}

// Test aid: gives the player a weapon, as the mission script command does.
EMSCRIPTEN_KEEPALIVE int gta2_dev_give_weapon(int kind, int ammo)
{
    Ped* ped = PlayerPed();
    return ped ? ped->AddWeaponWithAmmo_45DD30(kind, static_cast<char_type>(ammo)) : 0;
}

// Test aid: adds cash to the player (e.g. the $50,000 a church save costs).
EMSCRIPTEN_KEEPALIVE int gta2_dev_add_cash(int cash)
{
    if (!gGame_0x40_67E008 || !gGame_0x40_67E008->field_38_orf1)
    {
        return 0;
    }
    gGame_0x40_67E008->field_38_orf1->AddCash_421990(cash);
    return gGame_0x40_67E008->field_38_orf1->GetScore_421980();
}

// Co-op (D20) sync check: values every player's game must agree on in a
// lockstep match. [0] game RNG, [1] world RNG, [2] hash of every sprite's
// position, [3..14] x, y per player slot 0-5 (0 when absent), [15..22] hash
// of the sprites of each type 0-7, [23..30] how many sprites of each type.
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_sync_state()
{
    static s32 v[31];
    for (s32& x : v)
    {
        x = 0;
    }
    if (!gGame_0x40_67E008)
    {
        return v;
    }
    v[0] = gpRng_67AB34 ? gpRng_67AB34->get_cur_rng_41CFE0() : 0;
    v[1] = gRng_6F6784.field_0_rng;
    if (gSprite_Pool_703818)
    {
        u32 h = 2166136261u;
        u32 byType[8];
        for (u32& t : byType)
        {
            t = 2166136261u;
        }
        Sprite* pool = gSprite_Pool_703818->field_0_pool.field_4_pool;
        for (s32 i = 0; i < 5031; ++i)
        {
            const Sprite& sp = pool[i];
            if (!sp.field_4_0x4C_len)
            {
                continue;
            }
            const u32 x = static_cast<u32>(sp.field_14_xy.x.mValue), y = static_cast<u32>(sp.field_14_xy.y.mValue);
            h = (((h ^ x) * 16777619u) ^ y) * 16777619u;
            const s32 type = sp.field_30_sprite_type_enum & 7;
            byType[type] = (((byType[type] ^ x) * 16777619u) ^ y) * 16777619u;
            ++v[23 + type];
        }
        v[2] = static_cast<s32>(h);
        for (s32 t = 0; t < 8; ++t)
        {
            v[15 + t] = static_cast<s32>(byType[t]);
        }
    }
    for (u8 i = 0; i < 6; ++i)
    {
        Player* p = gGame_0x40_67E008->get_player_4219E0(i);
        Ped* ped = p ? p->field_2C4_player_ped : nullptr;
        if (Sprite* sp = ped ? PlayerSprite(ped) : nullptr)
        {
            v[3 + i * 2] = sp->field_14_xy.x.mValue;
            v[4 + i * 2] = sp->field_14_xy.y.mValue;
        }
    }
    return v;
}

// Co-op desync hunting: after every game tick of a network game (winmain.cpp)
// the sprite hashes by type are kept for the last 1024 ticks, and the full
// sprite list of one chosen tick can be captured.
namespace
{
constexpr s32 kSyncTicks = 1024;
s32 gSyncTick = 0;
// tick, game RNG, world RNG, peds, hash of the peds (id, position, health), cars, hash of the cars
// (id, position, rotation), hash of the objects (bullets and rockets, pick-ups, debris: id, model,
// position, in the pool's order), hash of the players (cash, wanted points, health, weapon and ammo,
// in a car). Peds, cars and objects are the simulation's own pools; sprites are not used, since
// their cached boxes are built lazily for what each player's screen shows.
s32 gSyncHistory[kSyncTicks][9];
s32 gSyncDumpAt = -1;
s32 gSyncDump[1 + 5031 * 5]; // count, then type, x, y, z, rotation per sprite
s32 gSyncPeds[1 + 200 * 5];   // count, then id, x, y, has a sprite, ped type per live ped (pool order)
} // namespace

extern "C" void Gta2Port_SyncRecord()
{
    s32* row = gSyncHistory[gSyncTick % kSyncTicks];
    for (s32 i = 0; i < 9; ++i)
    {
        row[i] = 0;
    }
    row[0] = gSyncTick;
    row[1] = gpRng_67AB34 ? gpRng_67AB34->get_cur_rng_41CFE0() : 0;
    row[2] = gRng_6F6784.field_0_rng;
    const auto mix = [](u32 h, s32 v) { return (h ^ static_cast<u32>(v)) * 16777619u; };
    u32 h = 2166136261u;
    for (Ped* ped = gPedPool_6787B8 ? gPedPool_6787B8->field_0_pool.field_4_pPrev : nullptr; ped; ped = ped->mpNext)
    {
        ++row[3];
        h = mix(mix(mix(mix(h, ped->field_200_id), ped->get_cam_x().mValue), ped->get_cam_y().mValue), ped->field_216_health);
    }
    row[4] = static_cast<s32>(h);
    h = 2166136261u;
    for (Car_BC* car = gCar_BC_Pool_67792C ? gCar_BC_Pool_67792C->field_0_pool.field_4_pPrev : nullptr; car; car = car->mpNext)
    {
        ++row[5];
        h = mix(h, car->field_6C_car_id);
        if (const Sprite* sp = car->field_50_car_sprite)
        {
            h = mix(mix(mix(h, sp->field_14_xy.x.mValue), sp->field_14_xy.y.mValue), sp->field_0.rValue);
        }
    }
    row[6] = static_cast<s32>(h);
    h = 2166136261u;
    for (Object_2C* o = gObject_2C_Pool_6F8F80 ? gObject_2C_Pool_6F8F80->GetFirstUsed_4B8FD0() : nullptr; o; o = o->mpNext)
    {
        h = mix(mix(h, o->field_14_id), o->field_18_model);
        if (const Sprite* sp = o->field_4)
        {
            h = mix(mix(mix(h, sp->field_14_xy.x.mValue), sp->field_14_xy.y.mValue), sp->field_1C_zpos.mValue);
        }
    }
    row[7] = static_cast<s32>(h);
    h = 2166136261u;
    for (u8 i = 0; gGame_0x40_67E008 && i < MAX_PLAYERS; ++i)
    {
        Player* p = gGame_0x40_67E008->get_player_4219E0(i);
        if (!p || !p->field_8E_bInUse)
        {
            continue;
        }
        h = mix(mix(h, i), p->GetScore_421980());
        if (Ped* ped = p->field_2C4_player_ped)
        {
            h = mix(mix(mix(h, ped->field_20A_wanted_points), ped->field_216_health), ped->get_car_416B60() ? 1 : 0);
            if (Weapon_30* w = ped->field_170_selected_weapon)
            {
                h = mix(mix(h, w->field_1C_idx), w->get_ammo_4A4FE0());
            }
        }
    }
    row[8] = static_cast<s32>(h);
    if (gSyncTick == gSyncDumpAt && gSprite_Pool_703818)
    {
        s32 n = 0;
        Sprite* pool = gSprite_Pool_703818->field_0_pool.field_4_pool;
        for (s32 i = 0; i < 5031; ++i)
        {
            const Sprite& sp = pool[i];
            if (sp.field_4_0x4C_len)
            {
                s32* o = &gSyncDump[1 + n++ * 5];
                o[0] = sp.field_30_sprite_type_enum;
                o[1] = sp.field_14_xy.x.mValue;
                o[2] = sp.field_14_xy.y.mValue;
                o[3] = sp.field_1C_zpos.mValue;
                o[4] = sp.field_0.rValue;
            }
        }
        gSyncDump[0] = n;
        n = 0;
        for (Ped* ped = gPedPool_6787B8 ? gPedPool_6787B8->field_0_pool.field_4_pPrev : nullptr; ped && n < 200; ped = ped->mpNext)
        {
            s32* o = &gSyncPeds[1 + n++ * 5];
            o[0] = ped->field_200_id;
            o[1] = ped->get_cam_x().mValue;
            o[2] = ped->get_cam_y().mValue;
            o[3] = ped->field_168_game_object != nullptr;
            o[4] = ped->field_238_ped_type;
        }
        gSyncPeds[0] = n;
    }
    ++gSyncTick;
}

EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_sync_peds()
{
    return gSyncPeds;
}

EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_sync_history()
{
    return &gSyncHistory[0][0];
}

EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_sync_dump(int at)
{
    if (at >= 0)
    {
        gSyncDumpAt = at;
    }
    return gSyncDump;
}

// Friendly fire test (one machine only, it changes the game): player `attacker`'s ped hits player
// `victim`'s ped for `damage`. Returns health before * 1000 + health after, or -1.
EMSCRIPTEN_KEEPALIVE int gta2_dev_test_friendly_fire(int victim, int attacker, int damage)
{
    if (!gGame_0x40_67E008)
    {
        return -1;
    }
    Player* pv = gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(victim));
    Player* pa = gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(attacker));
    Ped* v = pv ? pv->field_2C4_player_ped : nullptr;
    Ped* a = pa ? pa->field_2C4_player_ped : nullptr;
    if (!v || !a)
    {
        return -1;
    }
    const int before = v->field_216_health;
    v->field_204_killer_id = a->field_200_id;
    v->TakeDamage(static_cast<s16>(damage));
    return before * 1000 + v->field_216_health;
}

// Test aid: gang `gang`'s respect for player slot `slot` (-100..100), or -999.
EMSCRIPTEN_KEEPALIVE int gta2_dev_gang_respect(int gang, int slot)
{
    if (!gGangPool_CA8_67E274 || gang < 0 || gang > 9 || slot < 0 || slot > 5 || !gGangPool_CA8_67E274->field_0_gang_list[gang].field_0_used)
    {
        return -999;
    }
    return gGangPool_CA8_67E274->field_0_gang_list[gang].field_11C_respect[slot];
}

// Test aid (one machine only): spawns a car beside this player and seats player `slot`'s ped in it
// as the driver, for trying out riding together. Returns 1 when done.
EMSCRIPTEN_KEEPALIVE int gta2_dev_seat_player_driver(int slot, int model, int dx, int dy)
{
    Ped* me = PlayerPed();
    Sprite* s = me ? PlayerSprite(me) : nullptr;
    Player* p = gGame_0x40_67E008 ? gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(slot)) : nullptr;
    Ped* driver = p ? p->field_2C4_player_ped : nullptr;
    if (!s || !driver || driver == me || driver->get_car_416B60() || !gCar_6C_677930)
    {
        return 0;
    }
    Car_BC* car = gCar_6C_677930->SpawnCarAt_446230(s->field_14_xy.x + Fix16(dx), s->field_14_xy.y + Fix16(dy),
                                                    s->field_1C_zpos, Ang16(0), model, Fix16(1));
    if (!car)
    {
        return 0;
    }
    // as the game does when a ped gets in: the on-foot body goes, the ped drives
    if (Char_B4* body = driver->field_168_game_object)
    {
        if (body->field_88_obj_2c.field_0_p18)
        {
            body->field_88_obj_2c.DestroyAllSprites_5A7010();
        }
        gChar_B4_Pool_6FDB44->DeAllocate(body);
        driver->field_168_game_object = nullptr;
    }
    driver->SpawnPedInCar_45C730(car);
    driver->field_27C_ped_state_2 = ped_state_2::ped2_driving_10;
    return 1;
}

// Test aid: who is in player `slot`'s car: [in a car, driver is that player, passengers, player
// `other` is a passenger of it].
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_car_occupants(int slot, int other)
{
    static s32 v[4];
    v[0] = v[1] = v[2] = v[3] = 0;
    Player* p = gGame_0x40_67E008 ? gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(slot)) : nullptr;
    Player* o = gGame_0x40_67E008 ? gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(other)) : nullptr;
    Ped* ped = p ? p->field_2C4_player_ped : nullptr;
    Car_BC* car = ped ? ped->get_car_416B60() : nullptr;
    if (!car)
    {
        return v;
    }
    v[0] = 1;
    v[1] = car->field_54_driver == ped;
    v[2] = car->field_4_passengers_list.GetPedsCount_4716B0();
    Ped* op = o ? o->field_2C4_player_ped : nullptr;
    v[3] = op && op->get_car_416B60() == car && car->field_54_driver != op;
    return v;
}

// Test aid: [riding policy, can player `a` ride with player `b`, b's ped is its car's driver, b has a player].
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_ride_check(int a, int b)
{
    static s32 v[4];
    v[0] = gGta2PortRideTogether;
    Player* pa = gGame_0x40_67E008 ? gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(a)) : nullptr;
    Player* pb = gGame_0x40_67E008 ? gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(b)) : nullptr;
    Ped* x = pa ? pa->field_2C4_player_ped : nullptr;
    Ped* y = pb ? pb->field_2C4_player_ped : nullptr;
    v[1] = Gta2Port_CanRideWith(x, y);
    v[2] = y && y->get_car_416B60() && y->get_car_416B60()->field_54_driver == y;
    v[3] = y && y->field_15C_player != nullptr;
    return v;
}

// Test aid: player `slot`'s ped: [passenger flag, target door, objective, internal objective,
// state 1, state 2, objective status, has a target car, in a car].
EMSCRIPTEN_KEEPALIVE const s32* gta2_dev_ped_entry(int slot)
{
    static s32 v[9];
    for (s32& x : v)
    {
        x = -1;
    }
    Player* p = gGame_0x40_67E008 ? gGame_0x40_67E008->get_player_4219E0(static_cast<u8>(slot)) : nullptr;
    Ped* ped = p ? p->field_2C4_player_ped : nullptr;
    if (!ped)
    {
        return v;
    }
    v[0] = ped->field_248_enter_car_as_passenger;
    v[1] = ped->field_24C_target_car_door;
    v[2] = ped->field_258_objective;
    v[3] = ped->field_25C_internal_objective;
    v[4] = ped->field_278_ped_state_1;
    v[5] = ped->field_27C_ped_state_2;
    v[6] = ped->field_225_objective_status;
    v[7] = ped->field_150_target_objective_car != nullptr;
    v[8] = ped->get_car_416B60() != nullptr;
    return v;
}

} // extern "C"
