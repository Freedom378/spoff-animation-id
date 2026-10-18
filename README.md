# Spoff Animation / ID

Website statis + Netlify Function untuk mencoba mengakses aset Roblox yang tersedia secara publik.

## Deploy ke Netlify
1. Ekstrak ZIP ini.
2. Upload folder proyek ke repositori GitHub, lalu di Netlify pilih **Add new site → Import an existing project** dan hubungkan repositori; atau gunakan Netlify CLI.
3. Build command boleh dikosongkan; publish directory `.`. `netlify.toml` sudah mengatur publish directory dan folder Functions.
4. Deploy. Tidak memerlukan API key atau environment variable.

## Uji lokal
Butuh Node.js. Dari folder proyek:
```bash
npx netlify-cli dev
```
Buka URL lokal yang ditampilkan Netlify CLI.

## Batasan penting
- Tool hanya mencoba endpoint publik Roblox Asset Delivery. Tidak ada bypass login, cookie, permission, atau proteksi aset.
- Roblox dapat menolak aset audio/animasi tertentu meski ID benar; khusus audio, akses unduh langsung sering dibatasi.
- Tombol download membuka endpoint Roblox asli. Jika Roblox menolak akses di browser, situs ini tidak dapat memaksa file terunduh.
- Untuk aset milik sendiri, gunakan Roblox Studio/Creator Dashboard dan alur ekspor resmi jika tersedia.
