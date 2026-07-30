function extractPhotoUrlsFromHTML(rawHtml: string): string[] {
  const unescaped = rawHtml
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\/g, '');

  const photos: string[] = [];
  const base64Matches = [...unescaped.matchAll(/data:image\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=\s]+/gi)];
  base64Matches.forEach(m => {
    const cleanMatch = m[0].replace(/\s+/g, '');
    photos.push(cleanMatch);
  });
  return photos;
}

async function testUntruncated() {
  const url = 'https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec?action=report&project=PERPUSTAKAAN%20LANTAI%2010%20-%20PULOMAS';
  const res = await fetch(url);
  const text = await res.text();
  
  const extracted = extractPhotoUrlsFromHTML(text);
  console.log("Extracted Photos Count:", extracted.length);
  extracted.forEach((p, idx) => {
    console.log(`Untruncated Photo #${idx + 1} Length:`, p.length, "characters");
  });
}

testUntruncated();
