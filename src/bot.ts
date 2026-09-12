import TelegramBot from "node-telegram-bot-api";
import http from "http";
import { generatePDFBuffer, ProjectReportData, Transaction } from "./pdfGenerator";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const APPS_SCRIPT_WEBHOOK_URL = process.env.APPS_SCRIPT_URL || "";
const API_SECRET = process.env.RENDER_SECRET_KEY || "PETTYCASH_SECRET_DEFAULT";
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN || !APPS_SCRIPT_WEBHOOK_URL) {
  console.error("\n❌ ERROR: TELEGRAM_BOT_TOKEN atau APPS_SCRIPT_URL belum diisi!");
  process.exit(1);
}

// Bot instance HANYA digunakan untuk push file PDF ke Telegram, bukan listener.
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

console.log(`🚀 Starting PDF Microservice Worker on port ${PORT}...`);

// ==========================================
// API Fetcher Utility (DRY Principle)
// ==========================================
async function fetchAppsScriptAPI<T>(action: string, params: Record<string, string | number> = {}): Promise<T | null> {
  try {
    const url = new URL(APPS_SCRIPT_WEBHOOK_URL);
    url.searchParams.append("action", action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, String(value));
    }

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    
    const text = await res.text();
    if (text.startsWith("<!doctype") || text.startsWith("<html")) return null;
    
    return JSON.parse(text) as T;
  } catch (err) {
    console.error(`❌ API Error [${action}]:`, err);
    return null;
  }
}

// ==========================================
// HTTP REST Server (Dipanggil oleh Apps Script)
// ==========================================
const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/generate-pdf") {
    
    // 1. Verifikasi Keamanan Endpoint
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${API_SECRET}`) {
      res.writeHead(401);
      return res.end("Unauthorized");
    }

    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const { chatId, telegramId, includeKasProyek } = payload;
        
        if (!chatId || !telegramId) {
          res.writeHead(400);
          return res.end("Missing parameters");
        }

        // Cepat respon Apps Script agar tidak timeout di sisi Google (Fire & Forget trick)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "processing" }));

        // 2. Ambil Konteks Proyek
        const dataProj = await fetchAppsScriptAPI<{ activeProject?: string }>("get_active_project", { telegram_id: telegramId });
        const projectName = dataProj?.activeProject || "Proyek Utama";

        // 3. Ambil Transaksi & TopUp
        const dataJson = await fetchAppsScriptAPI<any>("json_data", { project: projectName });
        if (!dataJson || !Array.isArray(dataJson.transactions)) {
          await bot.sendMessage(chatId, `❌ Gagal mengambil data transaksi dari Google Sheets.`);
          return;
        }

        // 4. Filter Transaksi Berdasarkan Role (Gabungan vs Petty Cash saja)
        let transactions: Transaction[] = dataJson.transactions.map((t: any) => ({
          ...t,
          description: t.merchant || t.description || ""
        }));

        if (!includeKasProyek) {
          transactions = transactions.filter((t: any) => t.jobRole !== "Manajer");
        } else if (dataJson.topups && Array.isArray(dataJson.topups)) {
          const topupTx: Transaction[] = dataJson.topups.map((tp: any) => ({
            date: tp.date,
            description: `Top Up Kas Proyek${tp.recordedBy ? " oleh " + tp.recordedBy : ""}`,
            type: "Debit",
            amount: Number(tp.amount) || 0,
            note: "Kas Proyek"
          }));
          transactions = [...transactions, ...topupTx].sort((a, b) => {
            return new Date(a.date || "").getTime() - new Date(b.date || "").getTime();
          });
        }

        if (transactions.length === 0) {
          await bot.sendMessage(chatId, `ℹ️ Belum ada transaksi tercatat untuk PDF proyek *${projectName}*.`, { parse_mode: "Markdown" });
          return;
        }

        // 5. Render Dokumen PDFKit
        const reportTypeLabel = includeKasProyek ? "Gabungan" : "Petty Cash";
        const reportData: ProjectReportData = {
          projectName: projectName,
          year: `${new Date().getFullYear()} — ${reportTypeLabel}`,
          transactions: transactions
        };

        bot.sendChatAction(chatId, "upload_document").catch(() => {});
        const pdfBuffer = await generatePDFBuffer(reportData);
        
        // 6. Push Dokumen Kembali ke Pengguna Telegram
        const safeProj = projectName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const safeType = includeKasProyek ? "Gabungan" : "PettyCash";
        const fileName = `Laporan_${safeType}_${safeProj}.pdf`;

        await bot.sendDocument(chatId, pdfBuffer, {
          caption: `✅ *File PDF Laporan Berhasil Dibuat!*\nProyek: ${projectName}`,
          parse_mode: "Markdown"
        }, {
          filename: fileName,
          contentType: "application/pdf"
        });

      } catch (err: any) {
        console.error("❌ Worker Error:", err);
      }
    });
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Petty Cash PDF Worker is Active! 🚀\n");
  }
});

server.listen(PORT, () => {
  console.log(`🌐 PDF Worker listening on port ${PORT}`);
});
