import { generatePDFReport, ProjectReportData, Transaction } from "../src/pdfGenerator";

async function testFinalLayout() {
  const transactions: Transaction[] = [
    { date: "2026-07-24T00:00:00.000Z", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 1600000 },
    { date: "2026-07-24T00:00:00.000Z", description: "Pembayaran Kontrakan Tukang Pek. Pulomas", type: "Kredit", category: "Akomodasi", amount: 1600000, note: "Lunas 1 bulan" },
    { date: "2026-07-24T00:00:00.000Z", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 400000 },
    { date: "2026-07-24T00:00:00.000Z", description: "Spidol", type: "Kredit", category: "ATK", amount: 10000, note: "Warna Hitam & Merah" },
    { date: "2026-07-24T00:00:00.000Z", description: "Nota 1", type: "Kredit", category: "Material", amount: 50000 },
    { date: "2026-07-24T00:00:00.000Z", description: "Nota 2", type: "Kredit", category: "Material", amount: 75000 }
  ];

  const reportData: ProjectReportData = {
    projectName: "PERPUSTAKAAN LANTAI 10 - PULOMAS",
    year: "Semua Riwayat",
    transactions
  };

  const outPath = "./final_layout_test.pdf";
  await generatePDFReport(reportData, outPath);
  console.log("Final layout test PDF generated at:", outPath);
}

testFinalLayout();
