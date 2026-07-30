function parseAmountString(str) {
  if (!str) return 0;
  let s = String(str).trim().toLowerCase();

  let multiplier = 1;
  if (/(?:jt|juta)/.test(s)) {
    multiplier = 1000000;
  } else if (/(?:rb|ribu|k)/.test(s)) {
    multiplier = 1000;
  } else if (/(?:m|milyar|miliar)/.test(s)) {
    multiplier = 1000000000;
  }

  let numStr = s.replace(/[^0-9.,]/g, "");
  if (!numStr) return 0;

  if (numStr.includes(",") && !numStr.includes(".")) {
    numStr = numStr.replace(",", ".");
  } else if (numStr.includes(",") && numStr.includes(".")) {
    numStr = numStr.replace(/\./g, "").replace(",", ".");
  } else if (numStr.includes(".")) {
    if (multiplier === 1) {
      const parts = numStr.split(".");
      if (parts.length > 2 || (parts[1] && parts[1].length === 3)) {
        numStr = numStr.replace(/\./g, "");
      }
    }
  }

  const val = parseFloat(numStr);
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

console.log("Test Date 1:", parseSmartCaption("24 Jul 2026 1.6jt Kontrakkan Tukang Pek.Pulomas"));
console.log("Test Date 2:", parseSmartCaption("Uang masuk 15/05/2026 2jt Topup kas"));
console.log("Test Date 3:", parseSmartCaption("2026-07-24 500rb Beli bahan"));
console.log("Test Date 4:", parseSmartCaption("24 Jul 1.6jt Kontrakkan Tukang"));
