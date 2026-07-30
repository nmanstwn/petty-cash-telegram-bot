import { generatePDFReport, ProjectReportData, Transaction } from "../src/pdfGenerator";

function extractPhotoUrlsFromHTML(rawHtml: string): string[] {
  const unescaped = rawHtml
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\/g, '');

  const photos: string[] = [];
  const base64Matches = [...unescaped.matchAll(/(data:image\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=]+)/gi)];
  base64Matches.forEach(m => photos.push(m[1]));
  return photos;
}

async function testLive() {
  const APPS_SCRIPT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec";
  const projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";

  const transactions: Transaction[] = [
    { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 1600000 },
    { date: "24 Jul 2026", description: "Pembayaran Kontrakan Tukang Pek. Pulomas", type: "Kredit", category: "Akomodasi", amount: 1600000 },
    { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 400000 },
    { date: "24 Jul 2026", description: "Spidol", type: "Kredit", category: "ATK", amount: 10000 },
    { date: "24 Jul 2026", description: "Nota 1", type: "Kredit", category: "Material", amount: 50000 },
    { date: "24 Jul 2026", description: "Nota 2", type: "Kredit", category: "Material", amount: 75000 }
  ];

  const htmlRes = await fetch(`${APPS_SCRIPT_WEBHOOK_URL}?action=report&project=${encodeURIComponent(projectName)}`);
  if (htmlRes.ok) {
    const htmlText = await htmlRes.text();
    const photoUrls = extractPhotoUrlsFromHTML(htmlText);

    if (photoUrls.length > 0) {
      let pIdx = 0;
      transactions.forEach(t => {
        if (t.type === "Kredit" && pIdx < photoUrls.length) {
          t.photoUrl = photoUrls[pIdx];
          pIdx++;
        }
      });
    }
  }

  const reportData: ProjectReportData = {
    projectName,
    year: "7 HARI TERAKHIR",
    transactions
  };

  const outPath = "./live_rekap_test.pdf";
  await generatePDFReport(reportData, outPath);
  console.log("Live Rekap PDF Generated Successfully at:", outPath);
}

testLive();
