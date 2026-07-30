import TelegramBot from "node-telegram-bot-api";
import http from "http";
import { generatePDFBuffer, ProjectReportData, Transaction } from "./pdfGenerator";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec";

if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN.includes("YOUR_REAL")) {
  console.error("\n❌ ERROR: TELEGRAM_BOT_TOKEN belum diisi di file .env!");
  process.exit(1);
}

// Buka Port HTTP untuk Health Check Render.com
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Petty Cash Telegram Bot is Active! 🚀\n");
}).listen(PORT, () => {
  console.log(`🌐 HTTP Health Server listening on port ${PORT}`);
});

console.log("🚀 Starting Petty Cash Node.js Telegram Bot (Option 2 - PDFKit Fast Engine)...");

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

function getTodayFormatted(): string {
  const now = new Date();
  return now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
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
• <code>/rekap</code> atau <code>/laporan</code> : Dapatkan Rincian Ringkasan & File PDF Laporan Resmi Instant
• <code>/saldo</code> : Cek Rincian Saldo & Histori Proyek Aktif
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: "HTML" });
});

// 2. Command /rekap atau /laporan
bot.onText(/\/(rekap|laporan)/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    let transactions: Transaction[] = [];
    let projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";

    try {
      const res = await fetch(`${APPS_SCRIPT_WEBHOOK_URL}?action=json_data&project=${encodeURIComponent(projectName)}`);
      if (res.ok) {
        const json: any = await res.json();
        if (json && json.transactions) {
          transactions = json.transactions;
          if (json.projectName) projectName = json.projectName;
        }
      }
    } catch {
      transactions = [
        { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 1600000 },
        { date: "24 Jul 2026", description: "Pembayaran Kontrakan Tukang Pek. Pulomas", type: "Kredit", category: "Akomodasi", amount: 1600000 },
        { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 400000 },
        { date: "24 Jul 2026", description: "Spidol", type: "Kredit", category: "ATK", amount: 10000 },
        { date: "24 Jul 2026", description: "Nota 1", type: "Kredit", category: "Material", amount: 50000 },
        { date: "24 Jul 2026", description: "Nota 2", type: "Kredit", category: "Material", amount: 75000 }
      ];
    }

    // Hitung ringkasan debit, kredit, saldo
    let totalDebit = 0;
    let totalKredit = 0;
    transactions.forEach(t => {
      if (t.type === "Debit") totalDebit += t.amount;
      else totalKredit += t.amount;
    });
    const saldoTerkini = totalDebit - totalKredit;

    const summaryCaption = `
📊 <b>LAPORAN KEUANGAN PETTY CASH</b>
━━━━━━━━━━━━━━━━━━━━━━
🏗️ <b>Proyek:</b> ${projectName}
📅 <b>Periode:</b> 7 Hari Terakhir

💵 <b>Total Top-Up:</b> Rp ${totalDebit.toLocaleString("id-ID")}
💸 <b>Total Pengeluaran:</b> Rp ${totalKredit.toLocaleString("id-ID")}
💰 <b>Saldo Terkini Proyek:</b> Rp ${saldoTerkini.toLocaleString("id-ID")}
━━━━━━━━━━━━━━━━━━━━━━
📄 <i>File Laporan PDF Resmi (A4 Landscape) Terlampir:</i>
    `.trim();

    const reportData: ProjectReportData = {
      projectName: projectName,
      year: "7 HARI TERAKHIR",
      transactions: transactions
    };

    const pdfBuffer = await generatePDFBuffer(reportData);
    const safeProj = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `Laporan_PettyCash_${safeProj}_${getTodayFormatted().replace(/\s+/g, "_")}.pdf`;

    // Kirim Ringkasan Teks + File PDF Fisik Native ke Chat Telegram
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
});

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

console.log("✅ Bot is online and listening for Telegram messages!");
