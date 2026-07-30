# Panduan Deployment 100% Gratis — Bot Petty Cash Telegram (Gemini OCR + Google Sheets)

Sistem ini berjalan **100% tanpa biaya server (0 Rupiah)** menggunakan Google Apps Script, Gemini 1.5 Flash API (Free Tier), dan Telegram Bot API.

---

## 📋 Bahan yang Anda Butuhkan (Semuanya Gratis)

1. **Akun Telegram** (untuk membuat Bot via @BotFather).
2. **Akun Google** (untuk Google Sheets & Google Apps Script).
3. **Gemini API Key** (dapatkan gratis dari [Google AI Studio](https://aistudio.google.com/)).

---

## 🚀 Langkah 1: Buat Telegram Bot via @BotFather

1. Buka aplikasi Telegram, cari `@BotFather` dan klik **Start**.
2. Ketik perintah `/newbot`.
3. Masukkan nama bot Anda, contoh: `Petty Cash Proyek Bot`.
4. Masukkan username bot (harus diakhiri kata `bot`), contoh: `pettycash_proyek_bot`.
5. `@BotFather` akan memberikan **HTTP API Token** (contoh: `7123456789:AAFx...`). **Simpan token ini!**

---

## 🔑 Langkah 2: Dapatkan Gemini API Key Gratis

1. Buka [https://aistudio.google.com/](https://aistudio.google.com/) dan login dengan Akun Google Anda.
2. Klik tombol **Get API key** -> **Create API key in new project**.
3. Salin string API Key yang dihasilkan. **Simpan key ini!**

---

## 📊 Langkah 3: Setup Google Sheets & Google Apps Script

1. Buka [Google Sheets](https://sheets.new/) untuk membuat Spreadsheet baru.
2. Beri nama spreadsheet, contoh: `Database Petty Cash Proyek`.
3. Di menu atas, klik **Extensions (Ekstensi)** -> **Apps Script**.
4. Hapus semua kode default `myFunction()`, lalu salin dan tempel **SELURUH KODE** dari file `Code.gs`.
5. Di panel sebelah kiri Apps Script, klik icon ⚙️ **Project Settings (Setelan Proyek)**.
6. Gulir ke bawah ke bagian **Script Properties (Properti Skrip)**, lalu klik **Add script property** dan tambahkan 3 variabel berikut:

| Property | Value (Isi) |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token dari @BotFather (Langkah 1) |
| `GEMINI_API_KEY` | API Key dari Google AI Studio (Langkah 2) |
| `ADMIN_TELEGRAM_ID` | User ID Telegram Admin/PIC (bisa didapatkan via bot `@userinfobot` di Telegram) |

7. Klik **Save script properties**.

---

## 🛠️ Langkah 4: Inisialisasi Database (Sheet Structure)

1. Kembali ke tab editor kode (`Code.gs`).
2. Di bagian atas editor, pada dropdown pilih fungsi `setupSheets`, lalu klik tombol **▶️ Run**.
3. Jika muncul pop-up otorisasi ("Authorization Required"), klik **Continue** -> pilih akun Google Anda -> klik **Advanced** -> **Go to Untitled project (unsafe)** -> **Allow**.
4. Buka tab Google Sheet Anda, pastikan 4 Sheet telah otomatis dibuat: `Transactions`, `TopUps`, `Projects`, dan `Users`.

---

## 🌐 Langkah 5: Deploy Webhook Google Apps Script

1. Di pojok kanan atas Apps Script, klik tombol biru **Deploy** -> **New deployment**.
2. Klik icon ⚙️ (Select type) -> pilih **Web app**.
3. Isi konfigurasi sebagai berikut:
   - **Description:** `Bot Petty Cash v2.0`
   - **Execute as:** `Me (email-anda@gmail.com)`
   - **Who has access:** `Anyone` (Sangat Penting agar Telegram bisa mengirim pesan webhook)
4. Klik **Deploy**.
5. Salin **Web app URL** yang muncul (contoh: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## 🔗 Langkah 6: Hubungkan Telegram ke Webhook Apps Script

Buka browser (Chrome/Edge/Firefox) dan buka URL berikut (ganti `<TOKEN_BOT>` dan `<URL_WEB_APP>` dengan milik Anda):

```text
https://api.telegram.org/bot<TOKEN_BOT>/setWebhook?url=<URL_WEB_APP>
```

**Contoh URL:**
`https://api.telegram.org/bot7123456789:AAFx.../setWebhook?url=https://script.google.com/macros/s/AKfycb.../exec`

Jika sukses, browser akan menampilkan pesan:
`{"ok":true,"result":true,"description":"Webhook was set"}`

---

## 🎉 Selesai! Cara Menggunakan Bot:

1. Buka Telegram dan cari Bot Anda. Klik `/start`.
2. **Input Nota/Struk:** Cukup foto nota fisik atau screenshot m-Banking lalu kirim ke bot. Bot akan membaca AI OCR dalam < 10 detik dan menampilkan tombol konfirmasi `✅ Ya` / `✏️ Edit` / `❌ Batal`.
3. **Approval Admin:** Notifikasi pending transaksi akan masuk otomatis ke Telegram Admin (`ADMIN_TELEGRAM_ID`) dengan tombol `✅ Approve` & `❌ Reject`.
4. **Cek Saldo:** Ketik `/saldo` atau `/saldo Proyek A`.
5. **Top-Up Saldo:** Ketik `/topup Proyek A 2000000`.
6. **Minta Laporan PDF:** Ketik `/laporan Proyek A` -> Bot akan mengunggah file **PDF Laporan Keuangan** rapi langsung di chat!
