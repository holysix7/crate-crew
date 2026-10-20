# Crate Crew — fan-remake web Team Buddies (LAN)

Game web multiplayer lokal yang meniru *loop* inti **Team Buddies** (PS1, 2000):
peti jatuh dari langit → angkat & bawa ke pad markas → susun → rakit senjata / pasukan / turret → hancurkan markas musuh.

Semua aset (grafis & suara) dibuat sendiri (digambar lewat kode & disintesis), **tanpa file dari disk asli**, jadi proyek ini aman disimpan di GitHub dan dibagikan ke teman.

## Cara menjalankan

Butuh **Node.js 18+** (`brew install node` atau dari nodejs.org). Tidak ada `npm install`; satu-satunya library (three.js, MIT) sudah disertakan di `public/vendor/`, jadi tetap jalan tanpa internet. Browser harus mendukung WebGL.

```bash
cd team-buddies
node server.js            # 2 tim
TEAMS=4 node server.js    # 4 tim (Merah, Biru, Hijau, Kuning)
PORT=3000 node server.js  # ganti port
```

Terminal akan menampilkan alamat:

```
Di komputer ini :  http://localhost:8080
Teman di LAN    :  http://192.168.1.23:8080   ← bagikan ini ke teman
```

Teman cukup buka alamat LAN itu di browser (laptop/PC, satu Wi-Fi/router yang sama).
Di macOS, saat pertama kali jalan akan muncul dialog firewall *"Allow incoming connections for node?"* → pilih **Allow**.

## Kontrol

| Tombol | Aksi |
|---|---|
| WASD / panah | gerak |
| Mouse | bidik |
| Klik kiri (tahan) | tembak |
| E | angkat peti / taruh di pad / curi dari pad musuh / naik & turun kendaraan |
| F / klik kanan | lempar peti (bisa mengenai musuh: *BONK!*) |
| Q | rakit di pad sendiri |
| R | buku resep pola susunan |
| Enter / Shift+Enter | chat semua / chat tim (Tab di kolom chat = ganti, Esc = batal) |
| Tab | papan skor |
| M | suara on/off |
| G | ganti kualitas grafis (Rendah → Sedang → Tinggi) |
| 1–6 | perintah rakit: otomatis · senjata · Buddy · Turret · Tank · Jeep |
| Z / X | pasukan: ikuti aku · bertahan di markas |
| C, V, B, N | serang markas (4 tim: C = terdekat, V/B/N = tim tertentu; 2 tim: C = serang musuh) |

**Kendaraan (8 peti)**: selain Turret, 8 peti bisa dirakit jadi **Tank** (650 HP, lambat, meriam dengan ledakan) atau **Jeep** (280 HP, cepat, senapan mesin, menabrak infanteri musuh). Maks 2 kendaraan per tim. Tanpa pengemudi, kendaraan dikemudikan AI dan mengikuti perintah pasukan. Dekati kendaraan timmu dan tekan **E** untuk naik (WASD menyetir, mouse membidik meriam/senapan), **E** lagi untuk turun. Bila kendaraan hancur, pengemudi terlempar keluar dengan sisa 40 HP. Mode rakit *Otomatis* memilih Turret/Tank/Jeep secara acak saat ada 8 peti.

**Peta** (dipilih di ruang tunggu; semua peta simetris 4 arah supaya adil):

| Peta | Tema | Ciri |
|---|---|---|
| Lembah Hijau | rumput | peta klasik + 8 bukit, 4 lubang |
| Kawah Meteor | gurun | tembok sedikit, 8 lubang besar, 8 bukit |
| Perbukitan Salju | salju | 12 bukit, 4 lubang, sangat terbuka |

* **Bukit**: bisa didaki (gerak 22% lebih lambat), tapi dari atas bukit peluru terbang sampai 30% lebih jauh.
* **Lubang**: masuk = tewas (unit, kendaraan beserta pengemudinya, dan peti yang dilempar ke dalamnya). Bot menghindarinya; terpental hantaman monster bisa menjatuhkanmu ke lubang.
* **Monster penjaga** ada di setiap peta, berkeliaran di zona jatuh peti dan menyerang unit tim mana pun yang masuk zona: hantaman tanah (area, memantulkan) dan lemparan batu. Ada ancang-ancang sebelum menyerang, jadi bisa dihindari. HP 1500; bila dikalahkan menjatuhkan 4 peti dan muncul lagi 45 detik kemudian.
* **Event acak** tiap 45–75 detik, diumumkan di tengah layar: **Hujan meteor** (7–10 meteor, sebagian mengincar unit, lingkaran merah = peringatan; meteor juga merusak markas), **Kiriman peti** (10 peti jatuh di seluruh peta), **Monster mengamuk** (15 detik lebih cepat & kuat).
* HP markas 3200 (turun 20% dari 4000).

**Ruang tunggu**: setelah memasukkan nama, semua pemain masuk ruang tunggu (klik kolom tim untuk pindah tim). Ronde baru dimulai (hitung mundur 3 detik) saat **semua** pemain menekan **SIAP**; batal siap menghentikan hitung mundur. Setiap tim mulai **tanpa Buddy** — hanya pemainnya. Opsi *Isi tim kosong dengan CPU* (bawaan aktif): tim tanpa pemain mendapat 1 komandan CPU yang mengumpulkan peti & merakit, dan muncul lagi bila tewas; bila dimatikan, tim kosong langsung gugur (butuh pemain di minimal 2 tim). Selesai ronde, semua kembali ke ruang tunggu.

**Room master** 👑: pemain pertama yang masuk. Hanya room master yang memilih peta dan mengatur opsi CPU; di ruang tunggu ia melihat tombol ✕ (keluarkan pemain) dan 👑 (serahkan master) di samping nama pemain lain. Bisa juga lewat chat: `/kick nama`, `/master nama` (nama boleh awalan saja). Bila room master keluar, jabatan pindah ke pemain yang paling lama di ruangan.

**Chat** ala Dota: tekan **Enter** untuk chat ke semua, **Shift+Enter** untuk chat tim (Tab di kolom chat = ganti Semua/Tim, Esc = batal). Pesan muncul di kiri bawah lalu memudar; jalan di ruang tunggu dan saat main. Maks 5 pesan per 5 detik.

**Resep pola susunan (pad 2×2, maks 2 tingkat = 8 peti)** — tekan **R** di game untuk buku resep. Saat menaruh peti (**E**), peti masuk ke petak yang **dibidik** (bayangan peti transparan menunjukkan tempatnya); petak yang sudah terisi ditumpuk jadi tingkat 2. Lalu **Q** untuk merakit:

| Pola | Hasil |
|---|---|
| 1 peti | senjata acak (SMG / Shotgun / Bazooka) |
| 2 peti berjajar kiri–kanan | **Sniper** (60 dmg, jarak jauh, 8 peluru) |
| 2 peti atas–bawah | **Pelontar api** (jarak dekat, sangat deras) |
| 2 peti diagonal | **Pelontar granat** (ledakan area) |
| 1 peti ditumpuk 1 (menara) | **Laser** (menembus beberapa musuh) |
| 3 peti bentuk L | **Minigun** (200 peluru) |
| 4 peti rata | **Buddy** (bot) baru |
| 4 rata + 1 di atas | **Buddy Elit** (HP 160, helm emas, senjata khusus) |
| 8 peti (2 tingkat penuh) | Turret, Tank, atau Jeep |

Susunan yang tidak cocok resep: ≥4 peti → Buddy, selain itu → senjata acak dari 1 peti teratas. Perintah *Senjata* tetap memakai pola bila cocok; perintah Buddy/Turret/Tank/Jeep mengabaikan pola. Bot mengisi petak berurutan (berjajar → L → rata), jadi kadang ikut merakit Sniper/Minigun.

**HP / tablet** (layar sentuh, terdeteksi otomatis): stik kiri = gerak, stik kanan = bidik (didorong jauh = menembak; tanpa stik kanan pemain menghadap arah jalan). Tombol **E / F / Q** di kanan, menu atas: Perintah, Resep, Skor, Chat, layar penuh. Main dalam posisi *landscape*.

**Gamepad** (Gamepad API, USB/Bluetooth, juga ke HP): stik kiri gerak, stik kanan bidik, RT/RB tembak, A angkat/taruh, B lempar, X rakit, Y buku resep, Back (tahan) skor, D-pad kiri/kanan ganti rakitan, D-pad atas/bawah ganti perintah pasukan, Start = siap di ruang tunggu.

**Perintah tim** (panel di kiri layar, bisa diklik atau pakai tombol angka; berlaku untuk satu tim, siapa pun di tim boleh mengubah):
* *Rakit di pad*: **Otomatis** = perilaku lama (bot merakit Buddy begitu ada 4 peti). **Senjata / Buddy / Turret** = bot menunggu sampai jumlah peti cukup lalu merakit itu saja; tombol **Q** juga mengikuti perintah ini. Bila batas Turret (3) atau unit (8) sudah penuh, otomatis kembali ke mode Otomatis.
* *Pasukan* (bot pengawal; bot pengumpul tetap mengumpulkan peti): **Ikuti aku** · **Bertahan** (jaga di depan markas, hanya mengejar musuh yang dekat markas) · **Serang** markas tertentu atau yang terdekat.

**Grafis**: pilih di lobby atau tekan **G**. *Rendah* (bawaan) merender 75% resolusi tanpa bayangan asli (diganti bayangan bulat) dan partikel lebih sedikit; *Sedang* = resolusi penuh + bayangan 1024; *Tinggi* = resolusi Retina + bayangan halus 2048 + antialias (antialias aktif setelah muat ulang). Angka FPS tampil di pojok kanan bawah.
Tim tanpa pemain manusia dimainkan komandan CPU (mengumpulkan peti, merakit, menyerang), jadi bisa main sendiri juga.

---

## Konsep & arsitektur

```
 Browser (tiap pemain)                         Komputer host (Mac kamu)
 ┌───────────────────────────┐   WebSocket    ┌──────────────────────────────┐
 │ client.js                 │  input 30Hz →  │ server.js  (HTTP + WS mini)  │
 │  • kirim input (WASD,aim) │                │ server/game.js               │
 │  • interpolasi snapshot   │ ← snapshot 30Hz│  • simulasi authoritative    │
 │  • render 3D (WebGL)      │                │  • fisika peti, peluru, AI   │
 │  • HUD, minimap, suara    │                │  • aturan pad, markas, ronde │
 └───────────────────────────┘                └──────────────────────────────┘
```

* **Server authoritative**: semua aturan di `server/game.js`; client hanya menggambar → tidak bisa curang dari browser, dan sinkron untuk semua pemain.
* **Interpolasi 75 ms** di client supaya gerakan halus walau snapshot 30 Hz.
* **Tampilan 3D (three.js)**: kamera perspektif miring 56° mengikuti pemain, cahaya matahari + bayangan, partikel & ledakan 3D. Semua tekstur (peti kayu, tembok batu, bata markas, rumput, pasir, pad) **digambar lewat kode** di canvas, bukan dari file. HUD, nama, dan bar HP digambar di kanvas 2D terpisah di atasnya. Dunia server tetap 2D (x, y) + tinggi z; client memetakannya ke 3D.
* **Peta simetris**: rintangan didefinisikan untuk satu kuadran lalu dicerminkan → adil untuk 2 atau 4 tim.
* **AI bot**: peran *gather* (kumpulkan peti → rakit), *escort* (ikuti pemain), dan serang markas; pathfinding BFS di grid 48×36.

| File | Isi |
|---|---|
| `server.js` | HTTP statis + WebSocket minimal (RFC 6455) + loop 30 Hz |
| `server/game.js` | seluruh logika game |
| `public/index.html`, `style.css` | lobby |
| `public/client.js` | render 3D, tekstur prosedural, input, interpolasi, HUD, suara |
| `public/vendor/three.module.min.js` | three.js r160 (MIT, lisensi di `LICENSE-three.txt`) |

---

## Soal "reverse engineering" & file `team-buddies.bin`

Versi ini **tidak membutuhkan** `.bin`. Ini *clean-room remake*: aturan main ditiru dari pengalaman bermain, bukan disalin dari kode/aset asli.

`.bin` (disk milikmu sendiri) berguna untuk fase berikutnya, dan sebaiknya diproses **di komputermu saja**:

1. **Ekstrak file system disk** — `.bin` PS1 = sektor raw 2352 byte (Mode 2), di dalamnya ISO9660. Tools: `bchunk`/`7z`, atau skrip kecil yang membaca user-data per sektor.
2. **Identifikasi format** — `.TIM` (tekstur PS1, mudah dikonversi ke PNG), `.VAG`/`.VH`/`.VB` (audio ADPCM), `.STR` (video FMV), plus format model/level milik game (perlu analisis hex).
3. **Ukur angka gameplay** — jalankan game di emulator ber-debugger (DuckStation / PCSX-Redux), cari nilai HP, damage, kecepatan, resep crate di memori → masukkan ke tabel `WEAPONS` & konstanta di `server/game.js` supaya rasanya makin mirip.
4. **Mode "pakai aset asli" opsional** — engine tetap open, aset dimuat dari disk milik pemain saat runtime (pola seperti OpenRA / OpenRCT2). **Jangan commit/bagikan aset hasil ekstraksi**; itu hak cipta Sony/Psygnosis.

### Alur reverse engineering dengan REA + tool `tools/psx/`

[REA](https://github.com/morluto/rea) (MIT) = MCP/CLI reverse engineering yang memakai Ghidra di belakangnya. Agent (Claude) bisa bertanya ke REA: "fungsi mana yang mengatur resep peti?", lalu mendapat hasil decompile + bukti alamatnya.

**1. Ekstrak disk & bungkus executable (tanpa dependensi, Python 3):**

```bash
mkdir -p re && cd re          # folder re/ sudah di-.gitignore
python3 ../tools/psx/psx_extract.py "../Team Buddies (Track 1).bin" disc   # isi disk + SYSTEM.CNF
python3 ../tools/psx/psxexe2elf.py disc/SLUS_008.69 team-buddies.elf        # BOOT= di SYSTEM.CNF
python3 ../tools/psx/tim2png.py disc/*.BIN disc/BUDDIES.DAT --scan --out tex  # ±1400 tekstur, ±25 dtk
```

Hasil pada disk versi US (`SLUS_008.69`, volume `TEAMBUDDIES`):

| File | Isi / dugaan |
|---|---|
| `SLUS_008.69` | executable utama (150 KB), entry `0x8001ab14`, text `0x80014dec` |
| `GAME.BIN`, `ENG.BIN`, `MNU.BIN`, `MPLR.BIN`, `ROT.BIN`, `TUTO.BIN`, `SYS.BIN` | kemungkinan **overlay kode** yang dimuat saat runtime (daftar di `OVERLAY.DAT`) — logika gameplay seperti resep peti kemungkinan besar ada di `GAME.BIN`, **bukan** di exe utama |
| `BUDDIES.DAT` | arsip data 80 MB; semua tekstur TIM ditemukan di sini (termasuk layar loading 640×480) |
| `*.XA`, `MOVIE/*.STR` | audio XA & video FMV (Form 2) |
| `3MIN.PCM` | menunjuk ke **Track 2** (audio CD-DA), dilewati oleh extractor; Track 2 adalah PCM 44,1 kHz stereo mentah |

Untuk menganalisis overlay di Ghidra/REA perlu alamat muatnya; cari di exe utama fungsi yang membaca `OVERLAY.DAT`/`*.BIN` lalu catat alamat tujuan bacaannya (atau lihat di debugger DuckStation saat overlay dimuat).

`psxexe2elf.py` membuat ELF32 MIPS LE `ET_EXEC` dengan `EF_MIPS_ARCH_32` tanpa deklarasi ABI → masuk lane *recordless legacy* REA (Ghidra `MIPS:LE:32:default`), plus simbol `_start` & `_gp`.
Batasan: CPU PS1 adalah R3000A (MIPS I) + GTE; instruksi GTE (COP2) tidak didekode dengan nama aslinya.

**2. Pasang REA di Mac (Terminal biasa, butuh Node ≥ 22.19):**

```bash
npx rea-agents@latest setup     # pilih Claude Desktop / Claude Code, simpan path Ghidra
rea doctor --json               # cek kesiapan
```

Ghidra 12.1.x + JDK 21 diperlukan untuk analisis native (`brew install --cask temurin@21`, unduh Ghidra dari GitHub NSA). Di Apple Silicon, ikuti bagian *macOS arm64 native decompiler* di `docs/installation.md` REA untuk build decompiler.

**3. Tanya lewat agent**, contoh: *"Pakai REA, analisis re/team-buddies.elf. Cari fungsi yang menghitung jumlah peti di pad dan apa yang di-spawn untuk 1/4/8 peti."* Angka yang ditemukan dimasukkan ke `server/game.js`.

## Roadmap ide

- [x] Kendaraan (tank/jeep) dari 8 peti — sekarang dipilih lewat perintah rakit
- [x] Resep berdasarkan pola susunan peti (seperti game aslinya), bukan hanya perintah
- [x] Lebih banyak senjata (Sniper, Pelontar api, Pelontar granat, Minigun, Laser) & Buddy Elit
- [x] Room master (pilih peta, CPU, keluarkan pemain) & chat semua/tim
- [x] Beberapa peta (bukit, lubang, monster penjaga, event acak)
- [ ] Editor peta sederhana
- [x] Kontrol gamepad (Gamepad API) & sentuh untuk HP
- [ ] Mode Capture-the-crate / Deathmatch
- [x] Ekstraktor `.TIM → PNG` untuk riset referensi (lokal saja) — `tools/psx/tim2png.py`
- [ ] Tentukan alamat muat overlay (`GAME.BIN` dll.) agar bisa dianalisis REA/Ghidra
