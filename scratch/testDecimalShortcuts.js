function parseAmountString(str) {
  if (!str) return 0;
  let s = String(str).trim().toLowerCase();

  let multiplier = 1;
  let hasExplicitMultiplier = false;

  if (/(?:jt|juta)/.test(s)) {
    multiplier = 1000000;
    hasExplicitMultiplier = true;
  } else if (/(?:rb|ribu|k)/.test(s)) {
    multiplier = 1000;
    hasExplicitMultiplier = true;
  } else if (/(?:m|milyar|miliar)/.test(s)) {
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
    aug: "08", agustus: "08", ags: "08",
    sep: "09", september: "09",
    oct: "10", oktober: "10", okt: "10",
    nov: "11", november: "11",
    dec: "12", desember: "12", des: "12"
  };

  const textDateMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])\s+([a-z]{3,9})(?:\s+(20\d{2}))?\b/i);
  if (textDateMatch) {
    const day = textDateMatch[1].padStart(2, "0");
    const mStr = textDateMatch[2].substring(0, 3).toLowerCase();
    const month = monthMap[mStr];
    if (month) {
      const year = textDateMatch[3] || new Date().getFullYear().toString();
      return { dateStr: `${year}-${month}-${day}`, matchedSubstring: textDateMatch[0] };
    }
  }

  return { dateStr: "", matchedSubstring: "" };
}

function parseSmartCaption(caption) {
  const captionLower = (caption || "").toLowerCase();
  let isDebit = false;
  if (captionLower.includes("debit") || captionLower.includes("uang masuk") || captionLower.includes("topup") || captionLower.includes("top up") || captionLower.includes("reimburse") || captionLower.includes("masuk")) {
    isDebit = true;
  }

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

    const allMatches = textForAmount.match(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k|m|milyar|miliar)?/gi);
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
      .replace(/uang masuk|uang keluar|topup|top up|debit|reimburse|masuk|kredit|pengeluaran/gi, "");

    if (rawNumStr) {
      cleanRemarks = cleanRemarks.replace(rawNumStr, "");
    }

    cleanRemarks = cleanRemarks.replace(/^[-_\s:]+|[-_\s:]+$/g, "").trim();

    if (cleanRemarks.length > 0) {
      merchantText = cleanRemarks;
    }
  }

  return { isDebit, parsedDate, parsedNominal, merchantText };
}

console.log("Test Decimal 1 (1.6):", parseSmartCaption("1.6 Kontrakkan Tukang Pek.Pulomas"));
console.log("Test Decimal 2 (2.1):", parseSmartCaption("2.1 Kontrakkan Tukang Pek.Pulomas"));
console.log("Test Decimal 3 (0.5):", parseSmartCaption("Uang masuk 0.5 Topup kas"));
console.log("Test Decimal 4 (12.5):", parseSmartCaption("12.5 Sewa alat berat"));
console.log("Test Decimal 5 (1,6):", parseSmartCaption("1,6 Kontrakkan Tukang Pek.Pulomas"));
