import PDFDocument from "pdfkit";
import fs from "fs";

async function testDecode() {
  const url = 'https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec?action=report&project=PERPUSTAKAAN%20LANTAI%2010%20-%20PULOMAS';
  const res = await fetch(url);
  const text = await res.text();
  
  const unescaped = text
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\/g, '');

  const base64Matches = [...unescaped.matchAll(/(data:image\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=]+)/gi)];
  console.log("Found base64 images:", base64Matches.length);

  base64Matches.forEach((m, idx) => {
    const rawDataUrl = m[1];
    const base64Str = rawDataUrl.split(",")[1];
    const buf = Buffer.from(base64Str, "base64");
    console.log(`Image #${idx + 1} Buffer Size:`, buf.length, "bytes");

    const doc = new PDFDocument({ margin: 20, size: "A4", layout: "landscape" });
    try {
      doc.image(buf, 50, 50, { fit: [200, 200] });
      console.log(`Image #${idx + 1} decoded SUCCESS by PDFKit!`);
    } catch (err: any) {
      console.error(`Image #${idx + 1} decode FAILED:`, err.message);
    }
  });
}

testDecode();
