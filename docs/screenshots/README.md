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
