// The game's network session (NetPlay.cpp, DirectPlay) and lobby dialogs
// (Network_20324.cpp) are excluded from the browser build. This file provides
// the NetPlay calls the game makes during a network game, on top of a
// browser transport run by the shell (web/net.js): BroadcastChannel between
// tabs, or WebRTC data channels between players (D20, peer-to-peer, no
// server). Without a session it reports "no network", as single player
// expects.
//
// The transport delivers each peer's messages reliably and in order, so the
// original's packet layer (resends, out-of-order buffering, pings) reduces to
// a queue: each message is [subtype, input sequence, payload...], and the
// game's resends of older inputs (Net_4DA9B0, for lost packets) are not sent.
//
// Input delay (for internet latency): the inputs a player sends at tick N are
// for tick N + delay (winmain.cpp applies the local player's own inputs that
// late as well), so a message has `delay` ticks to arrive before anyone waits
// for it. The first `delay` ticks use empty inputs, queued here at the start.
//
// The match clock (co-op, web/clock.js) replaces that: a player's inputs go to the clock only,
// and every tick's inputs, this player's too, come back from it in one bundle, the same for every
// game. Nobody waits for another player, only for the clock. Bundles that arrive early are this
// game's buffer against jitter: winmain.cpp plays a little slower while fewer than the target are
// in hand and catches up while more are, and a tick that has to wait raises the target.
//
// Either way a tick takes at most one input message from each player (a round): with three or
// more players, one player's next inputs could otherwise be taken (and lost) while another
// player's were still on their way, and that game fell a tick behind for that player.
#include <emscripten.h>
#include <string.h>

#include <deque>
#include <vector>

#include "NetPlay.hpp"
#include "Network_20324.hpp"
#include "platform/port_api.h"

DEFINE_GLOBAL(NetPlay, gNetPlay_7071E8, 0x7071E8);
EXTERN_GLOBAL(s32, gNetworkGameSpeed_7071A0); // Game_0x40.cpp; the DirectPlay lobby set these
EXTERN_GLOBAL(s32, gNetworkPolice_7071B0);

namespace
{
constexpr u8 kStandard = 2; // packet_subtype::StandardPacket_2
constexpr u8 kInputs = 3;   // packet_subtype::PlayerInputs_3
constexpr u8 kKeepAlive = 2; // std_packet_subtype::KeepAlive_2
constexpr u8 kGiveUp = 1;    // std_packet_subtype::GiveUp_1

struct Message
{
    s32 from;
    u8 subtype;
    u8 seq;
    std::vector<u8> payload;
};

std::deque<Message> gInbox;
u8 gExpectedSeq[MAX_PLAYERS];
u8 gClockSeq[MAX_PLAYERS]; // sequence numbers for the inputs taken out of bundles
u8 gDelivered[256];
wchar_t gNames[MAX_PLAYERS][32];
bool gSession = false;
constexpr s32 kMaxInputDelay = 15;
// the match's map, style and script (data\ is added by the game)
char gMap[3][64];

u32 gRoundTaken = 0; // players whose inputs this tick's round has taken
s32 gBundles = 0;    // bundles received
s32 gRounds = 0;     // rounds begun (one per tick)
// The jitter buffer: bundles to keep in hand. A tick that waits raises it (up to kMaxBuffer, at
// most once a second, not in the match's first kSettleRounds while everyone is still entering);
// kCalmMs without a wait lowers it again.
constexpr s32 kMaxBuffer = 6;
constexpr double kCalmMs = 5000;
constexpr s32 kSettleRounds = 90;
s32 gBufferTarget = 1;
double gLastChange = 0;
double gLastRaise = 0;
s32 gWaits = 0; // ticks that waited for the clock, for the shell
} // namespace

extern "C" s32 gGta2PortNetInputDelay = 0; // ticks; read by winmain.cpp
extern "C" s32 gGta2PortNetClock = 0;      // 1: inputs come from the match clock; read by winmain.cpp
// 1: prediction (web/rollback.js runs the ticks and sends this player's inputs, stamped with their
// tick; winmain.cpp). The game's own sends then go nowhere: it plays ticks again after a
// correction, and a played-again tick must not reach anyone.
extern "C" s32 gGta2PortRollback = 0;

EM_JS(void, gta2_js_net_send, (int to, const void* data, int len), {
    Module.gta2Net && Module.gta2Net.send(to, HEAPU8.slice(data, data + len));
});

static void Send(s32 to, u8 subtype, u8 seq, const void* payload, s32 len)
{
    u8 buf[2 + 256];
    if (len < 0 || len > 256 || gGta2PortRollback)
    {
        return;
    }
    buf[0] = subtype;
    buf[1] = seq;
    memcpy(buf + 2, payload, len);
    gta2_js_net_send(to, buf, len + 2);
}

extern "C" {

// The shell sets up a session before starting a network game: count players
// (slots 0..count-1, 0 is the host), this player is slot me, inputs delayed by
// delay ticks (the same for every player), or clock 1: every input comes from
// the match clock (delay is then unused).
EMSCRIPTEN_KEEPALIVE void gta2_port_net_configure(int count, int me, int delay, int clock)
{
    NetPlay& n = gNetPlay_7071E8;
    gSession = count > 1;
    n.field_8F0_disabled = gSession ? 0 : 1;
    n.field_5D4_player_idx = me;
    n.field_758_n2.field_4_players_count = count;
    for (s32 i = 0; i < MAX_PLAYERS; ++i)
    {
        n.field_758_n2.field_10_players[i].field_0_in_use = i < count ? 1 : 0;
        n.field_758_n2.field_10_players[i].field_10_player_id = i;
        n.field_758_n2.field_8_packet_game_tick[i] = 0;
        gExpectedSeq[i] = 0;
        gClockSeq[i] = 0;
    }
    gInbox.clear();
    gRoundTaken = 0;
    gBundles = gRounds = gWaits = 0;
    gBufferTarget = 1;
    gLastChange = gLastRaise = gta2_port_now_ms();
    gGta2PortNetClock = gSession && clock ? 1 : 0;
    gGta2PortRollback = 0;
    if (gGta2PortNetClock)
    {
        delay = 0;
    }
    gGta2PortNetInputDelay = delay < 0 ? 0 : delay > kMaxInputDelay ? kMaxInputDelay : delay;
    // Free roam (D20): the fastest network speed, 33 ms per tick like single player (0 = 50 ms,
    // the original's slowest, was left by default), and the police on.
    gNetworkGameSpeed_7071A0 = 2;
    gNetworkPolice_7071B0 = 1;
    // Our first real inputs are for tick `delay`; every other player's ticks before that are empty.
    n.field_758_n2.field_8_packet_game_tick[me] = static_cast<u8>(gGta2PortNetInputDelay);
    for (s32 i = 0; gSession && i < count; ++i)
    {
        for (s32 t = 0; i != me && t < gGta2PortNetInputDelay; ++t)
        {
            gInbox.push_back({i, kInputs, static_cast<u8>(t), std::vector<u8>(4, 0)});
        }
    }
}

// Prediction (web/rollback.js) on or off, after gta2_port_net_configure; only with the match clock.
EMSCRIPTEN_KEEPALIVE void gta2_port_net_rollback(int on)
{
    gGta2PortRollback = on && gGta2PortNetClock ? 1 : 0;
}

extern s32 gRuleType, gRuleLimit, gRuleMinutes;

// The match rules: type 1 = frag game (free-for-all), 2 = points game; limit 0 = none; minutes 0 = none.
EMSCRIPTEN_KEEPALIVE void gta2_port_net_set_rules(int type, int limit, int minutes)
{
    gRuleType = type == 1 ? 1 : 2;
    gRuleLimit = limit > 0 ? limit : 0x7FFFFFFF;
    gRuleMinutes = minutes > 0 ? (minutes > 60 ? 60 : minutes) : 0;
}

// Friendly fire (co-op, D20): 0 = players cannot hurt each other. The same for every player.
extern "C" s32 gGta2PortFriendlyFire; // port_coop.cpp
EMSCRIPTEN_KEEPALIVE void gta2_port_set_friendly_fire(int on)
{
    gGta2PortFriendlyFire = on ? 1 : 0;
}

// The district to play: the original's multiplayer map, style and script for
// the player count (data/*.mmp).
EMSCRIPTEN_KEEPALIVE void gta2_port_net_set_map(const char* map, const char* style, const char* script)
{
    const char* names[3] = {map, style, script};
    for (s32 i = 0; i < 3; ++i)
    {
        strncpy(gMap[i], names[i], sizeof(gMap[i]) - 1);
        gMap[i][sizeof(gMap[i]) - 1] = 0;
    }
}

// A player's name for the game's HUD and kill messages (ASCII).
EMSCRIPTEN_KEEPALIVE void gta2_port_net_set_name(int idx, const char* name)
{
    if (idx < 0 || idx >= MAX_PLAYERS)
    {
        return;
    }
    s32 i = 0;
    for (; name[i] && i < 31; ++i)
    {
        gNames[idx][i] = static_cast<u8>(name[i]);
    }
    gNames[idx][i] = 0;
}

// A message from player `from` arrived (the shell calls this from its transport).
EMSCRIPTEN_KEEPALIVE void gta2_port_net_receive(int from, const u8* data, int len)
{
    if (!gSession || from < 0 || from >= MAX_PLAYERS || len < 2)
    {
        return;
    }
    gInbox.push_back({from, data[0], data[1], std::vector<u8>(data + 2, data + len)});
}

// A player's connection closed: the game handles it as if they had given up.
EMSCRIPTEN_KEEPALIVE void gta2_port_net_peer_left(int idx)
{
    if (!gSession || idx < 0 || idx >= MAX_PLAYERS)
    {
        return;
    }
    u8 payload[5] = {kGiveUp, 0, 0, 0, 0};
    memcpy(payload + 1, &idx, 4);
    gInbox.push_back({idx, kStandard, 0, std::vector<u8>(payload, payload + 5)});
}

// A tick's bundle from the match clock (web/clock.js), the shell passes them in order:
// [0x42, tick u32, n, n x (slot, kind 0 input / 1 left, bits u32)]. Each entry becomes the
// message that player's game would have sent: their inputs, or their give-up.
EMSCRIPTEN_KEEPALIVE void gta2_port_net_bundle(const u8* data, int len)
{
    if (!gSession || !gGta2PortNetClock || len < 6 || data[0] != 0x42 || len < 6 + data[5] * 6)
    {
        return;
    }
    for (s32 i = 0; i < data[5]; ++i)
    {
        const u8* e = data + 6 + i * 6;
        const s32 slot = e[0];
        if (slot >= MAX_PLAYERS)
        {
            continue;
        }
        if (e[1] == 1)
        {
            u8 payload[5] = {kGiveUp, 0, 0, 0, 0};
            memcpy(payload + 1, &slot, 4);
            gInbox.push_back({slot, kStandard, 0, std::vector<u8>(payload, payload + 5)});
        }
        else
        {
            gInbox.push_back({slot, kInputs, gClockSeq[slot]++, std::vector<u8>(e + 2, e + 6)});
        }
    }
    ++gBundles;
}

// Co-op diagnostics for the shell: [bundles in hand, buffer target, ticks that waited].
EMSCRIPTEN_KEEPALIVE const s32* gta2_port_net_clock_state()
{
    static s32 v[3];
    v[0] = gBundles - gRounds;
    v[1] = gBufferTarget;
    v[2] = gWaits;
    return v;
}

// winmain.cpp: a tick's round of input messages begins.
void Gta2Port_NetRoundBegin()
{
    gRoundTaken = 0;
    ++gRounds;
}

// winmain.cpp: bundles in hand that no round has begun on yet.
s32 Gta2Port_NetBuffered()
{
    return gBundles - gRounds;
}

// winmain.cpp: the jitter buffer's target, lowered after kCalmMs without a wait.
s32 Gta2Port_NetBufferTarget()
{
    const double now = gta2_port_now_ms();
    if (gBufferTarget > 1 && now - gLastChange > kCalmMs)
    {
        --gBufferTarget;
        gLastChange = now;
    }
    return gBufferTarget;
}

// winmain.cpp: a tick had to wait for the clock's bundle (not the first ticks of the match).
void Gta2Port_NetWaited()
{
    ++gWaits;
    const double now = gta2_port_now_ms();
    if (gRounds > kSettleRounds && gBufferTarget < kMaxBuffer && now - gLastRaise > 1000)
    {
        ++gBufferTarget;
        gLastRaise = now;
    }
    gLastChange = now;
}

} // extern "C"

NetPlay::NetPlay()
{
    field_8F0_disabled = 1;
}

NetPlay::~NetPlay()
{
}

// The network game start-up (winmain.cpp, after -N) goes through these: they
// succeed when the shell has set up a session.
s32 NetPlay::SetProtoAndConnection_51DAE0(GUID*, Connection_Unknown*)
{
    return gSession ? 1 : 0;
}

s32 NetPlay::InitializeConnection_51E5C0()
{
    return gSession ? 1 : 0;
}

void NetPlay::Disconnect_520D10()
{
    gSession = false;
    field_8F0_disabled = 1;
}

s32 NetPlay::DeletePlayerFromGroup_521000(u32 idx)
{
    if (idx < MAX_PLAYERS)
    {
        field_758_n2.field_10_players[idx].field_0_in_use = 0;
    }
    return 0;
}

void NetPlay::GetPlayerName_521100(wchar_t* Destination, u32 idx)
{
    Destination[0] = 0;
    if (idx < MAX_PLAYERS)
    {
        wcscpy(Destination, gNames[idx]);
    }
}

void NetPlay::SetExitGameCallBack_521330(s32, Game_0x40*)
{
}

s32 NetPlay::GetMaxPlayers_521350()
{
    return gSession ? static_cast<s32>(field_758_n2.field_4_players_count) : 1;
}

// The shell's lobby already has every player connected before the game starts.
bool NetPlay::WaitForPlayersSync_5213E0()
{
    return gSession;
}

// Only used to resend earlier inputs after a packet loss, which a reliable transport does not have.
s32 NetPlay::SendToPlayer_521630(Network_8*, s32, char_type)
{
    return 0;
}

char_type NetPlay::ReceiveGameMessage_521890(Network_8* pOut, s32* pPlayerIdx, u32* packet_subtype)
{
    for (size_t i = 0; gSession && i < gInbox.size();)
    {
        if (gInbox[i].subtype == kInputs && (gRoundTaken & (1u << gInbox[i].from)))
        {
            ++i; // that player's inputs for a later tick: they wait for their round
            continue;
        }
        Message m = std::move(gInbox[i]);
        gInbox.erase(gInbox.begin() + static_cast<std::ptrdiff_t>(i));
        if (m.subtype == kInputs)
        {
            if (m.seq != gExpectedSeq[m.from])
            {
                continue; // a resend of inputs already delivered
            }
            ++gExpectedSeq[m.from];
            gRoundTaken |= 1u << m.from;
        }
        const size_t len = m.payload.size() < sizeof(gDelivered) ? m.payload.size() : sizeof(gDelivered);
        memcpy(gDelivered, m.payload.data(), len);
        pOut->field_0_data = gDelivered;
        pOut->field_4_len = static_cast<s32>(len);
        *pPlayerIdx = m.from;
        *packet_subtype = m.subtype;
        return 1;
    }
    return 0;
}

void NetPlay::SendToAll_521B20(Network_8* pSendData)
{
    if (!gSession)
    {
        return;
    }
    const s32 me = GetPlayerIdx_409C40();
    Send(-1, kInputs, field_758_n2.field_8_packet_game_tick[me], pSendData->field_0_data, pSendData->field_4_len);
    field_758_n2.field_8_packet_game_tick[me] = static_cast<u8>(field_758_n2.field_8_packet_game_tick[me] + 1);
}

s32 NetPlay::SendKeepAlive_521D20()
{
    if (gSession)
    {
        const u8 subtype = kKeepAlive;
        Send(-1, kStandard, 0, &subtype, 1);
    }
    return 0;
}

s32 NetPlay::SendGiveUp_521DB0(s32 player_idx)
{
    if (gSession)
    {
        u8 payload[5] = {kGiveUp, 0, 0, 0, 0};
        memcpy(payload + 1, &player_idx, 4);
        Send(-1, kStandard, 0, payload, 5);
    }
    return 0;
}

static char_type gNoMap[1] = {0};

Network_20324::Network_20324()
{
}

Network_20324::~Network_20324()
{
}

s32 Network_20324::ShowNetworkUiBlocking_519BD0(HINSTANCE)
{
    return gSession ? 1 : 0; // the DirectPlay lobby is replaced by the shell's co-op lobby (web/net.js)
}

// The match rules (set by the shell): free roam and Gang Wars are a points game with no reachable
// limit (Gang Wars is scored by the shell, per crew); free-for-all is the original frag game.
s32 gRuleType = 2;            // POINTS_GAME_2, or FRAG_GAME_1
s32 gRuleLimit = 0x7FFFFFFF;  // frags or points to win
s32 gRuleMinutes = 0;         // time limit, 0: none (the game allows up to 60)

void Network_20324::CopyGameSettings_51C7F0(NetworkGameSettings* pSettings)
{
    memset(pSettings, 0, sizeof(*pSettings));
    pSettings->field_20190_game_speed = 0;
    pSettings->field_20194_frag_limit = gRuleLimit;
    pSettings->field_20198_game_type = gRuleType;
    pSettings->field_201A0_police_on = 1;
    pSettings->field_201A4_game_time_limit = gRuleMinutes;
}

char_type* Network_20324::GetMapName_51CA10()
{
    return gMap[0][0] ? gMap[0] : gNoMap;
}

char_type* Network_20324::GetMapStyName_51CA50()
{
    return gMap[1][0] ? gMap[1] : gNoMap;
}

char_type* Network_20324::GetMapScrName_51CA90()
{
    return gMap[2][0] ? gMap[2] : gNoMap;
}
