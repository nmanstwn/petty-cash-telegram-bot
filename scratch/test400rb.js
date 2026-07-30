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

function detectTransactionTypeAndCategory(text) {
  const tLower = (text || "").toLowerCase();
  
  const expenseKeywords = [
    "bayar", "beli", "pembelian", "biaya", "ongkir", "sewa", "kredit", "pengeluaran",
    "gaji", "upah", "honor", "lembur", "mandor", "kasbon", "tukang",
    "semen", "pasir", "batu", "cat", "paku", "baut", "besi", "kayu", "pipa", "kabel", "keramik", "bata", "triplek", "material", "bahan",
    "rental", "rent", "bor", "cangkul", "helm", "rompi", "mesin", "alat", "genset", "molen",
    "kertas", "pena", "pulpen", "spidol", "materai", "print", "fotocopy", "buku", "atk", "tinta",
    "bensin", "pertalite", "pertamax", "solar", "tol", "parkir", "makan", "minum", "konsumsi", "nasi", "ojek", "grab", "gojek", "travel", "tiket", "makanan"
  ];

  let isExpense = false;
  for (let kw of expenseKeywords) {
    if (tLower.includes(kw)) {
      isExpense = true;
      break;
    }
  }

  if (!isExpense) {
    return { type: "Debit", category: "Uang Masuk / TopUp" };
  }

  let category = "Lain-Lain";
  const catRules = [
    { cat: "Upah", keywords: ["tukang", "kontrakan tukang", "gaji", "upah", "honor", "lembur", "mandor", "kasbon"] },
    { cat: "Material", keywords: ["semen", "pasir", "batu", "cat", "paku", "baut", "besi", "kayu", "pipa", "kabel", "keramik", "bata", "triplek", "material", "bahan"] },
    { cat: "Alat", keywords: ["sewa", "rental", "rent", "bor", "cangkul", "helm", "rompi", "mesin", "alat", "genset", "molen"] },
    { cat: "ATK", keywords: ["kertas", "pena", "pulpen", "spidol", "materai", "print", "fotocopy", "buku", "atk", "tinta"] },
    { cat: "Akomodasi", keywords: ["bensin", "pertalite", "pertamax", "solar", "tol", "parkir", "makan", "minum", "konsumsi", "nasi", "ojek", "grab", "gojek", "travel", "tiket", "makanan"] }
  ];

  for (let rule of catRules) {
    for (let kw of rule.keywords) {
      if (tLower.includes(kw)) {
        category = rule.cat;
        break;
      }
    }
    if (category !== "Lain-Lain") break;
  }

  return { type: "Kredit", category: category };
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
    jul: "07", juli: "07", juli: "07",
    aug: "08", agustus: "08", ags: "08",
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

function parseSmartCaption(caption) {
  const captionLower = (caption || "").toLowerCase();
  const detected = detectTransactionTypeAndCategory(caption);
  const txType = detected.type;
  const txCategory = detected.category;

  let parsedDate = "";
  let parsedNominal = 0;
  let merchantText = caption ? caption : "Bukti Transfer / Nota";

  if (caption) {
    const dateRes = parseDateFromText(caption);
    parsedDate = dateRes.dateStr;

    let textForAmount = caption;
    if (dateRes.matchedSubstring) {
      textForAmount = caption.replace(dateRes.matchedSubstring, "").trim();
    }

    const allMatches = textForAmount.match(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k\b|m|milyar|miliar)?/gi);
    let rawNumStr = "";

    if (allMatches) {
      let maxVal = 0;
      for (let m of allMatches) {
        const parsed = parseAmountString(m);
        if (parsed > maxVal) {
          maxVal = parsed;
          rawNumStr = m;
        }
      }
      if (maxVal > 0) {
        parsedNominal = maxVal;
      }
    }

    let cleanRemarks = textForAmount
      .replace(/uang masuk|uang keluar|topup|top up|debit|reimburse|masuk|kredit|pengeluaran/gi, "")
      .replace(/\b(?:bayar|beli|pembelian|biaya|ongkir|sewa)\b/gi, "");

    if (rawNumStr) {
      cleanRemarks = cleanRemarks.replace(rawNumStr, "");
    }

    cleanRemarks = cleanRemarks.replace(/^[-_\s:]+|[-_\s:]+$/g, "").trim();

    if (cleanRemarks.length > 0) {
      merchantText = cleanRemarks;
    }
  }

  return { type: txType, category: txCategory, parsedDate, parsedNominal, merchantText };
}

const input = "24juli 400rb kas pek. pulomas 1";
console.log("Input:", input);
console.log("Result:", parseSmartCaption(input));
