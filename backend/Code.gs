/**
 * ==============================================================================
 * BOT PETTY CASH OTOMATIS (TELEGRAM + GEMINI OCR + GOOGLE SHEETS + PDF REPORT)
 * Versi: 2.0 (100% Telegram Only)
 * ==============================================================================
 * 
 * PANDUAN SETUP SINGKAT:
 * 1. Isi SCRIPT PROPERTIES di Google Apps Script (Project Settings -> Script Properties):
 *    - TELEGRAM_BOT_TOKEN : Token dari @BotFather (contoh: 7123456789:AAFx...)
 *    - GEMINI_API_KEY     : API Key dari Google AI Studio (https://aistudio.google.com/)
 *    - ADMIN_TELEGRAM_ID  : Telegram User ID milik Admin/PIC Keuangan (contoh: 123456789)
 * 2. Jalankan fungsi `setupSheets()` sekali di Apps Script Editor untuk membuat struktur Sheet otomatis.
 * 3. Deploy sebagai Web App (Execute as: Me, Who has access: Anyone).
 * 4. Set Webhook Telegram dengan membuka URL browser:
 *    https://api.telegram.org/bot<TOKEN_KAMU>/setWebhook?url=<WEB_APP_URL_KAMU>
 * ==============================================================================
 */

// Konfigurasi Rekap Laporan
const REKAP_DEFAULT_RANGE_DAYS = 7;   // /rekap tanpa argumen = 7 hari terakhir
const REKAP_MAX_PHOTOS = 40;          // batas aman jumlah foto per PDF

// Global Properties
function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ------------------------------------------------------------------------------
// 1. MAIN WEBHOOK ENTRY POINT (doPost & doGet)
// ------------------------------------------------------------------------------
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return HtmlService.createHtmlOutput("OK");
    }

    const update = JSON.parse(e.postData.contents);
    Logger.log("Update masuk: " + JSON.stringify(update));

    if (update.message) {
      handleMessage(update.message);
    } else if (update.callback_query) {
      handleCallbackQuery(update.callback_query);
    }
  } catch (error) {
    Logger.log("Error doPost: " + error.toString());
  }
  return HtmlService.createHtmlOutput("OK");
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = (params.action || "").toLowerCase();
  const projName = params.project || "Proyek Utama";
  const periodLabel = params.period || "Semua Riwayat";

  // Default ambil semua riwayat transaksi tanpa batas tanggal
  const startDate = null;
  const endDate = null;

  if (action === "json_data" || action === "get_data") {
    try {
      const txs = getProjectTransactions(projName, startDate, endDate);
      const topups = getProjectTopUps(projName, startDate, endDate);

      txs.forEach(t => {
        t.date = toPlainDateString(t.date);

        if (t.photoUrl && String(t.photoUrl).startsWith("http")) {
          const base64Img = fetchImageAsBase64(t.photoUrl);
          if (base64Img) {
            t.photoUrl = base64Img;
          }
        }
      });

      const jsonRes = JSON.stringify({
        projectName: projName,
        period: periodLabel,
        transactions: txs,
        topups: topups
      });
      return ContentService.createTextOutput(jsonRes).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "check_role") {
    const telegramId = params.telegram_id || "";
    const role = getUserRole(telegramId);
    return ContentService.createTextOutput(JSON.stringify({ role: role })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "get_active_project") {
    const telegramId = params.telegram_id || "";
    const activeProject = getUserActiveProject(telegramId) || "Proyek Utama";
    return ContentService.createTextOutput(JSON.stringify({ activeProject: activeProject })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "report" || action === "pdf" || params.project) {
    if (action === "pdf") {
      try {
        const safeProj = projName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const fileName = `Laporan_PettyCash_${safeProj}_${getTodayDate()}.pdf`;
        
        const pdfBlob = generatePettyCashPDFReport(projName, periodLabel, startDate, endDate);
        pdfBlob.setName(fileName);

        // Buat temp file publik sejenak di Drive agar browser langsung mendownload file asli dengan nama terisi!
        const tempFile = DriveApp.createFile(pdfBlob);
        tempFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${tempFile.getId()}`;

        const htmlInstantDownload = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Mengunduh ${fileName}...</title>
          </head>
          <body style="background:#f4f6f8; font-family:sans-serif; text-align:center; padding-top:80px; color:#333;">
            <p style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">📥 Mengunduh Laporan PDF...</p>
            <p style="font-size: 13px; color: #0088cc; font-weight: bold;">File: <code>${fileName}</code></p>
            <p style="font-size: 12px; color: #666;">Jika unduhan tidak berjalan otomatis, <a href="${downloadUrl}">Klik Di Sini Untuk Unduh</a>.</p>
            <script>
              window.location.href = "${downloadUrl}";
            </script>
          </body>
          </html>
        `;
        return HtmlService.createHtmlOutput(htmlInstantDownload);
      } catch (err) {
        return HtmlService.createHtmlOutput(`<h3>Gagal Mengunduh PDF: ${err.message}</h3>`);
      }
    } else {
      try {
        const htmlContent = generatePettyCashHTMLReportContent(projName, periodLabel, true, startDate, endDate);
        return HtmlService.createHtmlOutput(htmlContent);
      } catch (err) {
        return HtmlService.createHtmlOutput(`<h3>Error Loading Report: ${err.message}</h3>`);
      }
    }
  }

  return HtmlService.createHtmlOutput("<h3>Bot Petty Cash Webhook Active! ✅</h3>");
}

// ------------------------------------------------------------------------------
// 2. PENANGANAN PESAN TEKS, FOTO, & PERINTAH (/commands)
// ------------------------------------------------------------------------------
function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const userName = message.from.first_name + (message.from.last_name ? " " + message.from.last_name : "");
  const text = message.text ? message.text.trim() : "";

  // Izinkan /start dan /help tanpa registrasi
  const isPublicCommand = text === "/start" || text.startsWith("/start ") ||
                          text === "/help"  || text.startsWith("/help ");
  if (!isPublicCommand && !ensureRegisteredUser(chatId, userId)) return;

  // A. Jika ada foto (Nota/Bukti Transfer)
  if (message.photo && message.photo.length > 0) {
    handlePhotoMessage(message);
    return;
  }

  // B. Cek State User (apabila user sedang dalam proses Edit Data atau Input Alasan Reject)
  const userState = getUserState(userId);
  if (userState && userState.action) {
    handleUserPendingInput(userId, chatId, text, userState);
    return;
  }

  // C. Handle Commands (/start, /help, /saldo, /riwayat, /proyek, /topup, /laporan)
  if (text.startsWith("/")) {
    const parts = text.split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case "/start":
      case "/help":
        sendHelpMessage(chatId, userName);
        break;
      case "/saldo":
        cmdSaldo(chatId, userId, args);
        break;
      case "/riwayat":
        cmdRiwayat(chatId, userId);
        break;
      case "/proyek":
        cmdProyek(chatId, userId, args);
        break;
      case "/topup":
        cmdTopUp(chatId, userId, args);
        break;
      case "/tambahproyek":
        cmdTambahProyek(chatId, userId, args);
        break;
      case "/laporan":
      case "/rekap":
      case "/rekapmingguan":
        cmdLaporan(chatId, userId, args);
        break;
      case "/catat":
        handleTextDraftMessage(userId, chatId, userName, args.join(" "));
        break;
      case "/aturrole":
        cmdAturRole(chatId, userId, args);
        break;
      case "/setadmin":
        cmdSetAdmin(chatId, userId, args);
        break;
      case "/listuser":
        cmdListUser(chatId, userId);
        break;
      default:
        sendMessage(chatId, "⚠️ Perintah tidak dikenali. Ketik /help untuk melihat daftar perintah.");
    }
  } else {
    // Jika user mengetik pesan teks biasa (tanpa foto & tanpa /)
    if (/\d/.test(text)) {
      handleTextDraftMessage(userId, chatId, userName, text);
    } else {
      sendMessage(chatId, "💡 *Petunjuk Pencatatan:* \n• Kirim foto nota belanja/transfer dengan caption\n• ATAU ketik teks langsung: `1.6 bayar kontrakan tukang` atau `50rb beli bensin`\nKetik /help untuk bantuan lengkap.");
    }
  }
}

function sendHelpMessage(chatId, userName) {
  const role = getUserRole(chatId); // cek role pengirim untuk tampilkan seksi admin jika perlu
  
  const text = `📋 *PANDUAN BOT PETTY CASH AUTOMATION*\n` +
    `Halo *${userName}*! Berikut panduan penggunaan bot:\n\n` +

    `⚡ *2 CARA MENCATAT TRANSAKSI:*\n\n` +
    `1️⃣ *Kirim Foto (Nota / Bukti Transfer)*\n` +
    `   Sertakan caption angka & keterangan. Contoh:\n` +
    `   • \`1.6 bayar kontrakan tukang\` (Pengeluaran)\n` +
    `   • \`24jul 400rb kas pek. pulomas 1\` (Uang Masuk)\n\n` +
    `2️⃣ *Ketik Teks Langsung (Tanpa Foto)*\n` +
    `   • \`1.6 bayar kontrakan tukang pek. pulomas\`\n` +
    `   • \`150rb beli semen 3 sak\`\n` +
    `   • \`400rb kas main\`\n\n` +

    `✨ *FITUR PINTAR OTOMATIS:*\n` +
    `• 💰 *Format Angka*: \`1.6\`/\`2.1\` (Juta), \`400rb\`, \`50k\`, \`250ribu\`\n` +
    `• 📥 *Default Uang Masuk*: Tanpa kata \`bayar\`/\`beli\`/\`sewa\` → otomatis Uang Masuk\n` +
    `• 📅 *Tanggal Historis*: Tulis \`24jul\`, \`24/07/2026\` di teks/caption\n` +
    `• ⚡ *Tanpa Approval*: Transaksi langsung terdaftar instan!\n\n` +

    `📌 *DAFTAR PERINTAH (/COMMANDS):*\n` +
    `👤 *Semua User:*\n` +
    `• /saldo — Cek Saldo Terkini Proyek Aktif\n` +
    `• /proyek — Ganti / Pilih Proyek Aktif\n` +
    `• /riwayat — Lihat 10 Transaksi Terakhir\n` +
    `• /rekap — Download Laporan PDF Petty Cash\n` +
    `• /laporan — Sama dengan /rekap\n\n` +
    `👔 *Khusus Manajer & Admin:*\n` +
    `• /rekapgabungan — Laporan Gabungan (Petty Cash + Kas Proyek)\n` +
    `• /topup [Proyek] [Nominal] — Tambah Top-Up Saldo Kas\n\n` +
    `🔑 *Khusus Admin:*\n` +
    `• /tambahproyek [Nama Proyek] — Buat Proyek Baru\n` +
    `• /aturrole [telegram_id] [pengawas|manajer] — Atur JobRole Pengguna\n` +
    `• /setadmin [telegram_id] [on|off] — Beri/Cabut Hak Admin\n` +
    `• /listuser — Tampilkan Semua Pengguna\n\n` +

    `🏷️ *INFO ROLE:*\n` +
    `• *Pengawas* — Catat transaksi Petty Cash, cek saldo, lihat riwayat\n` +
    `• *Manajer* — Transaksi Kas Proyek + laporan gabungan & top-up\n` +
    `• *IsAdmin ON* — Hak akses sistem penuh (bisa dipadukan dengan JobRole apapun)`;
    
  sendMessage(chatId, text);
}

// Middleware validasi: kembalikan false & kirim pesan jika user belum terdaftar
function ensureRegisteredUser(chatId, userId) {
  const role = getUserRole(userId);
  if (!role) {
    const adminUsername = getProperty("ADMIN_TELEGRAM_USERNAME");
    let adminContact = "Admin";
    if (adminUsername) {
      const cleanUsername = adminUsername.replace(/^@/, "").trim();
      adminContact = `@${cleanUsername}\n\natau\n\nhttps://t.me/${cleanUsername}`;
    }

    const text = `🔒 *Akun Belum Terdaftar*\n\n` +
      `Akun Telegram Anda belum terdaftar pada sistem Kas Proyek.\n\n` +
      `Silakan screenshot pesan ini dan kirimkan kepada Admin untuk didaftarkan.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🆔 *Telegram ID*\n\`${userId}\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 *Hubungi Admin*\n\n${adminContact}\n\n` +
      `Setelah akun Anda didaftarkan, kirim kembali /start.`;

    sendMessage(chatId, text);
    return false;
  }
  return true;
}

// ------------------------------------------------------------------------------
// 3. FITUR PENCATATAN FOTO NOTA (SUPER KILAT & INSTAN)
// ------------------------------------------------------------------------------
function handlePhotoMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const userName = message.from.first_name || "Staf";
  const caption = message.caption ? message.caption.trim() : "";

  if (!ensureRegisteredUser(chatId, userId)) return;

  const photoObj = message.photo[message.photo.length - 1];
  const fileId = photoObj.file_id;

  try {
    // 1. Ambil URL Foto dari Telegram
    const botToken = getProperty("TELEGRAM_BOT_TOKEN");
    const fileRes = UrlFetchApp.fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileJson = JSON.parse(fileRes.getContentText());

    if (!fileJson.ok) {
      throw new Error("Gagal mengambil gambar dari Telegram.");
    }

    const filePath = fileJson.result.file_path;
    const imgUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    // 2. Deteksi Smart Caption (Nominal, Tanggal, Tipe Transaksi, & Kategori Otomatis)
    const detected = detectTransactionTypeAndCategory(caption);
    const txType = detected.type;
    const txCategory = detected.category;

    let parsedDate = "";
    let parsedNominal = 0;
    let merchantText = caption ? caption : "Bukti Transfer / Nota";

    if (caption) {
      // 1. Ekstrak Tanggal jika ditulis di caption (contoh: 24 Jul 2026 / 15/05/2026 / 2026-07-24)
      const dateRes = parseDateFromText(caption);
      parsedDate = dateRes.dateStr;

      let textForAmount = caption;
      if (dateRes.matchedSubstring) {
        textForAmount = caption.replace(dateRes.matchedSubstring, "").trim();
      }

      // 2. Ekstrak Nominal Angka (Mendukung Singkatan Desimal: 1.6, 2.1, 0.5, 12.5, 50rb, 250k, 1.5jt)
      const allMatches = textForAmount.match(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k\b|m|milyar|miliar)?/gi);
      let rawNumStr = "";

      if (allMatches) {
        let maxVal = 0;
        for (let m of allMatches) {
          const parsed = parseAmountString(m);
          if (parsed > maxVal) {
            maxVal = parsed;
            rawNumStr = m;
          }
        }
        if (maxVal > 0) {
          parsedNominal = maxVal;
        }
      }

      // 3. Ekstrak Remarks / Keterangan
      let cleanRemarks = textForAmount
        .replace(/uang masuk|uang keluar|topup|top up|debit|reimburse|masuk|kredit|pengeluaran/gi, "")
        .replace(/\b(?:bayar|beli|pembelian|biaya|ongkir|sewa)\b/gi, "");

      if (rawNumStr) {
        cleanRemarks = cleanRemarks.replace(rawNumStr, "");
      }

      cleanRemarks = cleanRemarks.replace(/^[-_\s:]+|[-_\s:]+$/g, "").trim();

      if (cleanRemarks.length > 0) {
        merchantText = toTitleCase(cleanRemarks);
      } else if (caption) {
        merchantText = toTitleCase(caption);
      }
    }

    // 3. Buat Draft Transaksi Seketika (Tanpa Tunggu AI)
    const activeProject = getUserActiveProject(userId) || "Proyek Utama";
    const userJobRole = getUserJobRole(userId) || JOB_PENGAWAS;
    const txId = "TX-" + Math.floor(100000 + Math.random() * 900000);

    saveTransactionDraft({
      id: txId,
      userId: userId,
      userName: userName,
      jobRole: userJobRole,
      chatId: chatId,
      project: activeProject,
      date: parsedDate ? parsedDate : getTodayDate(),
      amount: parsedNominal,
      merchant: toTitleCase(merchantText),
      category: txCategory,
      refNo: "-",
      type: txType,
      status: "Draft",
      photoUrl: imgUrl
    });

    // 4. Langsung Tampilkan Menu Preview Interaktif (Instan < 0.2 detik)
    sendTransactionPreviewMessage(chatId, txId);

  } catch (err) {
    Logger.log("Photo Handle Error: " + err.toString());
    sendMessage(chatId, `⚠️ *Gagal memproses foto:* ${err.message}`);
  }
}

function handleTextDraftMessage(userId, chatId, userName, text) {
  if (!text) return;
  if (!ensureRegisteredUser(chatId, userId)) return;

  const detected = detectTransactionTypeAndCategory(text);
  const txType = detected.type;
  const txCategory = detected.category;

  let parsedDate = "";
  let parsedNominal = 0;
  let merchantText = text;

  const dateRes = parseDateFromText(text);
  parsedDate = dateRes.dateStr;

  let textForAmount = text;
  if (dateRes.matchedSubstring) {
    textForAmount = text.replace(dateRes.matchedSubstring, "").trim();
  }

  const allMatches = textForAmount.match(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k\b|m|milyar|miliar)?/gi);
  let rawNumStr = "";

  if (allMatches) {
    let maxVal = 0;
    for (let m of allMatches) {
      const parsed = parseAmountString(m);
      if (parsed > maxVal) {
        maxVal = parsed;
        rawNumStr = m;
      }
    }
    if (maxVal > 0) {
      parsedNominal = maxVal;
    }
  }

  let cleanRemarks = textForAmount
    .replace(/uang masuk|uang keluar|topup|top up|debit|reimburse|masuk|kredit|pengeluaran/gi, "")
    .replace(/\b(?:bayar|beli|pembelian|biaya|ongkir|sewa)\b/gi, "");

  if (rawNumStr) {
    cleanRemarks = cleanRemarks.replace(rawNumStr, "");
  }

  cleanRemarks = cleanRemarks.replace(/^[-_\s:]+|[-_\s:]+$/g, "").trim();

  if (cleanRemarks.length > 0) {
    merchantText = toTitleCase(cleanRemarks);
  } else {
    merchantText = toTitleCase(text);
  }

  const activeProject = getUserActiveProject(userId) || "Proyek Utama";
  const userJobRole = getUserJobRole(userId) || JOB_PENGAWAS;
  const txId = "TX-" + Math.floor(100000 + Math.random() * 900000);

  saveTransactionDraft({
    id: txId,
    userId: userId,
    userName: userName,
    jobRole: userJobRole,
    chatId: chatId,
    project: activeProject,
    date: parsedDate ? parsedDate : getTodayDate(),
    amount: parsedNominal,
    merchant: merchantText,
    category: txCategory,
    refNo: "-",
    type: txType,
    status: "Draft",
    photoUrl: ""
  });

  sendTransactionPreviewMessage(chatId, txId);
}

function sendTransactionPreviewMessage(chatId, txId, messageId = null) {
  const tx = getTransactionById(txId);
  if (!tx) return;

  const isDebit = tx.type === "Debit";
  const typeLabel = isDebit ? "📥 UANG MASUK (DEBIT)" : "📤 PENGELUARAN (KREDIT)";
  const jobRoleLabel = tx.jobRole === JOB_MANAJER ? "Kas Proyek (Manajer)" : "Petty Cash (Pengawas)";

  const formattedDate = formatDisplayDate(tx.date);

  const msgText = `📋 *DRAFT TRANSAKSI* (${jobRoleLabel.toUpperCase()})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *ID:* \`${tx.id}\`\n` +
    `• *Tipe Transaksi:* *${typeLabel}*\n` +
    `• *Jalur Kas:* 💼 *${jobRoleLabel}*\n` +
    `• *Tanggal:* ${formattedDate}\n` +
    `• *Nominal:* Rp ${formatRupiah(tx.amount)}\n` +
    `• *Keterangan:* ${tx.merchant}\n` +
    `• *Kategori:* 🏷️ *${tx.category}*\n` +
    `• *Proyek:* 🏗️ *${tx.project}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Tips:* Pilih Kategori, Proyek, atau Tipe Transaksi dengan 1-klik di bawah!`;

  const toggleTypeData = isDebit ? `settype_${txId}_Kredit` : `settype_${txId}_Debit`;
  const toggleTypeBtnText = isDebit ? "🔄 Ubah ke Pengeluaran (Kredit)" : "🔄 Ubah ke Uang Masuk (Debit)";

  const inlineKeyboard = {
    "inline_keyboard": [
      [
        { "text": toggleTypeBtnText, "callback_data": toggleTypeData }
      ],
      [
        { "text": "🏷️ Pilih Kategori", "callback_data": `selcat_${txId}` },
        { "text": "🏗️ Pilih Proyek", "callback_data": `selproj_${txId}` }
      ],
      [
        { "text": "✏️ Edit Manual", "callback_data": `edit_${txId}` },
        { "text": "✅ Simpan & Kirim", "callback_data": `confirm_${txId}` }
      ],
      [
        { "text": "❌ Batal", "callback_data": `cancel_${txId}` }
      ]
    ]
  };

  if (messageId) {
    editMessageText(chatId, messageId, msgText, inlineKeyboard);
  } else {
    sendMessageWithKeyboard(chatId, msgText, inlineKeyboard);
  }
}

// ------------------------------------------------------------------------------
// 4. PENANGANAN CALLBACK QUERY (TOMBOL INLINE TELEGRAM)
// ------------------------------------------------------------------------------
function handleCallbackQuery(cb) {
  const cbId = cb.id;
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const data = cb.data;
  const userId = cb.from.id;
  const userName = cb.from.first_name || "Admin";

  // Blokir user tidak terdaftar dari semua aksi tombol inline
  if (!ensureRegisteredUser(chatId, userId)) {
    answerCallbackQuery(cbId, "⛔ Akses ditolak. Akun belum terdaftar.");
    return;
  }

  answerCallbackQuery(cbId, "Memproses...");

  if (data.startsWith("settype_")) {
    const parts = data.split("_");
    const txId = parts[1];
    const newType = parts[2];
    updateTransactionField(txId, "Type", newType);
    if (newType === "Debit") {
      updateTransactionField(txId, "Category", "Uang Masuk / TopUp");
    } else {
      updateTransactionField(txId, "Category", "Lain-Lain");
    }
    sendTransactionPreviewMessage(chatId, txId, messageId);

  } else if (data.startsWith("selcat_")) {
    const txId = data.replace("selcat_", "");
    const categories = ["Material", "Upah", "Alat", "ATK", "Akomodasi", "Lain-Lain"];
    const rows = [];
    for (let i = 0; i < categories.length; i += 2) {
      const c1 = categories[i];
      const c2 = categories[i + 1];
      rows.push([
        { "text": `🏷️ ${c1}`, "callback_data": `setcat_${txId}_${c1}` },
        { "text": `🏷️ ${c2}`, "callback_data": `setcat_${txId}_${c2}` }
      ]);
    }
    rows.push([{ "text": "🔙 Kembali", "callback_data": `backprev_${txId}` }]);

    const catKeyboard = { "inline_keyboard": rows };
    editMessageText(chatId, messageId, `🏷️ *Pilih Kategori KAS Kredit untuk transaksi ${txId}:*`, catKeyboard);

  } else if (data.startsWith("setcat_")) {
    const parts = data.split("_");
    const txId = parts[1];
    const catName = parts.slice(2).join("_");
    updateTransactionField(txId, "Category", catName);
    sendTransactionPreviewMessage(chatId, txId, messageId);

  } else if (data.startsWith("selproj_")) {
    const txId = data.replace("selproj_", "");
    const projects = getAllProjects();
    const rows = [];
    projects.forEach(p => {
      rows.push([{ "text": `🏗️ ${p}`, "callback_data": `setproj_${txId}_${p}` }]);
    });
    rows.push([{ "text": "🔙 Kembali", "callback_data": `backprev_${txId}` }]);

    const projKeyboard = { "inline_keyboard": rows };
    editMessageText(chatId, messageId, `🏗️ *Pilih Proyek untuk transaksi ${txId}:*`, projKeyboard);

  } else if (data.startsWith("setproj_")) {
    const parts = data.split("_");
    const txId = parts[1];
    const projName = parts.slice(2).join("_");
    updateTransactionField(txId, "Project", projName);
    sendTransactionPreviewMessage(chatId, txId, messageId);

  } else if (data.startsWith("setuseractiveproj_")) {
    const projName = data.replace("setuseractiveproj_", "");
    setUserActiveProject(userId, projName);
    editMessageText(chatId, messageId, `✅ *Proyek aktif Anda diganti menjadi:* 🏗️ *${projName}*\nSetiap nota yang Anda catat selanjutnya akan otomatis masuk ke proyek ini.`, null);

  } else if (data.startsWith("backprev_")) {
    const txId = data.replace("backprev_", "");
    sendTransactionPreviewMessage(chatId, txId, messageId);

  } else if (data.startsWith("confirm_")) {
    const txId = data.replace("confirm_", "");
    let tx = getTransactionById(txId);

    const currentJobRole = getUserJobRole(userId);
    if (!currentJobRole) {
      answerCallbackQuery(cbId, "⛔ Akses ditolak. Akun belum terdaftar.");
      return;
    }

    // Simpan Foto ke Google Drive secara permanen saat konfirmasi
    if (tx && tx.photoUrl && tx.photoUrl.startsWith("http") && !tx.photoUrl.includes("drive.google.com")) {
      try {
        const imgBlob = UrlFetchApp.fetch(tx.photoUrl).getBlob();
        const driveUrl = savePhotoToDrive(imgBlob, `Nota_${tx.date}_${txId}.jpg`);
        if (driveUrl) {
          updateTransactionField(txId, "PhotoUrl", driveUrl);
          tx.photoUrl = driveUrl;
        }
      } catch (e) {
        Logger.log("Drive Save Error on Confirm: " + e.toString());
      }
    }

    // Simpan Transaksi Permanen dengan JobRole Terverifikasi
    saveFinalTransaction(tx ? tx : { id: txId, userId: userId }, "Approved", userName);

    tx = getTransactionById(txId);
    const projectBalance = getProjectBalance(tx ? tx.project : "");
    const formattedDate = formatDisplayDate(tx ? tx.date : "");
    const targetKasLabel = (tx && tx.jobRole === JOB_MANAJER) ? "Kas Proyek (Manajer)" : "Petty Cash (Pengawas)";

    // Edit pesan konfirmasi user
    editMessageText(chatId, messageId, 
      `✅ *TRANSAKSI BERHASIL DICATAT!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *ID:* \`${txId}\`\n` +
      `• *Jalur Kas:* 💼 *${targetKasLabel}*\n` +
      `• *Tanggal:* ${formattedDate}\n` +
      `• *Nominal:* Rp ${formatRupiah(tx ? tx.amount : 0)}\n` +
      `• *Keterangan:* ${tx ? tx.merchant : "-"}\n` +
      `• *Kategori:* 🏷️ ${tx ? tx.category : "-"}\n` +
      `• *Proyek:* 🏗️ ${tx ? tx.project : "-"}\n` +
      `• *Saldo Terkini Proyek:* Rp ${formatRupiah(projectBalance.remaining)}`
    );

  } else if (data.startsWith("cancel_")) {
    const txId = data.replace("cancel_", "");
    updateTransactionStatus(txId, "Cancelled");
    editMessageText(chatId, messageId, `❌ *Transaksi ${txId} Dibatalkan.*`);

  } else if (data.startsWith("edit_")) {
    const txId = data.replace("edit_", "");
    setUserState(userId, { action: "EDIT_WAITING_FIELD", txId: txId });

    const editKeyboard = {
      "inline_keyboard": [
        [
          { "text": "💰 Nominal", "callback_data": `efield_${txId}_amount` },
          { "text": "📝 Keterangan / Remarks", "callback_data": `efield_${txId}_merchant` }
        ],
        [
          { "text": "📅 Tanggal", "callback_data": `efield_${txId}_date` },
          { "text": "🏷️ Kategori", "callback_data": `efield_${txId}_category` }
        ],
        [
          { "text": "🔙 Selesai Edit", "callback_data": `confirm_${txId}` }
        ]
      ]
    };
    editMessageText(chatId, messageId, `✏️ *Pilih field yang ingin dikoreksi untuk transaksi ${txId}:*`, editKeyboard);

  } else if (data.startsWith("efield_")) {
    const parts = data.split("_");
    const txId = parts[1];
    const field = parts[2];
    
    setUserState(userId, { action: "EDIT_VALUE_INPUT", txId: txId, field: field });
    const labelName = field === "merchant" ? "Keterangan / Remarks" : field.toUpperCase();
    sendMessage(chatId, `📝 Silakan ketik nilai baru untuk *${labelName}*:`);

  } else if (data.startsWith("approve_")) {
    const txId = data.replace("approve_", "");
    const tx = getTransactionById(txId);

    if (!tx) {
      sendMessage(chatId, "⚠️ Transaksi tidak ditemukan.");
      return;
    }

    updateTransactionStatus(txId, "Approved", userName);
    
    // Potong/Update Saldo Proyek
    const projectBalance = getProjectBalance(tx.project);

    editMessageText(chatId, messageId,
      `✅ *TRANSAKSI DI-APPROVE!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *ID:* \`${txId}\`\n` +
      `• *Oleh Admin:* ${userName}\n` +
      `• *Nominal:* Rp ${formatRupiah(tx.amount)}\n` +
      `• *Proyek:* ${tx.project}\n` +
      `• *Saldo Terkini Proyek:* Rp ${formatRupiah(projectBalance.remaining)}`
    );

    // Notify User bahwa transaksi di-approve
    sendMessage(tx.chatId, 
      `🎉 *Transaksi Kamu Di-Approve!*\n` +
      `ID: \`${txId}\` | Rp ${formatRupiah(tx.amount)} (${tx.merchant})\n` +
      `Saldo Terkini Proyek ${tx.project}: *Rp ${formatRupiah(projectBalance.remaining)}*`
    );

  } else if (data.startsWith("reject_")) {
    const txId = data.replace("reject_", "");
    setUserState(userId, { action: "REJECT_REASON_INPUT", txId: txId, messageId: messageId });
    sendMessage(chatId, `❌ Silakan ketik *alasan penolakan (reject)* untuk transaksi \`${txId}\`:`);
  }
}

// ------------------------------------------------------------------------------
// 5. INPUT USER PENDING (TEKS UNTUK EDIT / ALASAN REJECT)
// ------------------------------------------------------------------------------
function handleUserPendingInput(userId, chatId, text, userState) {
  if (userState.action === "EDIT_VALUE_INPUT") {
    const txId = userState.txId;
    const field = userState.field;
    
    updateTransactionField(txId, field, text);
    clearUserState(userId);

    const tx = getTransactionById(txId);
    sendMessage(chatId, `✅ *Berhasil memperbarui ${field}!*\nNilai baru: *${text}*`);

    const msgText = `📄 *Data Transaksi Diperbarui*\n` +
      `ID: \`${txId}\` | Nominal: Rp ${formatRupiah(tx.amount)}\n` +
      `Merchant: ${tx.merchant} | Kategori: ${tx.category}\n` +
      `Apakah data di atas sudah benar?`;

    const inlineKeyboard = {
      "inline_keyboard": [
        [
          { "text": "✅ Ya, Konfirmasi", "callback_data": `confirm_${txId}` },
          { "text": "✏️ Edit Lainnya", "callback_data": `edit_${txId}` }
        ]
      ]
    };
    sendMessageWithKeyboard(chatId, msgText, inlineKeyboard);

  } else if (userState.action === "REJECT_REASON_INPUT") {
    const txId = userState.txId;
    const reason = text;
    clearUserState(userId);

    const tx = getTransactionById(txId);
    updateTransactionStatus(txId, "Rejected", "Admin", reason);

    sendMessage(chatId, `❌ *Transaksi ${txId} telah di-reject.* Alasan: "${reason}"`);
    
    // Notify User
    if (tx && tx.chatId) {
      sendMessage(tx.chatId, `❌ *Transaksi Ditolak (Rejected)*\nID: \`${txId}\` (${tx.merchant})\nAlasan Admin: _"${reason}"_`);
    }
  }
}

// ------------------------------------------------------------------------------
// 6. PERINTAH BOT TELEGRAM (/saldo, /riwayat, /proyek, /topup, /laporan)
// ------------------------------------------------------------------------------

// /saldo
function cmdSaldo(chatId, userId, args) {
  const activeProj = args.length > 0 ? args.join(" ") : (getUserActiveProject(userId) || "Proyek Utama");
  const bal = getProjectBalance(activeProj);

  const text = `💰 *STATUS SALDO PETTY CASH*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏗️ *Proyek:* ${activeProj}\n` +
    `📥 *Total Top-Up:* Rp ${formatRupiah(bal.totalTopup)}\n` +
    `📤 *Total Pengeluaran (Approved):* Rp ${formatRupiah(bal.totalExpense)}\n` +
    `📊 *SALDO BERJALAN:* Rp ${formatRupiah(bal.remaining)}\n` +
    `⚠️ *Ambang Saldo Min:* Rp ${formatRupiah(bal.minThreshold)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`;
  sendMessage(chatId, text);
}

// /riwayat
function cmdRiwayat(chatId, userId) {
  const txs = getUserTransactions(userId, 10);
  if (txs.length === 0) {
    sendMessage(chatId, "ℹ️ Belum ada riwayat transaksi.");
    return;
  }

  let text = `📜 *10 TRANSAKSI TERAKHIR KAMU*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  txs.forEach(t => {
    const statusIcon = t.status === "Approved" ? "✅" : (t.status === "Rejected" ? "❌" : "⏳");
    text += `${statusIcon} \`${t.id}\` | ${t.date}\n` +
      `   Rp ${formatRupiah(t.amount)} - ${t.merchant} (${t.category})\n`;
  });
  sendMessage(chatId, text);
}

// /tambahproyek (Khusus Admin)
function cmdTambahProyek(chatId, userId, args) {
  if (!isAdmin(userId)) {
    sendMessage(chatId, "⚠️ *Akses Ditolak.* Hanya Admin yang dapat menambahkan/membuat proyek baru.");
    return;
  }

  if (!args || args.length === 0) {
    sendMessage(chatId, "⚠️ *Format Salah.* Gunakan: `/tambahproyek [Nama Proyek Baru]`\n*Contoh:* `/tambahproyek Proyek Gedung C`");
    return;
  }

  const newProjName = args.join(" ").trim();
  const projects = getAllProjects();
  if (projects.includes(newProjName)) {
    sendMessage(chatId, `ℹ️ Proyek *${newProjName}* sudah terdaftar sebelumnya.`);
    return;
  }

  setupSheets();
  const sheetProj = getDbSpreadsheet().getSheetByName("Projects");
  sheetProj.appendRow([newProjName, 0, 500000, "Active"]);

  sendMessage(chatId, `🎉 *BERHASIL MEMBUAT PROYEK BARU!*\n━━━━━━━━━━━━━━━━━━━━━━\n🏗️ *Nama Proyek:* ${newProjName}\n✨ Sekarang semua pengguna dapat memilih proyek ini atau melakukan /topup.`);
}

// /proyek
function cmdProyek(chatId, userId, args) {
  const projects = getAllProjects();

  if (args.length > 0) {
    const targetProj = args.join(" ").trim();
    if (!projects.includes(targetProj)) {
      if (isAdmin(userId)) {
        setupSheets();
        const sheetProj = getDbSpreadsheet().getSheetByName("Projects");
        sheetProj.appendRow([targetProj, 0, 500000, "Active"]);
        setUserActiveProject(userId, targetProj);
        sendMessage(chatId, `🎉 *Proyek Baru Berhasil Dibuat & Diaktifkan:* 🏗️ ${targetProj}`);
      } else {
        sendMessage(chatId, `⚠️ Proyek *${targetProj}* belum terdaftar.\n🔒 *Hanya Admin yang dapat membuat proyek baru.* Silakan pilih dari proyek yang tersedia di bawah ini:\n\n` + projects.map(p => `• ${p}`).join("\n"));
      }
      return;
    }

    setUserActiveProject(userId, targetProj);
    sendMessage(chatId, `✅ *Proyek aktif diganti menjadi:* 🏗️ ${targetProj}`);
  } else {
    const curr = getUserActiveProject(userId);
    const currText = curr ? curr : "(Belum memilih proyek)";

    if (projects.length === 0) {
      sendMessage(chatId, "🏗️ *Belum ada proyek yang terdaftar di database.*\n💡 Admin dapat membuat proyek baru menggunakan perintah:\n`/tambahproyek [Nama Proyek]`");
      return;
    }

    let text = `🏗️ *PROYEK AKTIF ANDA SAAT INI:* *${currText}*\n\n` +
      `Klik tombol proyek di bawah untuk mengganti proyek aktif Anda dengan 1-klik:`;

    const rows = [];
    projects.forEach(p => {
      rows.push([{ "text": `🏗️ ${p}`, "callback_data": `setuseractiveproj_${p}` }]);
    });

    sendMessageWithKeyboard(chatId, text, { "inline_keyboard": rows });
  }
}

// /topup (Bisa Digunakan Oleh Semua Pengguna)
function cmdTopUp(chatId, userId, args) {
  if (args.length < 2) {
    sendMessage(chatId, "⚠️ *Format Salah.* Gunakan: `/topup [Nama Proyek] [Nominal]`\nContoh: `/topup Proyek A 2000000`");
    return;
  }

  const rawAmount = args[args.length - 1].replace(/[^0-9]/g, "");
  const amount = parseInt(rawAmount, 10);
  const projectName = args.slice(0, args.length - 1).join(" ").trim();

  if (isNaN(amount) || amount <= 0) {
    sendMessage(chatId, "⚠️ Nominal top-up harus berupa angka positif.");
    return;
  }

  const projects = getAllProjects();
  if (!projects.includes(projectName)) {
    if (isAdmin(userId)) {
      setupSheets();
      const sheetProj = getDbSpreadsheet().getSheetByName("Projects");
      sheetProj.appendRow([projectName, 0, 500000, "Active"]);
    } else {
      sendMessage(chatId, `⚠️ Proyek *${projectName}* belum terdaftar.\n🔒 *Hanya Admin yang dapat membuat proyek baru.* Silakan pilih dari proyek yang sudah ada.`);
      return;
    }
  }

  addTopUpRecord(projectName, amount, userId);
  const bal = getProjectBalance(projectName);

  const text = `📥 *TOP-UP SALDO BERHASIL!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏗️ *Proyek:* ${projectName}\n` +
    `💵 *Nominal Top-Up:* Rp ${formatRupiah(amount)}\n` +
    `💰 *Saldo Terbaru Proyek:* Rp ${formatRupiah(bal.remaining)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━`;
  sendMessage(chatId, text);
}

// /laporan -> INSTANT REKAP SUMMARY & DIRECT PDF FILE IN TELEGRAM
function cmdLaporan(chatId, userId, args) {
  const projName = getUserActiveProject(userId) || "Proyek Utama";
  
  let periodLabel = "30 Hari Terakhir";
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 30);

  if (args && args.length > 0) {
    const argStr = args.join(" ").toLowerCase();
    if (argStr.includes("minggu") || argStr.includes("7")) {
      periodLabel = "7 Hari Terakhir";
      startDate.setDate(today.getDate() - 7);
    } else if (argStr.includes("semua") || argStr.includes("all")) {
      periodLabel = "Semua Riwayat";
      startDate.setTime(0);
    }
  }

  const bal = getProjectBalance(projName);
  let webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl || webAppUrl.length === 0) {
    webAppUrl = getProperty("WEB_APP_URL") || "";
  }

  const reportUrl = `${webAppUrl}?action=report&project=${encodeURIComponent(projName)}`;
  const pdfUrl = `${webAppUrl}?action=pdf&project=${encodeURIComponent(projName)}`;

  const summaryMsg = `📊 *LAPORAN KEUANGAN PETTY CASH*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏗️ *Proyek:* ${projName}\n` +
    `📅 *Periode:* ${periodLabel}\n\n` +
    `💵 *Total Top-Up:* Rp ${formatRupiah(bal.totalTopup)}\n` +
    `💸 *Total Pengeluaran:* Rp ${formatRupiah(bal.totalExpense)}\n` +
    `💰 *Saldo Terkini Proyek:* Rp ${formatRupiah(bal.remaining)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 *Pilih opsi laporan di bawah ini:*`;

  const inlineKeyboard = {
    "inline_keyboard": [
      [
        { "text": "🌐 Buka Laporan Web & Print A4", "url": reportUrl }
      ],
      [
        { "text": "📥 Unduh File PDF Langsung", "url": pdfUrl }
      ]
    ]
  };

  // 1. Kirim pesan ringkasan & tombol instan (< 0.1s)
  sendMessageWithKeyboard(chatId, summaryMsg, inlineKeyboard);

  // 2. Coba kirimkan file PDF fisik secara langsung di Telegram
  try {
    const pdfBlob = generatePettyCashPDFReport(projName, periodLabel, startDate, today);
    const safeProj = projName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `Laporan_PettyCash_${safeProj}_${getTodayDate()}.pdf`;
    sendDocument(chatId, pdfBlob, fileName, `📄 File PDF Laporan Keuangan (${projName})`);
  } catch (err) {
    Logger.log("Direct PDF attach error: " + err.toString());
  }
}

// Helper pre-fetching gambar ke Base64 agar rendering PDF instan tanpa hang
function fetchImageAsBase64(url) {
  if (!url || !url.startsWith("http")) return null;
  try {
    if (url.includes("drive.google.com")) {
      const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        const fileId = match[1];
        const file = DriveApp.getFileById(fileId);
        const blob = file.getBlob();
        const bytes = blob.getBytes();
        return `data:image/jpeg;base64,${Utilities.base64Encode(bytes)}`;
      }
    }

    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      validateHttpsCertificates: false,
      followRedirects: true
    });
    if (resp.getResponseCode() === 200) {
      const blob = resp.getBlob();
      const bytes = blob.getBytes();
      if (bytes && bytes.length > 0) {
        return `data:image/jpeg;base64,${Utilities.base64Encode(bytes)}`;
      }
    }
  } catch (e) {
    Logger.log("Image fetch error: " + e.toString());
  }
  return null;
}

function generatePettyCashHTMLReportContent(projectName, period, isForBrowser = true, startDate = null, endDate = null) {
  const txs = getProjectTransactions(projectName, startDate, endDate);

  let runningBalance = 0;
  let tableRowsHtml = "";
  // Batasi baris kosong ke max 15 (bukan 50) agar pas di 1 halaman A4 Landscape tanpa tumpah!
  const totalRows = Math.max(15, txs.length);

  for (let i = 0; i < totalRows; i++) {
    if (i < txs.length) {
      const t = txs[i];
      let mat = "-", upah = "-", alat = "-", atk = "-", akom = "-", lain = "-", debit = "-", saldo = "-";
      const note = t.refNo && t.refNo !== "-" ? t.refNo : (t.rejectReason || "");

      if (t.type === "Debit") {
        runningBalance += t.amount;
        debit = t.amount.toLocaleString("id-ID");
      } else {
        runningBalance -= t.amount;
        const amtStr = t.amount.toLocaleString("id-ID");
        const cat = (t.category || "Lain-Lain").toLowerCase();
        const desc = (t.merchant || t.description || "").toLowerCase();

        if (cat.includes("material") || desc.includes("material")) mat = amtStr;
        else if (cat.includes("upah") || cat.includes("gaji") || (desc.includes("tukang") && !desc.includes("kontrakan"))) upah = amtStr;
        else if (cat.includes("alat") || desc.includes("alat")) alat = amtStr;
        else if (cat.includes("atk") || cat.includes("tulis") || desc.includes("spidol")) atk = amtStr;
        else if (cat.includes("akomodasi") || cat.includes("sewa") || cat.includes("kontrakan") || desc.includes("kontrakan")) akom = amtStr;
        else lain = amtStr;
      }

      if (runningBalance < 0) {
        saldo = `(${Math.abs(runningBalance).toLocaleString("id-ID")})`;
      } else if (runningBalance > 0) {
        saldo = runningBalance.toLocaleString("id-ID");
      }

      tableRowsHtml += `
        <tr style="height: 14px;">
          <td class="text-center">${formatDisplayDate(t.date)}</td>
          <td class="text-left">${toTitleCase(t.merchant || t.description || "")}</td>
          <td class="text-right">${mat}</td>
          <td class="text-right">${upah}</td>
          <td class="text-right">${alat}</td>
          <td class="text-right">${atk}</td>
          <td class="text-right">${akom}</td>
          <td class="text-right">${lain}</td>
          <td class="text-right">${debit}</td>
          <td class="text-right">${saldo}</td>
          <td class="text-left">${note}</td>
        </tr>
      `;
    } else {
      tableRowsHtml += `
        <tr style="height: 14px;">
          <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      `;
    }
  }

  let photoGalleryHtml = "";
  const txsWithPhoto = txs.filter(t => t.photoUrl && String(t.photoUrl).startsWith("http")).slice(0, 30);

  txsWithPhoto.forEach((t, idx) => {
    const base64Img = fetchImageAsBase64(t.photoUrl);
    const imgSrc = base64Img || t.photoUrl;

    const imgDisplay = `<img src="${imgSrc}" style="max-width: 100%; max-height: 120px; border: 1px solid #999; display: inline-block;" />`;

    photoGalleryHtml += `
      <div style="float: left; width: 23%; margin: 1%; border: 1px solid #000; padding: 4px; box-sizing: border-box; font-size: 7.5px; page-break-inside: avoid; text-align: center;">
        <b>Bukti #${idx + 1}: ${formatDisplayDate(t.date)}</b><br>
        <span style="font-weight: bold;">${toTitleCase(t.merchant)}</span><br>
        <span style="font-size: 7px; color: #333;">Rp ${t.amount ? t.amount.toLocaleString("id-ID") : 0}</span><br>
        <div style="margin-top: 4px; text-align: center;">
          ${imgDisplay}
        </div>
      </div>
    `;
  });

  const printBarHtml = isForBrowser ? `
    <div style="background: #0088cc; color: white; padding: 12px 20px; margin-bottom: 20px; font-family: sans-serif; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" class="no-print">
      <div>
        <span style="font-weight: bold; font-size: 14px;">📊 Laporan Keuangan Petty Cash — ${projectName}</span><br>
        <span style="font-size: 11px; opacity: 0.9;">💡 <b>Tips Cetak Rapi:</b> Hilangkan centang <i>"Header dan footer"</i> di dialog cetak browser agar URL tidak muncul.</span>
      </div>
      <button onclick="window.print()" style="background: #ffffff; color: #0088cc; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px;">🖨️ Cetak / Simpan Ke PDF</button>
    </div>
    <style>
      @media print { .no-print { display: none !important; } }
    </style>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Laporan Petty Cash - ${projectName}</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 10mm; font-size: 10px; box-sizing: border-box; }
        .title-box { border: 1.5px solid #000; text-align: center; padding: 6px 0; font-weight: bold; font-size: 12px; }
        .sub-title { font-size: 11px; font-weight: bold; }
        .year-title { font-size: 10px; font-weight: bold; }
        table.ledger { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 0; border: 1.5px solid #000; }
        table.ledger th, table.ledger td { border: 1px solid #000; padding: 4px 3px; font-size: 8.5px; white-space: normal; word-wrap: break-word; vertical-align: middle; box-sizing: border-box; }
        table.ledger th { font-weight: bold; text-align: center; }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .text-right { text-align: right; }
        .footer-stamp { margin-top: 15px; border-top: 1.5px solid #000; padding-top: 5px; text-align: center; font-weight: bold; font-size: 9.5px; letter-spacing: 1px; }
      </style>
    </head>
    <body>
      ${printBarHtml}
      <div class="title-box">
        Laporan keuangan proyek ${projectName}<br>
        <span class="sub-title">[${projectName}]</span><br>
        <span class="year-title">PERIODE ${period}</span>
      </div>
      <table class="ledger">
        <thead>
          <tr>
            <th rowspan="2" style="width: 7%;">Tanggal</th>
            <th rowspan="2" style="width: 23%;">Deskripsi</th>
            <th colspan="6" style="width: 40%;">Kredit</th>
            <th rowspan="2" style="width: 9%;">Debit</th>
            <th rowspan="2" style="width: 10%;">Saldo</th>
            <th rowspan="2" style="width: 11%;">Keterangan</th>
          </tr>
          <tr>
            <th style="width: 7%;">Material</th>
            <th style="width: 6%;">Upah</th>
            <th style="width: 7%;">Alat</th>
            <th style="width: 6%;">ATK</th>
            <th style="width: 8%;">Akomodasi</th>
            <th style="width: 6%;">Lain-Lain</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      ${photoGalleryHtml ? `
        <div style="page-break-before: always; margin-top: 20px;"></div>
        <div class="title-box">
          LAMPIRAN DOKUMENTASI FOTO BUKTI NOTA & BUKTI TRANSFER<br>
          <span class="sub-title">[${projectName}]</span>
        </div>
        <div style="margin-top: 15px;">
          ${photoGalleryHtml}
          <div style="clear: both;"></div>
        </div>
      ` : ''}

      <div class="footer-stamp">
        ASET HARTONO MULYA JAYA KONSTRUKSI
      </div>
    </body>
    </html>
  `;
}

function generatePettyCashPDFReport(projectName, period, startDate = null, endDate = null) {
  const htmlContent = generatePettyCashHTMLReportContent(projectName, period, false, startDate, endDate);
  
  // 1. Buat temporary HTML file di Drive
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const tempFile = DriveApp.createFile(`Temp_Report_${safeName}_${Date.now()}.html`, htmlContent, MimeType.HTML);
  const fileId = tempFile.getId();

  // 2. Export via Google Docs Native PDF Converter dengan portrait=false (TRUE LANDSCAPE) & Tanpa Browser URL Footer!
  const exportUrl = `https://docs.google.com/feeds/download/documents/export/Export?id=${fileId}&exportFormat=pdf&portrait=false&size=A4&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4`;
  
  const options = {
    method: "get",
    headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };

  let pdfBlob;
  try {
    const resp = UrlFetchApp.fetch(exportUrl, options);
    if (resp.getResponseCode() === 200) {
      pdfBlob = resp.getBlob().setName(`Laporan_PettyCash_${safeName}_${getTodayDate()}.pdf`);
    } else {
      pdfBlob = tempFile.getAs(MimeType.PDF);
    }
  } catch (e) {
    Logger.log("Export fetch fallback: " + e.toString());
    pdfBlob = tempFile.getAs(MimeType.PDF);
  }

  // 3. Hapus temporary file
  tempFile.setTrashed(true);
  return pdfBlob;
}

// ------------------------------------------------------------------------------
// 8. DATABASE ENGINE (GOOGLE SHEETS CRUD)
// ------------------------------------------------------------------------------
function getDbSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function setupSheets() {
  const ss = getDbSpreadsheet();
  
  // Sheet Transactions — ID | Timestamp | UserId | UserName | Project | Date | Amount | Merchant | Category | RefNo | Type | Status | ApprovedBy | RejectReason | PhotoUrl | JobRole
  let sheetTx = ss.getSheetByName("Transactions");
  if (!sheetTx) {
    sheetTx = ss.insertSheet("Transactions");
    sheetTx.appendRow(["ID", "Timestamp", "UserId", "UserName", "Project", "Date", "Amount", "Merchant", "Category", "RefNo", "Type", "Status", "ApprovedBy", "RejectReason", "PhotoUrl", "JobRole"]);
    sheetTx.getRange("A1:P1").setFontWeight("bold").setBackground("#e2e8f0");
  } else {
    const headers = sheetTx.getRange(1, 1, 1, sheetTx.getLastColumn()).getValues()[0];
    if (headers.length < 16 || headers[15] !== "JobRole") {
      sheetTx.getRange(1, 16).setValue("JobRole");
      sheetTx.getRange(1, 16).setFontWeight("bold").setBackground("#e2e8f0");
    }
  }

  // Sheet TopUps
  let sheetTopup = ss.getSheetByName("TopUps");
  if (!sheetTopup) {
    sheetTopup = ss.insertSheet("TopUps");
    sheetTopup.appendRow(["ID", "Timestamp", "Project", "Amount", "RecordedBy"]);
    sheetTopup.getRange("A1:E1").setFontWeight("bold").setBackground("#e2e8f0");
  }

  // Sheet Projects
  let sheetProj = ss.getSheetByName("Projects");
  if (!sheetProj) {
    sheetProj = ss.insertSheet("Projects");
    sheetProj.appendRow(["ProjectName", "InitialBalance", "MinThreshold", "Status"]);
    sheetProj.getRange("A1:D1").setFontWeight("bold").setBackground("#e2e8f0");
  }

  // Sheet Users — skema baru: UserId | UserName | ActiveProject | JobRole | IsAdmin
  let sheetUser = ss.getSheetByName("Users");
  if (!sheetUser) {
    sheetUser = ss.insertSheet("Users");
    sheetUser.appendRow(["UserId", "UserName", "ActiveProject", "JobRole", "IsAdmin"]);
    sheetUser.getRange("A1:E1").setFontWeight("bold").setBackground("#e2e8f0");
  } else {
    // Migrasi otomatis: jika header kolom D masih "Role" (skema lama), tambahkan kolom E
    const headers = sheetUser.getRange(1, 1, 1, sheetUser.getLastColumn()).getValues()[0];
    if (headers[3] === "Role" || (headers.length < 5 || headers[4] !== "IsAdmin")) {
      sheetUser.getRange(1, 4).setValue("JobRole");
      if (headers.length < 5) {
        sheetUser.getRange(1, 5).setValue("IsAdmin");
      }
      // Migrasikan data: baris dengan Role="Admin" → JobRole="Pengawas", IsAdmin=TRUE
      // Baris lain → IsAdmin=FALSE, JobRole dipertahankan
      const lastRow = sheetUser.getLastRow();
      if (lastRow > 1) {
        for (let r = 2; r <= lastRow; r++) {
          const oldRole = sheetUser.getRange(r, 4).getValue();
          if (oldRole === "Admin") {
            sheetUser.getRange(r, 4).setValue("Pengawas"); // JobRole
            sheetUser.getRange(r, 5).setValue(true);       // IsAdmin
          } else {
            if (sheetUser.getRange(r, 5).getValue() === "") {
              sheetUser.getRange(r, 5).setValue(false);
            }
          }
        }
        Logger.log("Users sheet migrated to new schema (JobRole + IsAdmin)");
      }
    }
  }
}

function setCachedDraft(txId, txObj) {
  try {
    const cache = CacheService.getUserCache();
    cache.put("DRAFT_" + txId, JSON.stringify(txObj), 1800);
  } catch (e) {}
}

function getCachedDraft(txId) {
  try {
    const cache = CacheService.getUserCache();
    const data = cache.get("DRAFT_" + txId);
    if (data) return JSON.parse(data);
  } catch (e) {}
  return null;
}

function saveTransactionDraft(tx) {
  if (!tx.jobRole) {
    tx.jobRole = getUserJobRole(tx.userId) || JOB_PENGAWAS;
  }
  setCachedDraft(tx.id, tx);
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Transactions");
  sheet.appendRow([
    tx.id, new Date(), tx.userId, tx.userName, tx.project, tx.date, tx.amount, tx.merchant, tx.category, tx.refNo, tx.type, tx.status, "", "", tx.photoUrl, tx.jobRole
  ]);
}

// Helper tunggal penentu alur penyimpanan akhir transaksi berdasarkan JobRole pencatat
function saveFinalTransaction(tx, newStatus, approvedBy, rejectReason) {
  const currentJobRole = getUserJobRole(tx.userId) || tx.jobRole || JOB_PENGAWAS;
  tx.jobRole = currentJobRole;
  updateTransactionField(tx.id, "JobRole", currentJobRole);
  updateTransactionStatus(tx.id, newStatus, approvedBy, rejectReason);
}

function updateTransactionStatus(txId, newStatus, approvedBy, rejectReason) {
  const cached = getCachedDraft(txId);
  if (cached) {
    cached.status = newStatus;
    setCachedDraft(txId, cached);
  }

  const sheet = getDbSpreadsheet().getSheetByName("Transactions");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === txId) {
      sheet.getRange(i + 1, 12).setValue(newStatus); // Column L: Status
      if (approvedBy) sheet.getRange(i + 1, 13).setValue(approvedBy);
      if (rejectReason) sheet.getRange(i + 1, 14).setValue(rejectReason);
      break;
    }
  }
}

function updateTransactionField(txId, field, newValue) {
  const cached = getCachedDraft(txId);
  const fLower = String(field).toLowerCase();

  if (fLower === "merchant" && typeof newValue === "string") {
    newValue = toTitleCase(newValue);
  }

  if (cached) {
    if (fLower === "type") cached.type = newValue;
    else if (fLower === "category") cached.category = newValue;
    else if (fLower === "project") cached.project = newValue;
    else if (fLower === "amount") cached.amount = Number(newValue);
    else if (fLower === "merchant") cached.merchant = newValue;
    else if (fLower === "date") cached.date = newValue;
    else if (fLower === "photourl") cached.photoUrl = newValue;
    else if (fLower === "jobrole") cached.jobRole = newValue;
    setCachedDraft(txId, cached);
  }

  const colMap = {
    project: 5,
    date: 6,
    amount: 7,
    merchant: 8,
    category: 9,
    refno: 10,
    type: 11,
    photourl: 15,
    jobrole: 16
  };
  const colIdx = colMap[fLower];
  if (!colIdx) return;

  const sheet = getDbSpreadsheet().getSheetByName("Transactions");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === txId) {
      sheet.getRange(i + 1, colIdx).setValue(newValue);
      break;
    }
  }
}

function getTransactionById(txId) {
  const cached = getCachedDraft(txId);
  if (cached) return cached;

  const sheet = getDbSpreadsheet().getSheetByName("Transactions");
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === txId) {
      return {
        id: data[i][0],
        userId: data[i][2],
        userName: data[i][3],
        project: data[i][4],
        date: data[i][5],
        amount: Number(data[i][6]),
        merchant: data[i][7],
        category: data[i][8],
        refNo: data[i][9],
        type: data[i][10],
        status: data[i][11],
        photoUrl: data[i][14] || "",
        jobRole: data[i][15] || JOB_PENGAWAS,
        chatId: data[i][2]
      };
    }
  }
  return null;
}

function getProjectBalance(projectName) {
  setupSheets();
  const ss = getDbSpreadsheet();
  
  // 1. Get initial balance & min threshold
  let initialBalance = 0;
  let minThreshold = 500000;
  const projSheet = ss.getSheetByName("Projects");
  if (projSheet) {
    const projData = projSheet.getDataRange().getValues();
    for (let i = 1; i < projData.length; i++) {
      if (projData[i][0] === projectName) {
        initialBalance = Number(projData[i][1]) || 0;
        minThreshold = Number(projData[i][2]) || 500000;
        break;
      }
    }
  }

  let totalTopup = initialBalance;
  let totalExpense = 0;

  // 2. Sum TopUps from TopUps sheet
  const topupSheet = ss.getSheetByName("TopUps");
  if (topupSheet) {
    const topupData = topupSheet.getDataRange().getValues();
    for (let i = 1; i < topupData.length; i++) {
      if (topupData[i][2] === projectName) {
        totalTopup += Number(topupData[i][3]) || 0;
      }
    }
  }

  // 3. Sum Debit (TopUp/Uang Masuk) and Kredit (Expenses) from Transactions sheet
  const txSheet = ss.getSheetByName("Transactions");
  if (txSheet) {
    const txData = txSheet.getDataRange().getValues();
    for (let i = 1; i < txData.length; i++) {
      const pName = txData[i][4];
      const amount = Number(txData[i][6]) || 0;
      const category = String(txData[i][8] || "");
      const txType = String(txData[i][10] || "");
      const status = String(txData[i][11] || "");

      if (pName === projectName && status === "Approved") {
        if (txType === "Debit" || category.includes("Uang Masuk") || category.includes("TopUp")) {
          totalTopup += amount;
        } else {
          totalExpense += amount;
        }
      }
    }
  }

  return {
    projectName: projectName,
    initialBalance: initialBalance,
    totalTopup: totalTopup,
    totalExpense: totalExpense,
    remaining: totalTopup - totalExpense,
    minThreshold: minThreshold
  };
}

function addTopUpRecord(projectName, amount, recordedBy) {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("TopUps");
  const topUpId = "TP-" + Math.floor(100000 + Math.random() * 900000);
  sheet.appendRow([topUpId, new Date(), projectName, amount, recordedBy]);
}

function getProjectTransactions(projectName, startDate = null, endDate = null) {
  const sheet = getDbSpreadsheet().getSheetByName("Transactions");
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];

  const startOnly = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
  const endOnly = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][4] !== projectName) continue;

    if (startOnly && endOnly && data[i][5]) {
      let txDate = null;
      if (Object.prototype.toString.call(data[i][5]) === '[object Date]') {
        txDate = data[i][5];
      } else {
        const dStr = String(data[i][5]).trim();
        if (dStr.includes("-")) {
          const parts = dStr.split("-");
          if (parts.length === 3) txDate = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          txDate = new Date(dStr);
        }
      }

      if (txDate && !isNaN(txDate.getTime())) {
        const txOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
        if (txOnly < startOnly || txOnly > endOnly) continue;
      }
    }

    result.push({
      id: data[i][0],
      userId: data[i][2],
      userName: data[i][3],
      date: data[i][5],
      amount: Number(data[i][6]),
      merchant: data[i][7],
      category: data[i][8],
      refNo: data[i][9],
      type: data[i][10],
      status: data[i][11],
      photoUrl: data[i][14] || "",
      jobRole: data[i][15] || JOB_PENGAWAS
    });
  }
  return result;
}

// JobRole: menentukan alur transaksi (Pengawas = Petty Cash, Manajer = Kas Proyek)
const JOB_PENGAWAS = "Pengawas";
const JOB_MANAJER  = "Manajer";

// Backward-compat alias (dipakai di beberapa tempat yang belum direfactor)
const ROLE_PENGAWAS = JOB_PENGAWAS;
const ROLE_MANAJER  = JOB_MANAJER;
const ROLE_ADMIN    = "Admin"; // hanya untuk migrasi, jangan pakai untuk cek permission

function getUserNameById(userId) {
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  if (!sheet) return "";
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      return data[i][1] || "";
    }
  }
  return "";
}

// Kembalikan JobRole user (Pengawas / Manajer / null jika belum terdaftar)
function getUserJobRole(userId) {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      return data[i][3] || null; // kolom D: JobRole
    }
  }
  return null;
}

// Kembalikan true jika user memiliki IsAdmin = TRUE (kolom E)
function isAdmin(userId) {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      const val = data[i][4]; // kolom E: IsAdmin
      return val === true || String(val).toUpperCase() === "TRUE";
    }
  }
  // Fallback bootstrap: jika belum ada di sheet tapi adalah ADMIN_TELEGRAM_ID
  const adminId = getProperty("ADMIN_TELEGRAM_ID");
  return adminId && String(userId) === String(adminId);
}

// getUserRole: tetap ada untuk backward-compat (ensureRegisteredUser, check_role endpoint)
// Cek apakah user terdaftar di sheet. Jika bukan & adalah ADMIN_TELEGRAM_ID, bootstrap dulu.
function getUserRole(userId) {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");

  // Langkah 1: cari di sheet Users
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(userId)) {
        return data[i][3] || null; // kolom D: JobRole
      }
    }
  }

  // Langkah 2: belum ada — bootstrap jika ADMIN_TELEGRAM_ID
  const adminId = getProperty("ADMIN_TELEGRAM_ID");
  if (adminId && String(userId) === String(adminId)) {
    if (sheet) {
      const firstProject = getAllProjects();
      sheet.appendRow([
        String(userId),
        "Admin", // nama sementara, bisa diupdate
        firstProject.length > 0 ? firstProject[0] : "",
        JOB_PENGAWAS, // JobRole default owner = Pengawas
        true          // IsAdmin = TRUE
      ]);
      Logger.log("Bootstrap admin created for Telegram ID: " + userId);
    }
    return JOB_PENGAWAS;
  }

  // Langkah 3: bukan siapa-siapa
  return null;
}

function getProjectTopUps(projectName, startDate = null, endDate = null) {
  const sheet = getDbSpreadsheet().getSheetByName("TopUps");
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];

  const startOnly = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
  const endOnly = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][2] !== projectName) continue;

    const rawDate = data[i][1]; // kolom Timestamp
    const txDate = (Object.prototype.toString.call(rawDate) === '[object Date]') ? rawDate : new Date(rawDate);

    if (startOnly && endOnly && txDate && !isNaN(txDate.getTime())) {
      const txOnly = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
      if (txOnly < startOnly || txOnly > endOnly) continue;
    }

    result.push({
      id: data[i][0],
      date: toPlainDateString(txDate),
      amount: Number(data[i][3]) || 0,
      recordedBy: getUserNameById(data[i][4]) || String(data[i][4] || "")
    });
  }
  return result;
}

function getUserTransactions(userId, limit) {
  const sheet = getDbSpreadsheet().getSheetByName("Transactions");
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][2]) === String(userId)) {
      result.push({
        id: data[i][0],
        date: data[i][5],
        amount: Number(data[i][6]),
        merchant: data[i][7],
        category: data[i][8],
        status: data[i][11]
      });
      if (result.length >= limit) break;
    }
  }
  return result;
}

function getUserActiveProject(userId) {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      return data[i][2];
    }
  }
  const projects = getAllProjects();
  return projects.length > 0 ? projects[0] : "";
}

function setUserActiveProject(userId, projectName) {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      sheet.getRange(i + 1, 3).setValue(projectName);
      return;
    }
  }
  // Buat baris baru dengan 5 kolom (JobRole=Pengawas default, IsAdmin=false)
  sheet.appendRow([userId, "User", projectName, JOB_PENGAWAS, false]);
}

function getAllProjects() {
  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Projects");
  const data = sheet.getDataRange().getValues();
  const projects = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) projects.push(data[i][0]);
  }
  return projects;
}

// /aturrole [telegram_id] [pengawas|manajer] — khusus Admin
// Mengubah JobRole pengguna (tidak mempengaruhi IsAdmin)
function cmdAturRole(chatId, userId, args) {
  if (!isAdmin(userId)) {
    sendMessage(chatId, "⛔ *Akses Ditolak.* Hanya Admin yang dapat mengatur job role pengguna.");
    return;
  }

  if (!args || args.length < 2) {
    sendMessage(chatId, "⚠️ *Format Salah.*\nGunakan: `/aturrole [telegram_id] [pengawas|manajer]`\n*Contoh:* `/aturrole 123456789 manajer`");
    return;
  }

  const targetId = args[0];
  const roleInput = args[1].toLowerCase();

  let newJobRole;
  if (roleInput === "pengawas") {
    newJobRole = JOB_PENGAWAS;
  } else if (roleInput === "manajer") {
    newJobRole = JOB_MANAJER;
  } else {
    sendMessage(chatId, "⚠️ JobRole tidak dikenali. Gunakan `pengawas` atau `manajer`.\n\n💡 Untuk mengatur hak Admin, gunakan `/setadmin [telegram_id] [on|off]`");
    return;
  }

  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(targetId)) {
      sheet.getRange(i + 1, 4).setValue(newJobRole); // Kolom D: JobRole
      found = true;
      break;
    }
  }

  if (!found) {
    // Daftarkan user baru dengan JobRole yang diminta, IsAdmin=false
    sheet.appendRow([targetId, "User", "", newJobRole, false]);
  }

  sendMessage(chatId, `✅ *JobRole Berhasil Diubah!*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *Telegram ID:* \`${targetId}\`\n🏷️ *JobRole Baru:* *${newJobRole}*\n\n💡 Untuk memberi/mencabut hak Admin, gunakan:\n\`/setadmin ${targetId} on\` atau \`/setadmin ${targetId} off\``);
}

// /setadmin [telegram_id] [on|off] — khusus Admin
// Mengubah IsAdmin tanpa mempengaruhi JobRole
function cmdSetAdmin(chatId, userId, args) {
  if (!isAdmin(userId)) {
    sendMessage(chatId, "⛔ *Akses Ditolak.* Hanya Admin yang dapat mengubah hak akses admin.");
    return;
  }

  if (!args || args.length < 2) {
    sendMessage(chatId, "⚠️ *Format Salah.*\nGunakan: `/setadmin [telegram_id] [on|off]`\n*Contoh:* `/setadmin 123456789 on`");
    return;
  }

  const targetId = args[0];
  const onOff = args[1].toLowerCase();

  if (onOff !== "on" && onOff !== "off") {
    sendMessage(chatId, "⚠️ Nilai tidak valid. Gunakan `on` atau `off`.");
    return;
  }

  const newIsAdmin = (onOff === "on");

  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(targetId)) {
      sheet.getRange(i + 1, 5).setValue(newIsAdmin); // Kolom E: IsAdmin
      found = true;
      break;
    }
  }

  if (!found) {
    // Daftarkan user baru (JobRole=Pengawas default) dengan IsAdmin sesuai perintah
    sheet.appendRow([targetId, "User", "", JOB_PENGAWAS, newIsAdmin]);
  }

  const statusLabel = newIsAdmin ? "✅ *Admin (ON)*" : "❌ Bukan Admin (OFF)";
  sendMessage(chatId, `🔑 *Hak Admin Berhasil Diubah!*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *Telegram ID:* \`${targetId}\`\nIsAdmin: ${statusLabel}`);
}

// /listuser — tampilkan semua user, job role, & status admin, khusus Admin
function cmdListUser(chatId, userId) {
  if (!isAdmin(userId)) {
    sendMessage(chatId, "⛔ *Akses Ditolak.* Hanya Admin yang dapat melihat daftar pengguna.");
    return;
  }

  setupSheets();
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    sendMessage(chatId, "ℹ️ Belum ada user terdaftar.");
    return;
  }

  let text = "👥 *DAFTAR PENGGUNA*\n━━━━━━━━━━━━━━━━━━━━━━\n";
  for (let i = 1; i < data.length; i++) {
    const uid    = data[i][0];
    const uname  = data[i][1] || "(tanpa nama)";
    const ujob   = data[i][3] || JOB_PENGAWAS;
    const uadmin = (data[i][4] === true || String(data[i][4]).toUpperCase() === "TRUE");
    text += `👤 \`${uid}\` — ${uname}\n   💼 ${ujob}${uadmin ? "  🔑 Admin" : ""}\n`;
  }
  text += `\n💡 Ubah JobRole: \`/aturrole [id] [pengawas|manajer]\`\n🔑 Ubah Admin: \`/setadmin [id] [on|off]\``;

  sendMessage(chatId, text);
}

// User State Helper (Cache API)
function getUserState(userId) {
  const cache = CacheService.getUserCache();
  const val = cache.get("STATE_" + userId);
  return val ? JSON.parse(val) : null;
}

function setUserState(userId, stateObj) {
  const cache = CacheService.getUserCache();
  cache.put("STATE_" + userId, JSON.stringify(stateObj), 600); // 10 menit
}

function clearUserState(userId) {
  const cache = CacheService.getUserCache();
  cache.remove("STATE_" + userId);
}

// ------------------------------------------------------------------------------
// 9. TELEGRAM API UTILITIES
// ------------------------------------------------------------------------------
function sendMessage(chatId, text) {
  const token = getProperty("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown"
    })
  });
}

function sendDocument(chatId, blob, fileName, caption) {
  const token = getProperty("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendDocument`;

  const pdfFile = blob.setName(fileName || "Laporan_Petty_Cash.pdf");

  const payload = {
    chat_id: String(chatId),
    caption: caption || "",
    document: pdfFile
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  });
  Logger.log("sendDocument result: " + res.getContentText());
}

function sendMessageWithKeyboard(chatId, text, replyMarkup) {
  const token = getProperty("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
      reply_markup: replyMarkup
    })
  });
}

function editMessageText(chatId, messageId, text, replyMarkup) {
  const token = getProperty("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "Markdown"
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
}

function answerCallbackQuery(callbackQueryId, text) {
  const token = getProperty("TELEGRAM_BOT_TOKEN");
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: callbackQueryId, text: text })
  });
}

function notifyAdminForApproval(tx) {
  // Kirim notifikasi ke semua user yang memiliki role Admin di sheet Users
  const sheet = getDbSpreadsheet().getSheetByName("Users");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const adminIds = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]) === ROLE_ADMIN && data[i][0]) {
      adminIds.push(String(data[i][0]));
    }
  }
  // Fallback ke ADMIN_TELEGRAM_ID Script Property jika belum ada admin di sheet
  if (adminIds.length === 0) {
    const fallbackId = getProperty("ADMIN_TELEGRAM_ID");
    if (fallbackId) adminIds.push(fallbackId);
  }
  if (adminIds.length === 0) return;

  const msg = `🚨 *NOTIFIKASI APPROVAL TRANSAKSI BARU*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *ID:* \`${tx.id}\`\n` +
    `• *Oleh Staf:* ${tx.userName}\n` +
    `• *Proyek:* 🏗️ ${tx.project}\n` +
    `• *Nominal:* *Rp ${formatRupiah(tx.amount)}*\n` +
    `• *Merchant:* ${tx.merchant}\n` +
    `• *Kategori:* ${tx.category}\n` +
    `• *Tanggal:* ${tx.date}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Silakan pilih tindakan:`;

  const keyboard = {
    "inline_keyboard": [
      [
        { "text": "✅ Approve", "callback_data": `approve_${tx.id}` },
        { "text": "❌ Reject", "callback_data": `reject_${tx.id}` }
      ]
    ]
  };

  adminIds.forEach(adminId => sendMessageWithKeyboard(adminId, msg, keyboard));
}

function sendDocument(chatId, blob, fileName, caption) {
  const token = getProperty("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendDocument`;

  blob.setName(fileName);
  const payload = {
    chat_id: chatId,
    caption: caption,
    parse_mode: "Markdown",
    document: blob
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    payload: payload
  });
}

function sendHelpMessage(chatId, userName) {
  const text = "👋 Halo *" + userName + "*!\n" +
    "Selamat datang di *Bot Kas Kecil (Petty Cash)*. Bot ini membantu Anda mencatat pengeluaran & uang masuk kas proyek secara otomatis.\n\n" +
    "📸 *1. CARA CATAT PAKAI FOTO NOTA:*\n" +
    "Kirim foto nota/struk belanja atau screenshot bukti transfer ke chat ini.\n\n" +
    "📝 *2. CARA CATAT TANPA FOTO (TEKS):*\n" +
    "Ketik nominal & nama pengeluaran langsung di chat:\n" +
    "👉 *Contoh:* `50000 Nasi padang konsumsi`\n" +
    "👉 *Contoh:* `/catat 200000 Sewa alat`\n\n" +
    "📌 *3. DAFTAR PERINTAH TELEGRAM:*\n" +
    "• `/saldo` : Cek sisa uang kas proyek saat ini\n" +
    "• `/proyek` : Lihat atau ganti proyek aktif Anda\n" +
    "• `/topup [proyek] [nominal]` : Tambah saldo uang kas proyek\n" +
    "• `/rekap` : Download laporan PDF + foto bukti nota\n" +
    "• `/riwayat` : Lihat 10 riwayat transaksi terakhir\n" +
    "• `/tambahproyek [nama]` : Buat nama proyek baru (Khusus Admin)\n" +
    "• `/help` : Tampilkan petunjuk ini";
  sendMessage(chatId, text);
}

// Helpers
function formatRupiah(number) {
  return (number || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getTodayDate() {
  return Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
}

function toPlainDateString(dateVal) {
  if (!dateVal) return "";
  if (Object.prototype.toString.call(dateVal) === '[object Date]') {
    return Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd");
  }
  return String(dateVal);
}

function savePhotoToDrive(imgBlob, fileName) {
  try {
    const folders = DriveApp.getFoldersByName("Foto_Nota_PettyCash");
    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder("Foto_Nota_PettyCash");
    }
    const file = folder.createFile(imgBlob.setName(fileName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    Logger.log("Drive Save Error: " + e.toString());
    return "";
  }
}

function extractTextWithGoogleDriveOCR(imgBlob) {
  try {
    // Trigger Google Apps Script Drive OAuth Scope
    DriveApp.getRootFolder();

    // 1. Coba Drive Advanced Service jika diaktifkan
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.insert) {
      const resource = { title: "temp_ocr_doc", mimeType: "application/vnd.google-apps.document" };
      const docFile = Drive.Files.insert(resource, imgBlob, { ocr: true, ocrLanguage: "id" });
      const doc = DocumentApp.openById(docFile.id);
      const text = doc.getBody().getText();
      DriveApp.getFileById(docFile.id).setTrashed(true);
      return text;
    }
  } catch (e) {
    Logger.log("Drive Service OCR error: " + e.toString());
  }

  try {
    // 2. Fallback REST Drive API v2 menggunakan Token bawaan Apps Script
    const token = ScriptApp.getOAuthToken();
    const metadata = { title: "temp_ocr_doc", mimeType: "application/vnd.google-apps.document" };
    const boundary = "------BoundaryOcr" + Math.floor(Math.random() * 10000000);
    
    const postData = 
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: image/jpeg\r\n\r\n";

    const payloadBlob = Utilities.newBlob(postData).getBytes()
      .concat(imgBlob.getBytes())
      .concat(Utilities.newBlob("\r\n--" + boundary + "--").getBytes());

    const response = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart&ocr=true&ocrLanguage=id", {
      method: "post",
      headers: { "Authorization": "Bearer " + token },
      contentType: "multipart/mixed; boundary=" + boundary,
      payload: payloadBlob,
      muteHttpExceptions: true
    });

    const resJson = JSON.parse(response.getContentText());
    if (resJson && resJson.id) {
      const doc = DocumentApp.openById(resJson.id);
      const text = doc.getBody().getText();
      DriveApp.getFileById(resJson.id).setTrashed(true);
      return text;
    }
  } catch (err) {
    Logger.log("REST Drive OCR Error: " + err.toString());
  }
  return "";
}

function parseAmountString(str) {
  if (!str) return 0;
  let s = String(str).trim().toLowerCase();

  let multiplier = 1;
  let hasExplicitMultiplier = false;

  if (/(?:jt|juta)\b/i.test(s) || /[\d.,]\s*jt\b/i.test(s)) {
    multiplier = 1000000;
    hasExplicitMultiplier = true;
  } else if (/(?:rb|ribu)\b/i.test(s) || /[\d.,]\s*k\b/i.test(s)) {
    multiplier = 1000;
    hasExplicitMultiplier = true;
  } else if (/(?:m|milyar|miliar)\b/i.test(s)) {
    multiplier = 1000000000;
    hasExplicitMultiplier = true;
  }

  let cleanNumStr = s.replace(/[^0-9.,]/g, "");
  if (!cleanNumStr) return 0;

  // Jika tidak ada multiplier eksplisit, tapi inputnya berupa desimal singkat seperti 1.6 / 1,6 / 2.1 / 0.5
  if (!hasExplicitMultiplier) {
    const decimalMatch = cleanNumStr.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const whole = parseInt(decimalMatch[1], 10);
      const frac = decimalMatch[2];
      if (whole < 100) {
        multiplier = 1000000;
        cleanNumStr = `${whole}.${frac}`;
      }
    }
  }

  if (cleanNumStr.includes(",") && !cleanNumStr.includes(".")) {
    cleanNumStr = cleanNumStr.replace(",", ".");
  } else if (cleanNumStr.includes(",") && cleanNumStr.includes(".")) {
    cleanNumStr = cleanNumStr.replace(/\./g, "").replace(",", ".");
  } else if (cleanNumStr.includes(".")) {
    if (multiplier === 1) {
      const parts = cleanNumStr.split(".");
      if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
        cleanNumStr = cleanNumStr.replace(/\./g, "");
      }
    }
  }

  const val = parseFloat(cleanNumStr);
  if (isNaN(val)) return 0;

  return Math.round(val * multiplier);
}

function parseDateFromText(text) {
  if (!text) return { dateStr: "", matchedSubstring: "" };
  
  const isoMatch = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return { dateStr: `${isoMatch[1]}-${month}-${day}`, matchedSubstring: isoMatch[0] };
  }

  const dmyMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    return { dateStr: `${dmyMatch[3]}-${month}-${day}`, matchedSubstring: dmyMatch[0] };
  }

  const monthMap = {
    jan: "01", januari: "01",
    feb: "02", februari: "02",
    mar: "03", maret: "03",
    apr: "04", april: "04",
    may: "05", mei: "05",
    jun: "06", juni: "06",
    jul: "07", juli: "07",
    aug: "08", agustus: "08", ags: "08",
    sep: "09", september: "09",
    oct: "10", oktober: "10", okt: "10",
    nov: "11", november: "11",
    dec: "12", desember: "12", des: "12"
  };

  const matches = text.matchAll(/\b(0?[1-9]|[12]\d|3[01])[-/\s]*([a-z]{3,9})(?:[-/\s]*(20\d{2}))?\b/gi);
  for (const m of matches) {
    const day = m[1].padStart(2, "0");
    const mStr = m[2].substring(0, 3).toLowerCase();
    const month = monthMap[mStr];
    if (month) {
      const year = m[3] || new Date().getFullYear().toString();
      return { dateStr: `${year}-${month}-${day}`, matchedSubstring: m[0] };
    }
  }

  return { dateStr: "", matchedSubstring: "" };
}

function formatDisplayDate(dateVal) {
  if (!dateVal) return "";

  if (Object.prototype.toString.call(dateVal) === '[object Date]') {
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, "0");
    const d = String(dateVal.getDate()).padStart(2, "0");
    const monthMap = {
      "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
      "07": "Jul", "08": "Agt", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    };
    return `${d} ${monthMap[m] || m} ${y}`;
  }

  const s = String(dateVal).trim();

  if (s.includes("GMT") || s.includes("Waktu") || s.includes("00:00:00")) {
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getFullYear();
      const m = String(dObj.getMonth() + 1).padStart(2, "0");
      const d = String(dObj.getDate()).padStart(2, "0");
      const monthMap = {
        "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
        "07": "Jul", "08": "Agt", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
      };
      return `${d} ${monthMap[m] || m} ${y}`;
    }
  }

  const parts = s.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parts[0];
    const monthMap = {
      "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
      "07": "Jul", "08": "Agt", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    };
    const monthName = monthMap[parts[1]] || parts[1];
    const day = parts[2];
    return `${day} ${monthName} ${year}`;
  }
  return s;
}

function toTitleCase(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .split(" ")
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function detectTransactionTypeAndCategory(text) {
  const tLower = (text || "").toLowerCase();
  
  const expenseKeywords = [
    "bayar", "beli", "pembelian", "biaya", "ongkir", "sewa", "kredit", "pengeluaran",
    "gaji", "upah", "honor", "lembur", "mandor", "kasbon", "tukang",
    "semen", "pasir", "batu", "cat", "paku", "baut", "besi", "kayu", "pipa", "kabel", "keramik", "bata", "triplek", "material", "bahan",
    "rental", "rent", "bor", "cangkul", "helm", "rompi", "mesin", "alat", "genset", "molen",
    "kertas", "pena", "pulpen", "spidol", "materai", "print", "fotocopy", "buku", "atk", "tinta",
    "bensin", "pertalite", "pertamax", "solar", "tol", "parkir", "makan", "minum", "konsumsi", "nasi", "ojek", "grab", "gojek", "travel", "tiket", "makanan"
  ];

  let isExpense = false;
  for (let kw of expenseKeywords) {
    if (tLower.includes(kw)) {
      isExpense = true;
      break;
    }
  }

  // Jika tidak ada kata pengeluaran (bayar/beli/sewa/dll), maka DEFAULT ADALAH UANG MASUK (DEBIT)
  if (!isExpense) {
    return { type: "Debit", category: "Uang Masuk / TopUp" };
  }

  let category = "Lain-Lain";
  const catRules = [
    { cat: "Akomodasi", keywords: ["kontrakan", "sewa rumah", "sewa mess", "bensin", "pertalite", "pertamax", "solar", "tol", "parkir", "makan", "minum", "konsumsi", "nasi", "ojek", "grab", "gojek", "travel", "tiket", "makanan"] },
    { cat: "Upah", keywords: ["tukang", "gaji", "upah", "honor", "lembur", "mandor", "kasbon"] },
    { cat: "Material", keywords: ["semen", "pasir", "batu", "cat", "paku", "baut", "besi", "kayu", "pipa", "kabel", "keramik", "bata", "triplek", "material", "bahan"] },
    { cat: "Alat", keywords: ["sewa alat", "rental", "rent", "bor", "cangkul", "helm", "rompi", "mesin", "genset", "molen"] },
    { cat: "ATK", keywords: ["kertas", "pena", "pulpen", "spidol", "materai", "print", "fotocopy", "buku", "atk", "tinta"] }
  ];

  for (let rule of catRules) {
    for (let kw of rule.keywords) {
      if (tLower.includes(kw)) {
        category = rule.cat;
        break;
      }
    }
    if (category !== "Lain-Lain") break;
  }

  return { type: "Kredit", category: category };
}

// Function bantu untuk meng-authorize izin Google DriveApp & SpreadsheetApp di Apps Script
function testAuthPermissions() {
  Logger.log("Testing permissions...");
  const folder = DriveApp.getRootFolder();
  Logger.log("Drive Root Folder: " + folder.getName());
  Logger.log("Google Drive & Sheets Permissions OK! ✅");
}

function DEBUG_cekToken() {
  const token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  const adminId = PropertiesService.getScriptProperties().getProperty("ADMIN_TELEGRAM_ID");
  Logger.log("TELEGRAM_BOT_TOKEN (Apps Script): " + token);
  Logger.log("ADMIN_TELEGRAM_ID (Apps Script): " + adminId);
}
