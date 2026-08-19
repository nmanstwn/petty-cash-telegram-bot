const { readFileSync } = require('fs');

function toTitleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseAmountString(str) {
  if (!str) return 0;
  let s = String(str).trim().toLowerCase();
  let multiplier = 1;
  let hasExplicitMultiplier = false;

  if (/(?:jt|juta)\b/i.test(s) || /[\d.,]\s*jt\b/i.test(s)) {
    multiplier = 1000000;
    hasExplicitMultiplier = true;
  } else if (/(?:rb|ribu)\b/i.test(s) || /[\d.,]\s*k\b/i.test(s)) {
    multiplier = 1000;
    hasExplicitMultiplier = true;
  } else if (/(?:m|milyar|miliar)\b/i.test(s)) {
    multiplier = 1000000000;
    hasExplicitMultiplier = true;
  }

  let cleanNumStr = s.replace(/[^0-9.,]/g, "");
  if (!cleanNumStr) return 0;

  if (!hasExplicitMultiplier) {
    const decimalMatch = cleanNumStr.match(/^(\d+)[.,](\d{1,2})$/);
    if (decimalMatch) {
      const whole = parseInt(decimalMatch[1], 10);
      const frac = decimalMatch[2];
      if (whole < 100) {
        multiplier = 1000000;
        cleanNumStr = `${whole}.${frac}`;
      }
    }
  }

  if (cleanNumStr.includes(",") && !cleanNumStr.includes(".")) {
    cleanNumStr = cleanNumStr.replace(",", ".");
  } else if (cleanNumStr.includes(",") && cleanNumStr.includes(".")) {
    cleanNumStr = cleanNumStr.replace(/\./g, "").replace(",", ".");
  } else if (cleanNumStr.includes(".")) {
    if (multiplier === 1) {
      const parts = cleanNumStr.split(".");
      if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
        cleanNumStr = cleanNumStr.replace(/\./g, "");
      }
    }
  }

  const val = parseFloat(cleanNumStr);
  if (isNaN(val)) return 0;

  return Math.round(val * multiplier);
}

function parseDateFromText(text) {
  if (!text) return { dateStr: "", matchedSubstring: "" };
  
  const isoMatch = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return { dateStr: `${isoMatch[1]}-${month}-${day}`, matchedSubstring: isoMatch[0] };
  }

  const dmyMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    return { dateStr: `${dmyMatch[3]}-${month}-${day}`, matchedSubstring: dmyMatch[0] };
  }

  const monthMap = {
    jan: "01", januari: "01",
    feb: "02", februari: "02",
    mar: "03", maret: "03",
    apr: "04", april: "04",
    may: "05", mei: "05",
    jun: "06", juni: "06",
    jul: "07", juli: "07",
    aug: "08", agu: "08", agustus: "08", ags: "08",
    sep: "09", september: "09",
    oct: "10", oktober: "10", okt: "10",
    nov: "11", november: "11",
    dec: "12", desember: "12", des: "12"
  };

  const matches = text.matchAll(/\b(0?[1-9]|[12]\d|3[01])[-/\s]*([a-z]{3,9})(?:[-/\s]*(20\d{2}))?\b/gi);
  for (const m of matches) {
    const day = m[1].padStart(2, "0");
    const mStr = m[2].substring(0, 3).toLowerCase();
    const month = monthMap[mStr];
    if (month) {
      const year = m[3] || new Date().getFullYear().toString();
      return { dateStr: `${year}-${month}-${day}`, matchedSubstring: m[0] };
    }
  }

  return { dateStr: "", matchedSubstring: "" };
}

// Enhanced parsePatenFormat to handle embedded numbers in item description like "nota 1"
function parsePatenFormat(text) {
  if (!text) return { dateStr: "", deskripsi: "", amount: 0, keterangan: "" };

  let remaining = text.trim();
  let dateStr = "";

  // 1. Ekstrak TanggalBulan — HARUS di awal teks sesuai format paten
  const dateRes = parseDateFromText(remaining);
  if (dateRes.matchedSubstring) {
    const idx = remaining.toLowerCase().indexOf(dateRes.matchedSubstring.toLowerCase());
    if (idx >= 0 && idx <= 2) {
      dateStr = dateRes.dateStr;
      remaining = remaining.slice(idx + dateRes.matchedSubstring.length).trim();
    }
  }

  // 2. Cari token NOMINAL pertama di sisa teks
  const amountRegex = /(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k\b|m\b|milyar|miliar)?/gi;
  const allMatches = [...remaining.matchAll(amountRegex)];

  let amountMatch = null;
  if (allMatches.length > 0) {
    // Utamakan match yang punya multiplier/unit eksplisit ATAU nominal >= 100
    for (const m of allMatches) {
      const str = m[0];
      const hasUnit = /(?:rp|idr|jt|juta|rb|ribu|k\b|m\b|milyar|miliar)/i.test(str);
      const parsed = parseAmountString(str);
      if (hasUnit || parsed >= 100) {
        amountMatch = m;
        break;
      }
    }
    // Jika tidak ada yang punya unit / >= 100, gunakan match pertama yang > 0
    if (!amountMatch) {
      for (const m of allMatches) {
        if (parseAmountString(m[0]) > 0) {
          amountMatch = m;
          break;
        }
      }
    }
    // Fallback ke match pertama jika masih null
    if (!amountMatch) {
      amountMatch = allMatches[0];
    }
  }

  let deskripsi = remaining;
  let keterangan = "";
  let amount = 0;

  if (amountMatch) {
    const matchedAmountStr = amountMatch[0];
    const matchIdx = amountMatch.index;

    deskripsi = remaining.slice(0, matchIdx).trim();
    keterangan = remaining.slice(matchIdx + matchedAmountStr.length).trim();
    keterangan = keterangan.replace(/^[-_,\s:]+/, "").trim();

    amount = parseAmountString(matchedAmountStr);
  }

  return {
    dateStr: dateStr,
    deskripsi: toTitleCase(deskripsi),
    amount: amount,
    keterangan: keterangan
  };
}

console.log("Test 1 (User prompt example):");
console.log(parsePatenFormat("02agustus beli nota 1 150rb paku beton 5kg, meteran 1"));

console.log("\nTest 2:");
console.log(parsePatenFormat("03agustus test parser 25rb item satu, item dua"));

console.log("\nTest 3 (Rp prefix):");
console.log(parsePatenFormat("02agustus beli kopi Rp 25.000 tanpa gula"));

console.log("\nTest 4 (Typo 2agutus):");
console.log(parsePatenFormat("2agutus beli bensin 50rb motor"));
