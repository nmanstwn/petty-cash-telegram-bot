import { generatePDFReport, ProjectReportData, Transaction } from "../src/pdfGenerator";
import fs from "fs";

async function testWithRealPhoto() {
  // Generate a real sample colored receipt image (a nice colorful canvas)
  const realSamplePhotoUrl = "https://picsum.photos/600/800"; // Real color photo
  console.log("Fetching real color photo from:", realSamplePhotoUrl);

  const res = await fetch(realSamplePhotoUrl);
  const arrayBuf = await res.arrayBuffer();
  const base64Photo = "data:image/jpeg;base64," + Buffer.from(arrayBuf).toString("base64");

  console.log("Real Photo Base64 Length:", base64Photo.length);

  const transactions: Transaction[] = [
    { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 1600000 },
    { date: "24 Jul 2026", description: "Pembayaran Kontrakan Tukang Pek. Pulomas", type: "Kredit", category: "Akomodasi", amount: 1600000, photoUrl: base64Photo },
    { date: "24 Jul 2026", description: "Kas Pek. Pulomas 1", type: "Debit", amount: 400000 },
    { date: "24 Jul 2026", description: "Spidol", type: "Kredit", category: "ATK", amount: 10000, photoUrl: base64Photo },
    { date: "24 Jul 2026", description: "Nota 1", type: "Kredit", category: "Material", amount: 50000, photoUrl: base64Photo },
    { date: "24 Jul 2026", description: "Nota 2", type: "Kredit", category: "Material", amount: 75000, photoUrl: base64Photo }
  ];

  const reportData: ProjectReportData = {
    projectName: "PERPUSTAKAAN LANTAI 10 - PULOMAS",
    year: "7 HARI TERAKHIR",
    transactions
  };

  const outPath = "./real_color_photo_test.pdf";
  await generatePDFReport(reportData, outPath);
  console.log("Generated PDF with REAL COLOR PHOTOS at:", outPath);
}

testWithRealPhoto();
