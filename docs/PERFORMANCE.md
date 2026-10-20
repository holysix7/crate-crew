# Loading and rendering checks

Measured locally in Chrome with low graphics at 1280 × 900. The comparison uses the merged Chaos & Loot client as the baseline. Software rendering was used; these measurements describe transfer size and resource counts, not an FPS benchmark.

## Asset transfer

The previous server sent these assets without compression even when gzip was accepted. The updated server returns gzip to compatible clients and keeps the decoded JavaScript unchanged.

| Asset | Uncompressed bytes | Gzip bytes | Reduction |
|---|---:|---:|---:|
| three.js | 670,681 | 167,540 | 75.0% |
| Client at initial measurement | 105,948 | 33,989 | 67.9% |
| Arena visuals at initial measurement | 18,621 | 5,487 | 70.5% |

Client/arena sizes can change with subsequent edits. The vendored three.js payload is unchanged. Conditional requests using the returned ETag were verified to return **304 with no body**; file edits invalidate the representation cache. The server caches the read/compression promise so simultaneous requests share that work. Compression runs asynchronously.

To inspect a live server:

```bash
curl -s -o /dev/null -w '%{size_download}\n' http://localhost:8087/vendor/three.module.min.js
curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}\n' http://localhost:8087/vendor/three.module.min.js
curl -I -H 'Accept-Encoding: gzip' http://localhost:8087/vendor/three.module.min.js
# Repeat the request with If-None-Match using that ETag to check 304.
```

## Repeated pickup spawns

A controlled browser fixture spawned 30 visible SMG pickups, removed them, and spawned another 30. Counts came from the live three.js objects and `renderer.info.memory.geometries`.

| Measurement | Before | After |
|---|---:|---:|
| Unique geometry objects for 30 pickups | 60 | 2 |
| Unique material objects for 30 identical pickups | 90 | 3 |
| Registered GPU geometries after first batch | 112 | 56 |
| Registered GPU geometries after replacement batch | 174 | 56 |

Pickup meshes now share map-owned geometry and per-weapon materials. Gun, visor, and antenna geometry are also reused. Map teardown disposes shared and live resources once, including instanced buffers. Map switching was exercised in Chrome without console errors.

Other bounded changes: module preload for three.js, water-normal updates capped at 15 Hz, lobby/notes rendering capped at 30 FPS, and skipped rendering with released movement/fire input while the document is hidden. The server still simulates at 30 ticks per second. No resolution reduction or new runtime dependency was introduced.

## Six larger arenas

The bounding area grows from 1920 × 1440 to 2880 × 2160 (**2.25×**), including irregular playable outlines and terrain channels. These changes keep geometry, texture size, and repeated server work bounded:

| Resource | Straight enlargement using the old approach | New arenas |
|---|---:|---:|
| Terrain vertices | 24,616 (16-unit grid) | 11,011 (24-unit grid), equal to the old small arena |
| Ground texture | 2880 × 2160 (6,220,800 pixels) | 2048 × 1536 (3,145,728 pixels) |
| Wall draw calls, if all visible | One per wall rectangle | One merged wall mesh |
| BFS scratch allocation per search | Two Int32 arrays: 31,104 bytes on the larger grid | No new scratch arrays; 46,656 bytes retained per game |

The pixel cap uses **49.4% fewer ground texture pixels** than a direct enlargement; screen resolution and player camera remain unchanged. Static bridge planks, channel surfaces, foam/heat marks, and cliff faces are also merged by material. World-space wall UVs are preserved.

Map geometry/catalog are built once. Navigation grids are cached per map/team count and copied into each game so mutable searches/tests cannot corrupt the cached grid. Map metadata is retained instead of recreated in event/loot loops. BFS uses visitation generations, with an explicit rollover reset; returned paths remain independent. The full six-map catalog is sent only in welcome/map-change metadata, never in 30 Hz snapshots.

These are resource and allocation measurements, not an FPS claim. The browser runs with software rendering; complete-map screenshots use a fixture overview camera to make the four-team geometry reviewable.

Chrome confirmed **11,011 terrain vertices** and a **2048 × 1536 ground texture** on each of the six maps. Two consecutive cycles switching away from and back to Sungai Kembar ended at exactly **36 registered GPU geometries and 5 textures** in the same lobby view (28 draw calls each), with no resource growth, browser errors, or failed assets. Previews are drawn from geometry; the six maps require no separate map-image downloads.

A same-scene Chrome comparison on Lembah Benteng temporarily rebuilt the **76 wall rectangles** as separate meshes, using the same material, geometry and overview camera. Total draw calls were **181 with separate walls versus 106 with the merged mesh**: exactly **75 fewer calls** (76 wall calls → 1). After the temporary comparison meshes were disposed, registered geometry returned to **65 → 65**. This comparison changes only wall batching; it does not compare different maps or player counts.
