function getNextNotaNumberMock(data, projectName) {
  let maxNum = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][5] !== projectName) continue; // Kolom F: Project

    const merchant = String(data[i][8] || ""); // Kolom I: Merchant
    const match = merchant.match(/^nota\s+(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return maxNum + 1;
}

const mockSheetData = [
  // Header
  ["ID", "Timestamp", "UserID", "UserName", "JobRole", "Project", "Date", "Amount", "Merchant", "Category"],
  // Rows
  ["TX-1", "...", "123", "Nur", "Pengawas", "Proyek A", "2026-08-01", 50000, "Nota 1", "Material"],
  ["TX-2", "...", "123", "Nur", "Pengawas", "Proyek A", "2026-08-02", 75000, "Nota 8", "Material"],
  ["TX-3", "...", "123", "Nur", "Pengawas", "Proyek B", "2026-08-02", 30000, "Nota 3", "Material"],
  ["TX-4", "...", "123", "Nur", "Pengawas", "Proyek A", "2026-08-03", 20000, "Beli Semen", "Material"],
  ["TX-5", "...", "123", "Nur", "Pengawas", "Proyek A", "2026-08-04", 15000, "nota 5", "Material"],
];

console.log("Next nota for Proyek A (expect 9):", getNextNotaNumberMock(mockSheetData, "Proyek A"));
console.log("Next nota for Proyek B (expect 4):", getNextNotaNumberMock(mockSheetData, "Proyek B"));
console.log("Next nota for Proyek C (new, expect 1):", getNextNotaNumberMock(mockSheetData, "Proyek C"));

// Test regex checks
function checkDeskripsi(input, projectName, data) {
  let finalDeskripsi = input;
  if (/^nota$/i.test(finalDeskripsi.trim())) {
    const nextNum = getNextNotaNumberMock(data, projectName);
    finalDeskripsi = `Nota ${nextNum}`;
  }
  return finalDeskripsi;
}

console.log("\nInput 'nota' on Proyek A ->", checkDeskripsi("nota", "Proyek A", mockSheetData));
console.log("Input 'Nota' on Proyek A ->", checkDeskripsi("Nota", "Proyek A", mockSheetData));
console.log("Input 'NOTA' on Proyek A ->", checkDeskripsi("NOTA", "Proyek A", mockSheetData));
console.log("Input 'nota 3' on Proyek A ->", checkDeskripsi("nota 3", "Proyek A", mockSheetData));
console.log("Input 'beli nota 2' on Proyek A ->", checkDeskripsi("beli nota 2", "Proyek A", mockSheetData));
console.log("Input 'bensin motor' on Proyek A ->", checkDeskripsi("bensin motor", "Proyek A", mockSheetData));
