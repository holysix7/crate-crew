# Enam arena besar

Room master memilih peta dan jumlah tim (2–4) di lobby. Menutup tim memindahkan pemainnya ke tim tersisa dengan anggota paling sedikit; semua Ready/countdown dibatalkan. Peta, CPU, dan pilihan event disimpan. Keenam kartu menampilkan geometri sebenarnya: empat markas berwarna, tembok, bukit, lubang, kanal, dan jembatan. Mengganti peta membatalkan Ready; pilihan event disimpan.

Setiap peta berukuran **72 × 54 petak**, atau **2880 × 2160 unit**; luas **2,25×** arena sebelumnya (48 × 36). Bentuk arena bukan persegi penuh: teluk, tanjung, dan potongan tebing membentuk batas yang berlekuk. Sungai melebar/menyempit dengan tepi berombak. Bentuk ini dipakai collision, routing bot, ground mesh, preview, dan minimap. Semua tembok, bukit, lubang, kanal, dan jembatan dicerminkan pada sumbu horizontal dan vertikal. Keempat posisi spawn berjarak sama dari pusat. Ruangan dengan 2, 3, atau 4 tim memakai arena yang sama; CPU bisa mengisi tim kosong.

| Peta | Jalur & taktik |
|---|---|
| Lembah Benteng | Benteng berlapis memecah garis tembak. Ambil jalur sayap atau lintasi bukit untuk mengawal peti pulang. |
| Ngarai Raksasa | Jurang utara–selatan sedalam 220 unit. Jembatan tengah lebar untuk rebutan loot; dua jembatan samping untuk serangan sayap. |
| Punggung Es | Bukit hingga 95 unit dan tembok es. Ketinggian memperpanjang jarak tembak sekaligus memberi perlindungan tsunami. Jangan masuk celah beku. |
| Sungai Kembar | Sungai membelah sisi utara dan selatan. Tiga penyeberangan, termasuk jembatan pusat besar. Jembatan terbuka, jadi manfaatkan cover di tepinya. |
| Kota Reruntuhan | Blok bangunan memberi cover pendek dan gang yang muat kendaraan. Jalan tengah dibiarkan terbuka untuk monster, loot, dan rel kereta. |
| Kepulauan Vulkanik | Pulau tengah dibatasi kanal lava terputus. Jembatan empat arah dan rute luar memberi beberapa pendekatan tanpa mengunci markas mana pun. |

**Bahaya medan:** air dalam, lava, jurang, dan lubang mematikan infanteri maupun kendaraan beserta pengemudinya. Jembatan aman. Medan berbahaya tidak menahan tembakan dan tidak menjadi tembok tak terlihat. Dorongan tsunami/blackhole dan hantaman monster dapat menjatuhkan unit. Bot dan kendaraan AI memakai peta rintangan yang memperhitungkan badan kendaraan; semua base terhubung ke pad musuh dan tengah.

**Event:** setiap peta memiliki bukit tsunami, lubang tujuan UFO, ruang tengah untuk boss/loot, dan rute kereta tanpa tabrakan dengan tembok atau kanal. Naga dan tsunami menyesuaikan lintasan dengan ukuran arena. Blackhole, ayam, LORD, airdrop, dan kiriman senjata mencari titik aman. Seluruh 12 pilihan event dan kontrol room master tetap berlaku; lihat [panduan event](EVENTS.md).

## Verifikasi

`node --test` mencakup pencerminan geometri, jarak spawn, akses pad dan markas, koridor muat kendaraan, bukit yang dapat dicapai, kematian karena kanal, keselamatan jembatan, dan rel kereta di setiap peta. Ke-12 event dijalankan sampai selesai pada keenam peta untuk masing-masing 2, 3, dan 4 tim (216 kombinasi); suite event yang sudah ada juga memakai seluruh peta/jumlah tim. Distribusi kayu/metal tsunami dicek simetris dan aman pada seluruh kombinasi peta/tim.

Browser Chrome memeriksa pemilihan master → WebSocket → server → welcome baru → render dunia dan preview pada dua client. Guest tidak dapat mengganti peta; pilihan event bertahan. Screenshot mencakup enam tampilan arena, lobby, mobile, serta sudut permainan di sungai/jurang. Tampilan seluruh arena memakai kamera overview khusus fixture screenshot; kamera permainan tetap mengikuti pemain seperti biasa.

[Galeri screenshot](screenshots/README.md) · [Catatan optimasi](PERFORMANCE.md)
