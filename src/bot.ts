import TelegramBot from "node-telegram-bot-api";
import http from "http";
import { generatePDFBuffer, ProjectReportData, Transaction } from "./pdfGenerator";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec";

if (!TELEGRAM_TOKEN) {
  console.error("\n❌ ERROR: TELEGRAM_BOT_TOKEN belum diisi!");
  process.exit(1);
}

const isCloud = Boolean(process.env.RENDER || process.env.PORT);
const PORT = process.env.PORT || 3000;

const bot = isCloud 
  ? new TelegramBot(TELEGRAM_TOKEN)
  : new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log(`🚀 Starting Petty Cash Node.js Bot (Mode: ${isCloud ? "Cloud Webhook" : "Local Polling"})...`);

function getTodayFormatted(): string {
  const now = new Date();
  return now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function getMonthYearLabel(): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const now = new Date();
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

async function checkUserRole(telegramId: number | string): Promise<string | null> {
  try {
    const url = `${APPS_SCRIPT_WEBHOOK_URL}?action=check_role&telegram_id=${telegramId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    return json && json.role ? json.role : null;
  } catch (err) {
    console.error("❌ Error checking role:", err);
    return null;
  }
}

function mapTopUpsToTransactions(topups: any[]): Transaction[] {
  if (!Array.isArray(topups)) return [];
  return topups.map((tp: any) => ({
    date: tp.date,
    description: `Top Up Kas Proyek${tp.recordedBy ? " oleh " + tp.recordedBy : ""}`,
    type: "Debit" as const,
    amount: Number(tp.amount) || 0,
    note: "Kas Proyek"
  }));
}

function sortTransactionsByDate(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => {
    const da = new Date(a.date || "").getTime();
    const db = new Date(b.date || "").getTime();
    if (isNaN(da) || isNaN(db)) return 0;
    return da - db;
  });
}

// 1. Command /start & /help
bot.onText(/\/(start|help)/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `
🤖 <b>SISTEM PETTY CASH AUTOMATION</b>
──────────────────────────────
📌 <b>FORMAT PATEN PENCATATAN TRANSAKSI (SEMUA ROLE):</b>

Format Standar Wajib:
<code>[TanggalBulan] [Deskripsi] [Nominal] [Keterangan / Isi Nota]</code>

💡 <b>Penjelasan Komponen:</b>
• <b>TanggalBulan</b> : Tanggal & bulan (contoh: <code>02agustus</code>, <code>24juli</code>)
• <b>Deskripsi</b> : Ringkasan transaksi / nomor nota (contoh: <code>beli nota 1</code>)
• <b>Nominal</b> : Nilai angka pengeluaran (contoh: <code>150rb</code>, <code>1.6jt</code>, <code>50.000</code>)
• <b>Keterangan</b> : Rincian item dari nota (contoh: <code>paku beton 5kg, meteran 1</code>)

📝 <b>Contoh Pesan Transaksi:</b>
• <code>02agustus beli nota 1 150rb paku beton 5kg, meteran 1</code>
• <code>24juli bayar kontrakan 1.6jt kontrakan tukang pek. pulomas</code>
• <code>05agustus beli nota 2 45rb spidol 2, kertas A4 1 rim</code>

📷 <i>Catatan: Format paten ini berlaku untuk <u>semua role</u>, baik kirim pesan teks langsung maupun caption pada foto nota.</i>

──────────────────────────────
📊 <b>DAFTAR COMMAND:</b>

👤 <b>Semua User (Pengawas, Manajer, Admin):</b>
• <code>/saldo</code> — Cek Saldo Terkini Proyek Aktif
• <code>/proyek</code> — Ganti / Pilih Proyek Aktif
• <code>/riwayat</code> — Lihat 10 Transaksi Terakhir
• <code>/rekap</code> atau <code>/laporan</code> — Laporan PDF Petty Cash

👔 <b>Khusus Manajer & Admin:</b>
• <code>/rekapgabungan</code> — Laporan Gabungan (Petty Cash + Kas Proyek)
• <code>/topup [Proyek] [Nominal]</code> — Tambah Top-Up Saldo Kas

🔑 <b>Khusus Admin:</b>
• <code>/tambahproyek [Nama Proyek]</code> — Buat Proyek Baru
• <code>/aturrole [telegram_id] [pengawas|manajer]</code> — Atur JobRole User
• <code>/setadmin [telegram_id] [on|off]</code> — Beri/Cabut Hak Admin
• <code>/listuser</code> — Tampilkan Semua User & Role

🏷️ <b>INFO ROLE:</b>
• <b>Pengawas</b> — Catat transaksi Petty Cash, cek saldo & rekap
• <b>Manajer</b> — Catat transaksi Kas Proyek + laporan gabungan & top-up
• <b>IsAdmin ON</b> — Hak akses sistem penuh
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: "HTML" });
});

function sendUnregisteredNotice(chatId: number, telegramId: number) {
  const adminUsername = (process.env.ADMIN_TELEGRAM_USERNAME || "").replace(/^@/, "").trim();
  const adminContact = adminUsername
    ? `@${adminUsername}\n\natau\n\nhttps://t.me/${adminUsername}`
    : "Admin";

  const msg = `🔒 <b>Akun Belum Terdaftar</b>\n\n` +
    `Akun Telegram Anda belum terdaftar pada sistem Kas Proyek.\n\n` +
    `Silakan screenshot pesan ini dan kirimkan kepada Admin untuk didaftarkan.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🆔 <b>Telegram ID</b>\n<code>${telegramId}</code>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👤 <b>Hubungi Admin</b>\n\n` +
    `${adminContact}\n\n` +
    `Setelah akun Anda didaftarkan, kirim kembali /start.`;

  bot.sendMessage(chatId, msg, { parse_mode: "HTML" });
}

// 2a. Command /rekap atau /laporan -> Laporan PETTY CASH SAJA
bot.onText(/^\/(rekap|laporan)(@\w+)?(\s|$)/i, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;

  if (!telegramId) return;

  bot.sendChatAction(chatId, "upload_document").catch(() => {});
  const progressMsg = await bot.sendMessage(
    chatId,
    "⏳ <b>Sedang menyusun laporan PDF Petty Cash...</b>\n<i>Mohon tunggu beberapa saat.</i>",
    { parse_mode: "HTML" }
  ).catch(() => null);

  try {
    const role = await checkUserRole(telegramId);

    if (!role) {
      if (progressMsg) {
        await bot.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
      }
      sendUnregisteredNotice(chatId, telegramId);
      return;
    }

    await sendPettyCashReport(chatId, telegramId, role, false, progressMsg ? progressMsg.message_id : null);
  } catch (err: any) {
    if (progressMsg) {
      await bot.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
    }
    bot.sendMessage(chatId, `❌ Gagal memproses rekap: ${err.message}`);
  }
});

// 2b. Command /rekapgabungan -> Laporan GABUNGAN (Petty Cash + Kas Proyek), khusus Manajer/Admin
bot.onText(/^\/rekapgabungan(@\w+)?(\s|$)/i, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;

  if (!telegramId) return;

  bot.sendChatAction(chatId, "upload_document").catch(() => {});
  const progressMsg = await bot.sendMessage(
    chatId,
    "⏳ <b>Sedang menyusun Laporan Gabungan (Petty Cash + Kas Proyek)...</b>\n<i>Mohon tunggu beberapa saat.</i>",
    { parse_mode: "HTML" }
  ).catch(() => null);

  try {
    const role = await checkUserRole(telegramId);

    if (!role) {
      if (progressMsg) {
        await bot.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
      }
      sendUnregisteredNotice(chatId, telegramId);
      return;
    }

    if (role === "Pengawas") {
      if (progressMsg) {
        await bot.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
      }
      bot.sendMessage(chatId,
        `⛔ <b>Akses Ditolak.</b>\nLaporan Gabungan (Petty Cash + Kas Proyek) khusus untuk role <b>Manajer Proyek</b> / <b>Admin</b>.\nRole Anda saat ini: <b>${role}</b>\n\n💡 Gunakan <code>/rekap</code> untuk laporan Petty Cash Anda.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    await sendPettyCashReport(chatId, telegramId, role, /* includeKasProyek */ true, progressMsg ? progressMsg.message_id : null);
  } catch (err: any) {
    if (progressMsg) {
      await bot.deleteMessage(chatId, progressMsg.message_id).catch(() => {});
    }
    bot.sendMessage(chatId, `❌ Gagal memproses rekap gabungan: ${err.message}`);
  }
});

async function getUserActiveProjectFromScript(telegramId: number | string): Promise<string> {
  try {
    const url = `${APPS_SCRIPT_WEBHOOK_URL}?action=get_active_project&telegram_id=${telegramId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "Proyek Utama";
    const json: any = await res.json();
    return json && json.activeProject ? json.activeProject : "Proyek Utama";
  } catch (err) {
    console.error("❌ Error fetching active project:", err);
    return "Proyek Utama";
  }
}

// Fungsi inti pembuat & pengirim laporan, dipakai oleh kedua command di atas
async function sendPettyCashReport(
  chatId: number,
  telegramId: number,
  role: string,
  includeKasProyek: boolean = false,
  progressMsgId: number | null = null
) {
  try {
    bot.sendChatAction(chatId, "upload_document").catch(() => {});

    let transactions: Transaction[] = [];
    let projectName = await getUserActiveProjectFromScript(telegramId);
    let periodLabel = "Semua Riwayat";

    try {
      const jsonUrl = `${APPS_SCRIPT_WEBHOOK_URL}?action=json_data&project=${encodeURIComponent(projectName)}`;
      console.log("🔍 Fetching transactions from:", jsonUrl);

      const res = await fetch(jsonUrl, { signal: AbortSignal.timeout(60000) });
      const rawText = await res.text();

      if (res.ok && !rawText.trim().startsWith("<!doctype") && !rawText.trim().startsWith("<html")) {
        const json: any = JSON.parse(rawText);

        if (json && json.transactions && Array.isArray(json.transactions)) {
          transactions = json.transactions.map((t: any) => ({
            ...t,
            description: t.merchant || t.description || ""
          }));

          // Kalau laporan Petty Cash saja -> ambil seluruh transaksi Petty Cash proyek
          if (!includeKasProyek) {
            transactions = transactions.filter((t: any) => t.jobRole !== "Manajer");
          }

          if (includeKasProyek && json.topups) {
            const topupTx = mapTopUpsToTransactions(json.topups);
            transactions = sortTransactionsByDate(transactions.concat(topupTx));
          }
        }

        if (json.projectName) projectName = json.projectName;
        if (json.period) periodLabel = json.period;
      } else {
        console.error("❌ json_data fetch gagal atau mengembalikan HTML:", rawText.slice(0, 200));
        throw new Error("Gagal mengambil data dari Google Sheet (respon server tidak valid / timeout).");
      }
    } catch (err: any) {
      console.error("❌ Error fetch json_data:", err.message);
      throw err;
    }

    if (transactions.length === 0) {
      if (progressMsgId) {
        bot.deleteMessage(chatId, progressMsgId).catch(() => {});
      }
      bot.sendMessage(
        chatId,
        `ℹ️ <b>Belum ada data transaksi yang tercatat untuk proyek:</b>\n🏗️ <b>${projectName}</b>\n\n💡 <i>Silakan catat transaksi baru terlebih dahulu sebelum mengunduh rekap.</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    let totalDebit = 0;
    let totalKredit = 0;
    transactions.forEach(t => {
      if (t.type === "Debit") totalDebit += t.amount;
      else totalKredit += t.amount;
    });
    const saldoTerkini = totalDebit - totalKredit;

    const reportTypeLabel = includeKasProyek ? "Gabungan (Petty Cash + Kas Proyek)" : "Petty Cash";
    const scopeLabel = (role === "Pengawas" && !includeKasProyek) ? " — Transaksi Anda" : "";

    const summaryCaption = `
📊 <b>LAPORAN KEUANGAN ${reportTypeLabel.toUpperCase()}${scopeLabel}</b>
━━━━━━━━━━━━━━━━━━━━━━
🏗️ <b>Proyek:</b> ${projectName}
📅 <b>Periode:</b> ${getMonthYearLabel()}

💵 <b>Total Top-Up/Debit:</b> Rp ${totalDebit.toLocaleString("id-ID")}
💸 <b>Total Pengeluaran:</b> Rp ${totalKredit.toLocaleString("id-ID")}
💰 <b>Saldo Terkini:</b> Rp ${saldoTerkini.toLocaleString("id-ID")}
━━━━━━━━━━━━━━━━━━━━━━
📄 <i>File Laporan PDF Resmi (A4 Landscape) Terlampir:</i>
    `.trim();

    const reportData: ProjectReportData = {
      projectName: projectName,
      year: `${getMonthYearLabel()} — ${reportTypeLabel}`,
      transactions: transactions
    };

    bot.sendChatAction(chatId, "upload_document").catch(() => {});
    const pdfBuffer = await generatePDFBuffer(reportData);
    const safeProj = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeType = includeKasProyek ? "Gabungan" : "PettyCash";
    const fileName = `Laporan_${safeType}_${safeProj}_${getTodayFormatted().replace(/\s+/g, "_")}.pdf`;

    await bot.sendDocument(chatId, pdfBuffer, {
      caption: summaryCaption,
      parse_mode: "HTML"
    }, {
      filename: fileName,
      contentType: "application/pdf"
    });

    if (progressMsgId) {
      bot.deleteMessage(chatId, progressMsgId).catch(() => {});
    }

  } catch (err: any) {
    console.error("Error generating PDF in bot:", err);
    if (progressMsgId) {
      bot.deleteMessage(chatId, progressMsgId).catch(() => {});
    }
    bot.sendMessage(chatId, `❌ Gagal membuat laporan PDF: ${err.message}`);
  }
}

// Command yang DITANGANI LANGSUNG oleh bot.ts (butuh pdfkit / Node.js)
// Selain pola ini, semua update diteruskan mentah-mentah ke Kode.gs.
const OWNED_BY_NODE = /^\/(start|help|rekapgabungan|rekap|laporan)(@\w+)?(\s|$)/i;

// Setup HTTP Server untuk Health Check Render.com & Webhook Receiver
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === `/webhook/${TELEGRAM_TOKEN}`) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      let update: any = null;
      try {
        update = JSON.parse(body);
      } catch (e) {
        console.error("❌ Error parsing update:", e);
        res.writeHead(200);
        res.end("OK");
        return;
      }

      const text = (update?.message?.text || "").trim();
      const isOwnedByNode = OWNED_BY_NODE.test(text);

      if (isOwnedByNode) {
        // /start /help /rekap /laporan /rekapgabungan -> ditangani di sini (butuh pdfkit)
        bot.processUpdate(update);
      } else {
        // Semua yang lain: foto nota, teks transaksi bebas, /catat, /topup, /proyek,
        // /saldo, /riwayat, /tambahproyek, /aturrole, /listuser, dan SEMUA tombol
        // inline (callback_query: konfirmasi/edit/batal/approve/reject/pilih kategori/proyek)
        // -> diteruskan ke Kode.gs yang sudah lengkap menangani ini & membalas user langsung.
        try {
          const fwdRes = await fetch(APPS_SCRIPT_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(update)
          });
          console.log("↪️ Forwarded to Apps Script, status:", fwdRes.status);
        } catch (err) {
          console.error("❌ Gagal forward update ke Apps Script:", err);
        }
      }

      res.writeHead(200);
      res.end("OK");
    });
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Petty Cash Telegram Bot is Active! 🚀\n");
  }
});

const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL
  || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : "https://petty-cash-telegram-bot.onrender.com");

server.listen(PORT, async () => {
  console.log(`🌐 HTTP Server listening on port ${PORT}`);
  if (isCloud) {
    const webhookUrl = `${RENDER_EXTERNAL_URL}/webhook/${TELEGRAM_TOKEN}`;
    try {
      await bot.setWebHook(webhookUrl);
      console.log(`✅ Telegram Webhook set to: ${webhookUrl}`);
    } catch (err: any) {
      console.error("❌ Failed to set Telegram Webhook:", err.message);
    }
  } else {
    console.log("✅ Bot is online in local polling mode!");
  }
});
