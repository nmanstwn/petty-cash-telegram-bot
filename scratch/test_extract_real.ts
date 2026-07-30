import { generatePDFReport, ProjectReportData, Transaction } from "../src/pdfGenerator";

function extractPhotoUrlsFromHTML(rawHtml: string): string[] {
  const unescaped = rawHtml
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\/g, '');

  const photos: string[] = [];

  // 1. Base64 images
  const base64Matches = [...unescaped.matchAll(/(data:image\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=]+)/gi)];
  base64Matches.forEach(m => photos.push(m[1]));

  // 2. Google Drive / HTTP URLs
  const httpMatches = [...unescaped.matchAll(/(https?:\/\/[^\s"'<>]*(?:drive\.google\.com|googleusercontent|telegram)[^\s"'<>]*)/gi)];
  httpMatches.forEach(m => photos.push(m[1]));

  return photos;
}

async function testReal() {
  const url = 'https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec?action=report&project=PERPUSTAKAAN%20LANTAI%2010%20-%20PULOMAS';
  const res = await fetch(url);
  const text = await res.text();
  
  const extractedPhotos = extractPhotoUrlsFromHTML(text);
  console.log("Extracted Photos Count:", extractedPhotos.length);
  extractedPhotos.forEach((p, idx) => {
    console.log(`Photo #${idx + 1}:`, p.slice(0, 80));
  });
}

testReal();
