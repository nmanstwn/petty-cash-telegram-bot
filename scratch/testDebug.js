function parseAmountString(str) {
  if (!str) return 0;
  let s = String(str).trim().toLowerCase();

  let multiplier = 1;
  let hasExplicitMultiplier = false;

  if (/\b(?:jt|juta)\b/i.test(s) || /[\d.,]\s*jt\b/i.test(s)) {
    multiplier = 1000000;
    hasExplicitMultiplier = true;
  } else if (/\b(?:rb|ribu)\b/i.test(s) || /[\d.,]\s*k\b/i.test(s)) {
    multiplier = 1000;
    hasExplicitMultiplier = true;
  } else if (/\b(?:m|milyar|miliar)\b/i.test(s)) {
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
    const allMatches = caption.match(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k\b|m|milyar|miliar)?/gi);
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

    let cleanRemarks = caption
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
console.log("Test Decimal 6 (50k):", parseSmartCaption("50k Konsumsi rapat"));
