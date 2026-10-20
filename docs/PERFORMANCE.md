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
