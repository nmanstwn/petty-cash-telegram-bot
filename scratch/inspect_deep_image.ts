import fs from "fs";

async function inspectDeep() {
  const url = 'https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec?action=report&project=PERPUSTAKAAN%20LANTAI%2010%20-%20PULOMAS';
  const res = await fetch(url);
  const text = await res.text();

  console.log("Raw HTML length:", text.length);

  // Unescape Google Apps Script goog.script.init string
  const unescaped = text
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\/g, '');

  console.log("Unescaped length:", unescaped.length);

  // Find all data:image occurrences
  const matches = [...unescaped.matchAll(/data:image\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=\s]+/gi)];
  console.log("Found data:image matches:", matches.length);

  matches.forEach((m, idx) => {
    const rawMatch = m[0];
    console.log(`Match #${idx + 1} raw length:`, rawMatch.length);
    
    // Clean all whitespace
    const cleanBase64 = rawMatch.replace(/\s+/g, '');
    const parts = cleanBase64.split(",");
    const header = parts[0];
    const dataStr = parts[1];

    console.log(`Match #${idx + 1} header:`, header);
    console.log(`Match #${idx + 1} clean data length:`, dataStr.length);

    const buf = Buffer.from(dataStr, "base64");
    const filename = `scratch/extracted_img_${idx + 1}.jpg`;
    fs.writeFileSync(filename, buf);
    console.log(`Saved ${filename} (${buf.length} bytes)`);

    // Check first 20 bytes and last 20 bytes of JPEG file (JPEG magic bytes: FF D8 ... FF D9)
    const firstBytes = buf.subarray(0, 10).toString("hex");
    const lastBytes = buf.subarray(buf.length - 10).toString("hex");
    console.log(`Image #${idx + 1} First Bytes:`, firstBytes);
    console.log(`Image #${idx + 1} Last Bytes:`, lastBytes);
  });
}

inspectDeep();
