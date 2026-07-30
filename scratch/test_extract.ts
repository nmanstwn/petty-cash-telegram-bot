async function run() {
  const url = 'https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec?action=report&project=PERPUSTAKAAN%20LANTAI%2010%20-%20PULOMAS';
  const res = await fetch(url);
  const text = await res.text();
  
  const decoded = text.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                     .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                     .replace(/\\"/g, '"');
  
  const imgTags = [...decoded.matchAll(/<img[\s\S]*?>/gi)].map(m => m[0]);
  console.log("Img tags found:", imgTags.length);
  imgTags.forEach((tag, i) => console.log(`Tag ${i + 1}:`, tag));
}

run();
