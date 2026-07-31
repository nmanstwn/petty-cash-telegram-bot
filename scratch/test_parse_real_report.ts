import { Transaction } from "../src/pdfGenerator";

function parseReportFromHtml(htmlText: string): { projectName: string; period: string; transactions: Transaction[] } {
  const unescaped = htmlText
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\/g, '');

  let projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";
  let period = "7 Hari Terakhir";
  const transactions: Transaction[] = [];

  // Extract Base64 Photos
  const base64Matches = [...unescaped.matchAll(/data:image\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=\s]+/gi)];
  const photoUrls = base64Matches.map(m => m[0].replace(/\s+/g, ''));
  console.log("Extracted photoUrls from HTML:", photoUrls.length);

  // Extract Table Rows from HTML
  const trMatches = [...unescaped.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi)];
  let pIdx = 0;

  for (const trMatch of trMatches) {
    const rowContent = trMatch[1];
    const tdMatches = [...rowContent.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());

    if (tdMatches.length >= 7) {
      const date = tdMatches[0];
      const desc = tdMatches[1];

      if (date && desc && !desc.toLowerCase().includes("deskripsi") && !desc.toLowerCase().includes("laporan")) {
        const parseAmount = (s: string) => {
          if (!s) return 0;
          const clean = s.replace(/\./g, '').replace(/,/g, '').replace(/[^\d]/g, '');
          return parseInt(clean, 10) || 0;
        };

        const mat = parseAmount(tdMatches[2]);
        const upah = parseAmount(tdMatches[3]);
        const alat = parseAmount(tdMatches[4]);
        const atk = parseAmount(tdMatches[5]);
        const akomodasi = parseAmount(tdMatches[6]);
        const lain = parseAmount(tdMatches[7]);
        const debit = parseAmount(tdMatches[8]);

        let type: "Debit" | "Kredit" = "Kredit";
        let amount = 0;
        let category = "Lain-Lain";

        if (debit > 0) {
          type = "Debit";
          amount = debit;
        } else if (mat > 0) { amount = mat; category = "Material"; }
        else if (upah > 0) { amount = upah; category = "Upah"; }
        else if (alat > 0) { amount = alat; category = "Alat"; }
        else if (atk > 0) { amount = atk; category = "ATK"; }
        else if (akomodasi > 0) { amount = akomodasi; category = "Akomodasi"; }
        else if (lain > 0) { amount = lain; category = "Lain-Lain"; }

        if (amount > 0) {
          const tx: Transaction = {
            date,
            description: desc,
            type,
            category,
            amount
          };

          if (type === "Kredit" && pIdx < photoUrls.length) {
            tx.photoUrl = photoUrls[pIdx];
            pIdx++;
          }

          transactions.push(tx);
        }
      }
    }
  }

  return { projectName, period, transactions };
}

async function runTest() {
  const APPS_SCRIPT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec";
  const projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";
  const url = `${APPS_SCRIPT_WEBHOOK_URL}?action=report&project=${encodeURIComponent(projectName)}`;

  console.log("Fetching with redirect: follow...");
  const res = await fetch(url, { redirect: "follow" });
  const htmlText = await res.text();

  const result = parseReportFromHtml(htmlText);
  console.log("Parsed Transactions Count:", result.transactions.length);
  result.transactions.forEach((t, i) => {
    console.log(`Tx #${i + 1}: ${t.date} | ${t.description} | ${t.type} | ${t.category} | Rp ${t.amount} | HasPhoto: ${Boolean(t.photoUrl)}`);
  });
}

runTest();
