import { generatePDFReport, ProjectReportData } from "./pdfGenerator";
import { parseIndonesianReceiptText } from "./ocrEngine";
import path from "path";

async function main() {
  console.log("=================================================");
  console.log("🤖 TESTING BOT PETTY CASH AUTOMATION (LOCAL TEST)");
  console.log("=================================================");

  // 1. Test OCR Parser
  console.log("\n🔍 1. TESTING OCR PARSER");
  const sampleReceiptText = `
    INDOMARET SUDIRMAN
    TGL: 28/07/2026
    1 KERTAS A4 80GSM   Rp 55.000
    2 PENA GEL HITAM    Rp 20.000
    TOTAL: Rp 75.000
  `;
  const ocrResult = parseIndonesianReceiptText(sampleReceiptText);
  console.log("  [Receipt Result]:", JSON.stringify(ocrResult, null, 2));

  // 2. Test PDF Report Generation with exact template data & photo evidence attachment
  console.log("\n📄 2. TESTING PDF REPORT GENERATION (WITH PHOTO EVIDENCE PAGE 2)");
  const reportData: ProjectReportData = {
    projectName: "Proyek Renovasi Kantor",
    year: "2025",
    transactions: [
      { date: "11/04/2025", description: "Sewa kontrakan untuk pekerja", type: "Kredit", category: "Akomodasi", amount: 1800000, note: "14 April s/d 13 Mei 2025", photoUrl: "https://example.com/nota1.jpg" },
      { date: "14/04/2025", description: "Uang masuk", type: "Debit", amount: 1800000, note: "Reimburse uang kontrakan", photoUrl: "https://example.com/transfer1.jpg" },
      { date: "", description: "Nasi padang 2 bungkus", type: "Kredit", category: "Lain-Lain", amount: 36000 },
      { date: "", description: "Air minum aqua @1L 2Botol", type: "Kredit", category: "Lain-Lain", amount: 12000 },
      { date: "", description: "Fotocopy WP", type: "Kredit", category: "ATK", amount: 7000, photoUrl: "https://example.com/nota2.jpg" },
      { date: "", description: "Martabak 3Bh", type: "Kredit", category: "Lain-Lain", amount: 84000, note: "Untuk operator, satpam, dan staff" },
      { date: "", description: "Supir truck", type: "Kredit", category: "Upah", amount: 20000 },
      { date: "", description: "Listrik kontrakan", type: "Kredit", category: "Lain-Lain", amount: 20000 },
      { date: "16/04/2025", description: "Angkong @2 Bh", type: "Kredit", category: "Alat", amount: 940000, photoUrl: "https://example.com/nota3.jpg" },
      { date: "", description: "Sekop carmen @2 Bh", type: "Kredit", category: "Alat", amount: 220000 },
      { date: "", description: "Gagang cangkul @1 Bh", type: "Kredit", category: "Alat", amount: 15000 },
      { date: "", description: "Sepatu boots @1 Psg", type: "Kredit", category: "Alat", amount: 70000 },
      { date: "", description: "Paku 7cm @0.50 Kg", type: "Kredit", category: "Alat", amount: 10000 },
      { date: "", description: "Mur, baut, ring", type: "Kredit", category: "Material", amount: 10000 },
      { date: "", description: "Kunci pas 10", type: "Kredit", category: "Alat", amount: 20000 },
      { date: "", description: "Uang satpam", type: "Kredit", category: "Upah", amount: 20000 },
      { date: "17/04/2025", description: "Pompa ban", type: "Kredit", category: "Alat", amount: 36000, note: "Beli online" },
      { date: "", description: "Uang satpam", type: "Kredit", category: "Upah", amount: 20000 }
    ]
  };

  const outputPdf = path.join(__dirname, "../Laporan_Petty_Cash_Sample.pdf");
  console.log("  ⏳ Generating template-matched PDF report with Page 2 photo attachments...");
  await generatePDFReport(reportData, outputPdf);
  console.log(`  ✅ SUCCESS! PDF Report generated at:\n     ${outputPdf}`);
}

main().catch(console.error);
