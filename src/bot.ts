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
🤖 <b>SISTEM PETTY CASH HMJ (NODE.JS + PDFKIT FAST ENGINE)</b>
──────────────────────────────
📌 <b>FORMAT PENCATATAN TRANSAKSI:</b>
Ketik pesan transaksi atau kirim foto nota langsung:
• <code>24juli 1.6jt bayar kontrakan tukang pek. pulomas</code>
• <code>400rb kas pek. pulomas 1</code>
• <code>10rb spidol</code>

📊 <b>COMMAND KELOLA PROYEK & LAPORAN:</b>
• <code>/rekap</code> atau <code>/laporan</code> : Laporan PDF Petty Cash
• <code>/rekapgabungan</code> : Laporan PDF Gabungan (Petty Cash + Kas Proyek) — khusus Manajer/Admin
• <code>/saldo</code> : Cek Rincian Saldo & Histori Proyek Aktif
• <code>/proyek</code> : Cek Informasi Proyek Aktif Saat Ini
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: "HTML" });
});

// 2a. Command /rekap atau /laporan -> Laporan PETTY CASH SAJA
bot.onText(/^\/(rekap|laporan)(@\w+)?(\s|$)/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;

  if (!telegramId) return;

  const role = await checkUserRole(telegramId);

  if (!role) {
    bot.sendMessage(chatId,
      `🔒 <b>Akun Anda belum terdaftar.</b>\nSilakan hubungi Admin untuk didaftarkan.\n\n📋 Telegram ID Anda: <code>${telegramId}</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  await sendPettyCashReport(chatId, telegramId, role);
});

// 2b. Command /rekapgabungan -> Laporan GABUNGAN (Petty Cash + Kas Proyek), khusus Manajer/Admin
bot.onText(/^\/rekapgabungan(@\w+)?(\s|$)/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id;

  if (!telegramId) return;

  const role = await checkUserRole(telegramId);

  if (!role) {
    bot.sendMessage(chatId,
      `🔒 <b>Akun Anda belum terdaftar.</b>\nSilakan hubungi Admin untuk didaftarkan.\n\n📋 Telegram ID Anda: <code>${telegramId}</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (role === "Pengawas") {
    bot.sendMessage(chatId,
      `⛔ <b>Akses Ditolak.</b>\nLaporan Gabungan (Petty Cash + Kas Proyek) khusus untuk role <b>Manajer Proyek</b> / <b>Admin</b>.\nRole Anda saat ini: <b>${role}</b>\n\n💡 Gunakan <code>/rekap</code> untuk laporan Petty Cash Anda.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  await sendPettyCashReport(chatId, telegramId, role, /* includeKasProyek */ true);
});

// Fungsi inti pembuat & pengirim laporan, dipakai oleh kedua command di atas
async function sendPettyCashReport(chatId: number, telegramId: number, role: string, includeKasProyek: boolean = false) {
  try {
    let transactions: Transaction[] = [];
    let projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";
    let periodLabel = "Semua Riwayat";

    try {
      const jsonUrl = `${APPS_SCRIPT_WEBHOOK_URL}?action=json_data&project=${encodeURIComponent(projectName)}`;
      console.log("🔍 Fetching transactions from:", jsonUrl);

      const res = await fetch(jsonUrl);
      const rawText = await res.text();

      if (res.ok && !rawText.trim().startsWith("<!doctype") && !rawText.trim().startsWith("<html")) {
        const json: any = JSON.parse(rawText);

        if (json && json.transactions && Array.isArray(json.transactions)) {
          transactions = json.transactions.map((t: any) => ({
            ...t,
            description: t.merchant || t.description || ""
          }));

          // Kalau role Pengawas & laporan Petty Cash saja -> filter HANYA transaksi milik dirinya sendiri
          if (role === "Pengawas") {
            transactions = transactions.filter((t: any) => String(t.userId) === String(telegramId));
          }

          if (includeKasProyek && json.topups) {
            const topupTx = mapTopUpsToTransactions(json.topups);
            transactions = sortTransactionsByDate(transactions.concat(topupTx));
          }
        }

        if (json.projectName) projectName = json.projectName;
        if (json.period) periodLabel = json.period;
      } else {
        console.error("❌ json_data fetch gagal atau mengembalikan HTML");
      }
    } catch (err) {
      console.error("❌ Error fetch json_data:", err);
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

  } catch (err: any) {
    console.error("Error generating PDF in bot:", err);
    bot.sendMessage(chatId, `❌ Gagal membuat laporan PDF: ${err.message}`);
  }
}

// 3. Command /saldo
bot.onText(/\/saldo/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
💰 <b>INFORMASI SALDO PROYEK</b>
📌 Proyek: <b>PERPUSTAKAAN LANTAI 10 - PULOMAS</b>
──────────────────────────────
📥 Total Top-Up (Debit): Rp 2.000.000
📤 Total Pengeluaran (Kredit): Rp 1.735.000
💵 <b>Saldo Terkini: Rp 265.000</b>
  `, { parse_mode: "HTML" });
});

// 4. Command /proyek atau /project
bot.onText(/\/(proyek|project)/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
🏗️ <b>INFORMASI PROYEK AKTIF</b>
──────────────────────────────
📌 Nama Proyek: <b>PERPUSTAKAAN LANTAI 10 - PULOMAS</b>
📊 Status: <b>Aktif</b>
💡 Ketik <code>/saldo</code> untuk cek saldo terkini.
💡 Ketik <code>/rekap</code> untuk download laporan PDF resmi.
  `, { parse_mode: "HTML" });
});

// Setup HTTP Server untuk Health Check Render.com & Webhook Receiver
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === `/webhook/${TELEGRAM_TOKEN}`) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const update = JSON.parse(body);
        bot.processUpdate(update);
      } catch (e) {
        console.error("Error processing update:", e);
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
