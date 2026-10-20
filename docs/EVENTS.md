# Event, boss, dan loot

Event pertama normalnya terjadi 40–55 detik setelah ronde dimulai, lalu undian berikutnya setiap 45–75 detik. Bencana aktif menunda undian berikutnya. Countdown, area bahaya, dan arah gerak tampil di arena/minimap; pemain baru langsung menerima kondisi terkini. LORD yang sudah dipanggil dan loot airdrop tetap ada setelah pengumuman kedatangannya selesai.

| Event / nama preview | Warning | Yang harus dilakukan |
|---|---:|---|
| Blackhole / `blackhole` | 4 dtk | Keluar dari lingkaran ungu sebelum tarikan aktif. |
| Naga / `dragon` | 5 dtk | Keluar dari koridor oranye, lalu ikuti setelah api padam untuk mencari peti. |
| Tsunami / `tsunami` | 7 dtk | Naik bagian dalam bukit hijau; peti hanyut kembali secara simetris di tengah. |
| UFO / `ufo` | 5 dtk | Target keluar dari sorotan; rekan menembak UFO untuk menyelamatkan korban. |
| Helikopter / `airdrop` | 5 dtk | Berlomba menyentuh peti/tank abu-abu setelah mendarat. |
| Invasi ayam / `chickens` | 4 dtk | Kejar ayam pencuri peti, atau tembak untuk merebut loot. |
| LORD / `lord` | 6 dtk | Kalahkan boss melee untuk memperoleh wujud LORD sampai mati. |
| Kereta Ngepot / `train` | 6 dtk | Menjauh dari seluruh rel melengkung; lokomotif dan gerbong menyebabkan kematian instan. |
| Bansos MBG / `mbg` | 4 dtk | Satu pickup senjata acak di depan setiap pemain/bot; ambil atau tukar dengan E. |

Hujan meteor, kiriman peti, dan monster mengamuk juga tetap ada dalam rotasi. Semua aturan, klaim loot, damage, dan jam event dihitung server.

## Pengaturan room master

Di lobby, panel **Event acak** menyediakan sakelar utama dan pilihan untuk masing-masing 12 event: Meteor, Kiriman Peti, Monster Mengamuk, Blackhole, Naga, Tsunami, UFO, Helikopter, Ayam, LORD, Kereta Ngepot, dan Bansos MBG. Buka **Pilih event yang boleh muncul** untuk daftar lengkap.

Hanya room master yang bisa mengubahnya, dan server menolak permintaan pemain lain. Semua pemain melihat pilihan yang sama. Perubahan membatalkan countdown serta status Siap semua pemain agar aturan baru disetujui sebelum mulai. Pengaturan tidak bisa diubah selama pertandingan.

Sakelar utama mematikan semua undian event tanpa menghapus pilihan per event; nyalakan lagi untuk memakai pilihan yang sama. Menonaktifkan seluruh pilihan juga menghasilkan pertandingan tanpa event acak. Peti rutin dan monster penjaga tetap bagian dari permainan biasa.

Pilihan bertahan saat ganti peta, ronde baru, master diserahkan, atau master keluar. Server baru mulai dengan semua event aktif. Event yang dimatikan tidak bisa dipilih undian maupun dipaksa lewat preview host; `EVENT_PREVIEW=train,mbg` melewati train bila train dimatikan. Bila semua preview dimatikan, permainan memakai interval normal untuk event yang masih aktif.

## Kereta Ngepot

Setelah peringatan 6 detik, lokomotif dan dua gerbong melintasi arena selama 9 detik. Rel merah memperlihatkan seluruh jalur melengkung sebelum kereta datang; jalur yang sama dipakai untuk visual, minimap, dan tabrakan di server. Bot mencoba menyingkir dari rel.

Tabrakan lokomotif **atau gerbong** langsung membunuh unit di tanah dari tim mana pun. HP besar, buff LORD, dan perisai spawn tidak menahan tabrakan. Kendaraan yang tertabrak hancur bersama pengemudinya. Pemeriksaan lintasan antar-tick mencegah kereta cepat menembus pemain. Korban respawn memakai aturan biasa.

Kereta tidak merusak HQ atau peti di pad. UFO dan korban yang sedang diangkat berada di udara sehingga tidak tertabrak; tank airdrop yang masih netral tetap terlindungi. Boss LORD yang tertabrak tidak memberi buff karena tidak ada pemain yang membunuhnya.

## Bansos MBG

Setelah peringatan 4 detik, setiap pemain dan bot dari tim yang masih hidup mendapat satu **pickup senjata acak di depannya**. Pool: SMG, Shotgun, Bazooka, Sniper, Pelontar api, Pelontar granat, Minigun, dan Laser, dengan amunisi penuh. Tidak termasuk Super Bazooka eksklusif helikopter atau senjata LORD.

Senjata yang sedang dipakai **tidak diganti otomatis**, termasuk bila hasil undian sama. Pengguna pistol bisa mengambil pickup dengan mendekat; tekan E untuk menukar senjata yang masih berisi. Pickup muncul sekitar 52 unit di depan, bergeser ke tempat aman bila ada tembok/lubang, dan bertahan 45 detik sejak dibagikan. Siapa pun boleh mengambilnya.

Pengemudi mendapat satu kiriman di depan kendaraan, bukan dua kiriman untuk kendaraan dan badan. Pemain yang menunggu respawn mendapat kiriman di dekat spawn timnya. Pemain LORD juga mendapat pickup di tanah, tetapi tetap tidak bisa mengambilnya selama buff aktif. Penanda hijau dan pengumuman berlangsung 7 detik; loot yang belum diambil tetap tinggal setelah event selesai.

Penerima kiriman melihat popup logo BGN **BANSOS MBG CAIR!** beserta nama senjata. Saat pickup MBG diambil (termasuk oleh pemain lain), pengambil melihat **BANSOS DITERIMA!** selama 3 detik. Popup tidak menghalangi kontrol dan hilang saat ronde berakhir atau koneksi putus. Logo disimpan lokal dan baru dimuat saat warning MBG, sehingga tidak menambah unduhan awal.

## UFO penculik

Sorotan mengunci posisi satu pemain yang sedang berjalan kaki. Jika tidak ada pemain yang cocok, UFO dapat memilih bot. LORD tidak dapat diculik.

- Setelah warning, sorotan aktif 2,5 detik. Keluar dari radius sorotan untuk menggagalkan penculikan; UFO tidak beralih ke pemain lain.
- Korban yang tertangkap tidak bisa bergerak, menembak, atau membawa peti. Peti yang sedang dibawa tertinggal di tanah.
- UFO membawa korban menuju lubang selama 7 detik, lalu menjatuhkannya. Kematian dan respawn memakai aturan biasa.
- UFO punya 320 HP. Tembak piring terbangnya untuk membebaskan korban. Korban dilepas di tanah aman dengan perisai singkat; UFO yang hancur menjatuhkan Laser.

## Helikopter dan perebutan airdrop

Helikopter membawa paket netral ke zona tengah yang dipilih dengan mempertimbangkan jarak ke semua markas. Ada peti logam besar dan satu tank **abu-abu**.

- Tunggu paket selesai mendarat. Menyentuh peti **atau** tank mengklaim keduanya sekaligus untuk tim pertama yang sampai.
- Penemu mendapat **Super Bazooka**: 6 roket, 125 damage dasar, radius ledakan 105. Tank berubah menjadi warna tim dan dapat dikendarai dengan E.
- Bot dan pengemudi kendaraan juga dapat mengklaim. LORD tidak dapat mengambil paket ini.
- Paket yang sudah diklaim tidak bisa direbut ulang. Tank yang sudah dimiliki tetap ada ketika penanda peti menghilang.
- Paket yang dibiarkan 75 detik akan hilang bersama tank netralnya. Tank netral tidak dapat dirusak sebelum diklaim.
- Tank hadiah tetap dihitung dalam jumlah kendaraan tim; hadiah tidak ditolak bila batas rakitan biasa sudah penuh.

## Invasi ayam

Sepuluh ayam netral menyerbu selama 25 detik. Mereka mengambil peti lepas, lalu berlari membawa hasil curian. Ayam juga mengejar dan mematuk pemain, terutama pembawa peti.

Ayam memiliki 45 HP dan patukan 8 damage. Ayam yang dibunuh melepaskan peti curiannya; ayam tanpa peti menjatuhkan satu peti kayu. Ketika invasi berakhir, ayam pergi dan peti yang dibawanya tertinggal. Mereka tidak mengambil peti dari pad atau paket helikopter.

## LORD

Boss netral dengan zirah emas, tubuh besar, aura air biru, dan senjata melee. Ia menyerang unit di dekatnya dari tim mana pun dan tetap berkeliaran sampai dikalahkan. Hanya satu boss atau pemilik buff LORD yang dapat ada pada satu waktu.

| Stat | Boss | Pemain yang mengalahkannya |
|---|---:|---:|
| HP | 2200 | 420 |
| Damage melee | 52 | 32 |
| Jangkauan | 90 | 68 |
| Jeda tebas | 1 detik | 0,7 detik |

Wujud pemain lebih kecil dan lebih lemah daripada boss. Arahkan bidikan lalu klik/tahan tombol tembak untuk menebas. Wujud ini tidak bisa mengangkat peti, merakit, mengambil senjata/airdrop, atau naik kendaraan. Pengemudi yang mengalahkan boss keluar dari kendaraan dan berubah di tempat.

Boss LORD tidak merusak HQ. LORD pemain bisa menebas HQ musuh dengan 16 damage per serangan.

**Buff hilang saat pemilik mati dan tidak berpindah ke pembunuhnya.** Pemain respawn sebagai Buddy biasa. Buff baru hanya diperoleh dari mengalahkan boss LORD yang muncul lagi. Jika boss mati karena lingkungan atau unit netral, tidak ada pemain yang mendapat buff.

## Peti dan loot monster

Jumlah awal peti naik menjadi 10. Peti baru jatuh setiap 1–1,6 detik sampai batas peti lepas tercapai (26 untuk 2 tim, 34 untuk 4 tim). Sekitar 22% peti jatuh biasa berupa **peti metal**.

Peti metal berwarna perak dengan palang gelap. Angkat dengan E, lalu lempar dengan F/klik kanan/tombol lempar gamepad. Peti metal yang dilempar pecah menjadi **dua peti kayu** saat menyentuh tanah, dinding, atau unit. Peti jatuh biasa atau yang sekadar ditaruh dengan E tetap utuh. Peti metal tidak bisa ditaruh di pad sebelum dipecahkan. Bot juga melempar peti metal di dekat markas untuk memecahkannya.

Monster tengah menjatuhkan **8 peti, termasuk 2 metal**, ditambah pickup **Bazooka, Minigun, dan Laser**. Senjata loot bertahan 50 detik. Pemain dengan pistol otomatis mengambil senjata di dekatnya; tekan E dekat pickup untuk menukar senjata yang masih berisi peluru. Amunisi senjata lama tetap dipertahankan saat dijatuhkan.

## Tsunami yang lebih adil

Gelombang berasal dari salah satu sisi peta. Tanah dengan ketinggian minimal 18 melindungi unit; lingkaran hijau menunjukkan bagian dalam bukit yang aman. Tepi bukit yang rendah belum melindungi. Unit di tanah rendah menerima 18 damage sekali per gelombang dan terdorong selama berada di muka gelombang. Kendaraan lebih sulit didorong. Hati-hati lubang.

Peti lepas yang terkena arus ikut terbawa dan tidak bisa diambil selama gelombang. Setelah air surut, peti tersebut kembali ke titik aman **dalam kelompok simetris empat arah di area tengah**, ditambah minimal delapan peti kayu bonus. Wood dan metal dibagi seimbang; jumlah dibulatkan ke kelompok empat untuk menyamakan nilai loot tiap sisi. Tidak ada tumpukan hadiah khusus di sisi hilir dekat satu markas. Pickup senjata tetap di tempat agar senjata langka tidak terkumpul di satu sisi. Peti di pad dan yang dibawa pemain tetap aman.

## Blackhole dan Naga

Blackhole aktif 11 detik dalam radius 250. Menarik unit, peti lepas, pickup, dan melengkungkan peluru tanpa menambah kelajuannya. Inti memberi 12 damage per detik. Kendaraan terkena 45% tarikan infanteri; LORD 65%, monster 12%. Saat tutup, unit dan peti terlontar keluar, serta muncul empat peti bonus.

Naga melintas selama 12 detik, meninggalkan api di koridor selebar 180. Jejak api bertahan 2,2 detik dan memberi 24 damage per detik. Empat peti hadiah dijatuhkan bertahap di belakang api yang sudah padam. Naga merupakan event terbang, bukan boss yang dapat dibunuh.

Ketiga bencana tidak memberi damage langsung ke HQ dan tidak mengubah peti di pad. Bot mencoba menghindari bahaya. Perisai spawn tetap berlaku. Ronde/peta baru membersihkan event, boss, buff, dan paket yang tersisa.

## Preview dan tes

```bash
# Satu event, mulai 8 detik setelah ronde dimulai
EVENT_PREVIEW=lord PORT=8087 node server.js

# Beberapa event berurutan dengan jeda singkat, lalu kembali ke undian normal
EVENT_PREVIEW=train,mbg,ufo,airdrop,chickens,lord PORT=8087 node server.js

# Semua tes memakai Node bawaan, tanpa npm install
node --test
```

Masuk lobby dan tekan Siap seperti biasa. Tanpa `EVENT_PREVIEW`, server memakai undian normal. Preview hanya dipilih oleh host melalui environment; tidak ada pesan WebSocket pemain untuk memaksa event. Perintah preview berlaku lagi pada ronde berikutnya.
