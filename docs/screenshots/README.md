# Chaos & Loot — browser captures

Captured from the running game in Chrome at 1280 × 900, low graphics. Event timing and entities were staged on a local server to make each encounter readable; these are actual browser renders, not mockups. Software rendering was used, so the FPS counter in these captures is not a hardware performance benchmark.

| Capture | What it shows |
|---|---|
| [Dashboard](dashboard.jpg) | Visible patch notes entry in the lobby |
| [Event notes](patch-notes-events.jpg) | All seven events and warning times |
| [Loot and LORD notes](patch-notes-loot.jpg) | LORD restrictions, buff expiry, crates, loot, and tsunami fairness |
| [Blackhole](blackhole.jpg) | Active vortex and warning HUD |
| [Dragon](dragon.jpg) | Dragon crossing the fire corridor |
| [Tsunami](tsunami.jpg) | Wave and highlighted hill shelters |
| [UFO](ufo.jpg) | Captured player beneath the ship, headed toward a pit |
| [Neutral airdrop](airdrop.jpg) | Helicopter, grey supply cache, and neutral tank |
| [Claimed airdrop](airdrop-claimed.jpg) | Red team owns the cache/tank; claimant has six Super Bazooka rockets |
| [Chicken invasion](chickens.jpg) | Neutral chickens in the arena |
| [LORD boss](lord.jpg) | Gold armor, turquoise water aura, and melee weapon |
| [LORD player](lord-player.jpg) | Smaller player transformation and LORD weapon HUD |
| [Metal crate](metal.jpg) | Carried metal crate before throwing and splitting |

For normal play and reproducible event previews, see [the event guide](../EVENTS.md#preview-dan-tes). The Node tests cover event mechanics across all three maps and both two- and four-team games. Browser checks also exercised UFO rescue, movement to claim an airdrop, throwing metal into two wooden crates, LORD transformation, desktop/mobile patch notes, Escape/close, and suppression of movement/fire while notes are open.

## Train, MBG, and performance update

Fresh captures from the same browser setup. Train screenshots use a route chosen by the game; event timing is held briefly to show the complete warning and train. MBG shows an existing Laser with seven shots still equipped alongside the new pickup.

| Capture | What it shows |
|---|---|
| [Updated dashboard](dashboard-train-mbg.jpg) | Nine events, including train and MBG |
| [New event notes](patch-notes-train-mbg.jpg) | Instant-death train and weapon delivery rules |
| [Performance notes](patch-notes-performance.jpg) | Loading/rendering improvements in player-facing notes |
| [Train warning](train-warning.jpg) | Curved red route and six-second warning |
| [Train](train.jpg) | Locomotive and wagons on the curved rails |
| [Bansos MBG](mbg.jpg) | Weapon gift in front of the player while the existing weapon remains equipped |

[Measured performance results](../PERFORMANCE.md) include asset transfer and repeated-pickup resource counts.

## MBG logo popup

| Capture | What it shows |
|---|---|
| [Delivery badge](mbg-logo-delivery.jpg) | BGN emblem, BANSOS MBG CAIR!, and the delivered weapon; equipped weapon stays intact |
| [Pickup badge](mbg-logo-received.jpg) | BANSOS DITERIMA! after ordinary keyboard movement and E to collect the gift |
| [Compact badge](mbg-logo-mobile.jpg) | The smaller badge at 844 × 390, with gameplay controls remaining active |

Verified that the PNG is not requested on initial load, loads once during MBG warning, and is reused for both notifications. Notices are filtered to their recipient, dismiss after three seconds, and clear when the round resets.

## Room master event controls

| Capture | What it shows |
|---|---|
| [Master controls](event-settings-master.jpg) | Master disables train while the other eleven event types remain eligible |
| [Guest view](event-settings-guest.jpg) | Matching settings are visible but cannot be edited by a guest |
| [All events off](event-settings-off.jpg) | Global switch disables the event lottery while retaining individual choices |
| [Mobile controls](event-settings-mobile.jpg) | Event selection fits a narrow lobby layout |

Two actual browser clients exercised configuration sync, rejected guest WebSocket requests, Ready/countdown reset, preview skipping, global-off rounds, master handover/disconnect, map persistence, and mobile layout.

## Six large maps for four teams

All six arenas are 72 × 54 tiles with mirrored, irregular outlines. Full-map captures use a fixture overview camera over the actual game scene; regular player-camera captures show the river and cliff detail.

| Capture | What it shows |
|---|---|
| [Map selector](maps-lobby.jpg) | Six geometry previews, all four corner bases, and room master selection |
| [Lembah Benteng](map-lembah.jpg) | Scalloped valley, layered forts, hills and pits |
| [Ngarai Raksasa](map-kawah.jpg) | Deep central canyon and three crossings |
| [Punggung Es](map-salju.jpg) | Snow ridges, icy cover and frozen crevices |
| [Sungai Kembar](map-sungai.jpg) | Wavy river banks, three crossings and a wide central bridge |
| [Kota Reruntuhan](map-reruntuhan.jpg) | Stepped city outline, building blocks and wide streets |
| [Kepulauan Vulkanik](map-vulkan.jpg) | Volcanic channels, central island and four bridge approaches |
| [River player view](map-river-play.jpg) | River depth and bridge deck from the normal gameplay camera |
| [Canyon player view](map-canyon-play.jpg) | Tall cliff faces from the normal gameplay camera |
| [Mobile selector](maps-mobile.jpg) | Two-column map cards on a 390px screen |
| [Map patch notes](patch-notes-maps.jpg) | All six maps, irregular outlines, hazards and four-team balance in dashboard notes |

Browser verification covers master-only selection, both clients receiving the new map, retained event settings, a live tsunami announcement on the river map, mobile layout, and stable graphics resources after repeated map switches. The server suite checks every event across the full rotation; see [map guide](../MAPS.md) and [performance evidence](../PERFORMANCE.md).

## Optimization and team configuration

| Capture | What it shows |
|---|---|
| [Dense instancing fixture](optimization-instancing.jpg) | 120 crates, 30 weapon pickups and 100 ordinary/laser bullets; same-scene calls fall from 524 to 29 |
| [Four teams](team-settings-four.jpg) | Master-only 2 / 3 / 4 team buttons above the six maps |
| [Two teams](team-settings-two.jpg) | Two active bases and team columns after changing the room |
| [Mobile team settings](team-settings-mobile.jpg) | Team count controls and map cards fit a 390px screen |
| [Normal weapon interaction](optimization-gameplay.jpg) | Real movement and E swap equip SMG in a two-team round |
| [Optimization notes](patch-notes-optimization.jpg) | Player-facing network, rendering and resource cleanup notes |

Two actual clients verified guest rejection, reassignment from a closed team, Ready/countdown reset, preserved event choices, and 4→2→3→4 world rebuilding. Controlled browser comparisons verified instance growth without dropped items and stable actor resources after replacement. These draw-call and resource checks do not claim a measured FPS percentage.

## Friendly-fire integration with optimization and team controls

Captured from the combined PR #4 + #5 client. The 3D frame loop is paused for these UI captures; map cards, room controls and patch notes are rendered by the actual client.

| Capture | What it shows |
|---|---|
| [Combined lobby](friendly-fire-compat-lobby.jpg) | Two teams, six maps, and the enabled friendly-fire checkbox near the bottom of the lobby viewport |
| [Combined patch notes](friendly-fire-compat-notes.jpg) | Team/event controls, friendly-fire and grab/throw rules, and optimization notes together |

The browser verifies host team/FF controls and notes without JavaScript errors or failed assets. The 84-test server suite includes grab/throw completion on all six maps for 2, 3 and 4 teams. Two real WebSocket clients additionally verify settings synchronization and authorization, map/team persistence, countdown cancellation, carry/flight flags, throwing and landing damage, E release, and disconnect cleanup.

## Arena 1v1

Actual Chrome captures of the lobby, dedicated 960 × 720 arena and result. A local fixture holds countdown/results and stages fighter positions for readable captures; selection, E swaps, movement, mouse attacks, damage and winner/lobby transitions use the real client and authoritative server. Chrome uses software rendering; these images are not an FPS benchmark.

| Capture | What it shows |
|---|---|
| [Duel setup](duel-lobby.jpg) | Master chooses Alpha and Bravo while the master becomes a spectator; all seven weapon choices are listed |
| [Mobile setup](duel-mobile.jpg) | Fighter selectors and the seven-weapon guide fit a 390px screen |
| [Arena overview](duel-arena.jpg) | Two fighters, equal spawns, symmetric walls/pillars, seven shared racks and spectator HUD |
| [Playing with a spear](duel-fighter.jpg) | Real E pickup, keyboard movement and mouse melee attack; opponent has 92/120 HP and the swing cone is visible |
| [Duel result](duel-result.jpg) | First kill, winner announcement and three-second return countdown, without respawning |
| [Duel patch notes](duel-notes.jpg) | Dashboard rules for selection, weapons, spectators, results and saved normal settings |

The browser flow verifies late spectator joins, rejected spectator actions/abort, every rack/equipped model, normal lobby restoration and master handover. Two full weapon-swap cycles end at **65 GPU geometries / 4 textures** each, with no growth. The focused fighter check verifies real E, D movement, mouse aim/held attack, master cancellation and the updated notes. Both checks finish without JavaScript errors or failed assets. The full Node suite passes **97 tests**, including 13 duel tests.
