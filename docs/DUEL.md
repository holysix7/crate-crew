# Arena 1v1 — duel selang waktu

1. Masuk lobby seperti biasa. Minimal dua pemain manusia harus terhubung.
2. Room master menyalakan **Arena 1v1**, memilih **Petarung merah** dan **Petarung biru**, lalu menekan **Mulai Duel**. Pemain boleh berasal dari tim biasa yang sama.
3. Semua orang lain menonton, termasuk master jika tidak dipilih dan pemain yang masuk saat duel berlangsung. Penonton melihat seluruh arena; tidak ada unit, respawn, atau serangan milik penonton.
4. Setelah hitung mundur tiga detik, petarung mulai dengan **Pedang, 120 HP**, dan jarak spawn yang sama dari tiap rak senjata.
5. Satu kill menentukan pemenang. Hasil tampil tiga detik lalu otomatis kembali ke lobby. Mode dan pilihan petarung tetap tersedia untuk rematch; matikan Arena 1v1 untuk kembali ke pertandingan biasa.

## Kontrol dan rak senjata

- **WASD / panah:** bergerak. Mouse membidik; tahan klik kiri untuk menyerang berulang.
- **E:** ambil senjata dari rak terdekat dalam jarak 36 unit. Tujuh rak berada di garis tengah dan tidak habis, jadi kedua pemain bisa memakai senjata yang sama.
- **Gamepad:** stik kiri bergerak, stik kanan membidik, RT/RB menyerang, A mengambil senjata.
- **Layar sentuh:** stik kiri bergerak, stik kanan membidik/menyerang, tombol E menukar senjata. Kontrol bertarung disembunyikan untuk penonton.
- Tombol **Akhiri duel** hanya dimiliki master, termasuk master yang menjadi penonton.

Setiap serangan punya persiapan singkat. Arah serangan dikunci saat ayunan dimulai; area ayunan mengikuti posisi penyerang. Lawan dapat menghindar atau berlindung di balik dua pilar simetris. Senjata tidak mengeluarkan peluru, tidak menembus tembok, dan tidak mengenai lawan di belakang. Mengganti senjata tidak menghapus cooldown atau membatalkan ayunan yang sedang berlangsung.

## Tujuh senjata

Jangkauan memakai unit dunia dan ditambah radius badan target. Waktu persiapan adalah jeda sebelum damage; interval adalah jeda minimum antar-serangan. Kecepatan jalan dasar 165 unit/detik dikalikan faktor jalan senjata.

| Senjata | Damage | Jangkauan | Persiapan | Interval | Faktor jalan |
|---|---:|---:|---:|---:|---:|
| Pedang | 24 | 66 | 0.14 dtk | 0.62 dtk | 1.00× |
| Tombak | 28 | 108 | 0.22 dtk | 0.85 dtk | 0.95× |
| Kapak | 39 | 72 | 0.32 dtk | 1.05 dtk | 0.90× |
| Palu | 48 | 60 | 0.42 dtk | 1.30 dtk | 0.85× |
| Belati | 13 | 42 | 0.08 dtk | 0.34 dtk | 1.15× |
| Halberd | 33 | 100 | 0.30 dtk | 1.08 dtk | 0.92× |
| Katana | 21 | 82 | 0.16 dtk | 0.56 dtk | 1.08× |

Pedang seimbang; Tombak menusuk jauh dengan sudut sempit; Kapak menyapu lebar; Palu lambat dengan damage dan dorongan terbesar; Belati pendek tetapi cepat; Halberd menjangkau jauh; Katana menggabungkan gerak cepat dan tebasan terarah.

## Selesai, putus koneksi, dan pengaturan biasa

- Dua menit tanpa kill menghasilkan seri. Dua serangan mematikan di tick yang sama juga seri.
- Petarung terputus saat hitung mundur membatalkan duel. Saat duel berjalan, petarung yang tetap terhubung menang.
- Penonton terputus tidak mengganggu duel. Jika master pergi, kepemimpinan diwariskan seperti biasa; master baru tetap bisa membatalkan.
- Hanya master boleh mengubah mode, memilih pemain, memulai, atau membatalkan. Pilihan petarung/aturan biasa dikunci selama duel; pesan palsu penonton tidak membuat unit atau serangan.
- Arena memakai panggung kecil 960 × 720 dengan dinding dan pilar simetris. Tidak ada HQ, crafting, kendaraan, CPU, event, friendly fire, atau angkat/lempar pemain di dalam duel.
- Peta biasa, jumlah tim, tim asli setiap pemain, CPU, friendly fire, dan pilihan event dipertahankan. Tidak ada senjata melee, input, pickup, atau unit duel yang terbawa ke pertandingan biasa.
- Duel tidak mengubah kill/death pertandingan biasa. Pertandingan biasa berikutnya memakai alur Siap seperti sebelumnya.

## Verifikasi

`node --test` mencakup izin master, pemilihan pemain, penonton/late join, hitung mundur, ketujuh senjata, jangkauan/sudut/LOS, rak bersama dan cooldown, kill/seri/timeout, disconnect, batas arena, rematch, serta pemulihan lobby dan pengaturan pertandingan biasa.

Browser juga memverifikasi pilihan petarung, penonton/late join, ketujuh rak/model, kontrol keyboard/mouse petarung, hasil dan kembali ke lobby, pembatalan master, pergantian master, dan tampilan 390px. Setelah dua siklus penuh menukar senjata, resource tetap **65 geometri GPU / 4 tekstur** pada akhir masing-masing siklus. [Screenshot dan kondisi pengambilan](screenshots/README.md#arena-1v1).
