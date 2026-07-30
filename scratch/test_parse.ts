import { generatePDFReport, ProjectReportData, Transaction } from "../src/pdfGenerator";

async function runTest() {
  const url = 'https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec?action=report&project=PERPUSTAKAAN%20LANTAI%2010%20-%20PULOMAS';
  const res = await fetch(url);
  const text = await res.text();
  
  // Extract all base64 images from raw text
  const cleanText = text.replace(/\\/g, '');
  const matches = [...cleanText.matchAll(/(data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+)/gi)];
  const base64Imgs = matches.map(m => m[1]);

  console.log("Found Base64 Images:", base64Imgs.length);
  if (base64Imgs.length > 0) {
    console.log("Sample image length:", base64Imgs[0].length);
  }

  const transactions: Transaction[] = [
    { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 1600000 },
    { date: "24 Jul 2026", description: "Pembayaran Kontrakan Tukang Pek. Pulomas", type: "Kredit", category: "Akomodasi", amount: 1600000, photoUrl: base64Imgs[0] },
    { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 400000 },
    { date: "24 Jul 2026", description: "Spidol", type: "Kredit", category: "ATK", amount: 10000, photoUrl: base64Imgs[1] },
    { date: "24 Jul 2026", description: "Nota 1", type: "Kredit", category: "Material", amount: 50000, photoUrl: base64Imgs[2] },
    { date: "24 Jul 2026", description: "Nota 2", type: "Kredit", category: "Material", amount: 75000, photoUrl: base64Imgs[3] }
  ];

  const reportData: ProjectReportData = {
    projectName: "PERPUSTAKAAN LANTAI 10 - PULOMAS",
    year: "7 HARI TERAKHIR",
    transactions
  };

  const outPath = "./test_with_photos.pdf";
  await generatePDFReport(reportData, outPath);
  console.log("Generated PDF with photos at:", outPath);
}

runTest();
