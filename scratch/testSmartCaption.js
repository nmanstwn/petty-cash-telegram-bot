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

  // Ambil bagian angka
  let numStr = s.replace(/[^0-9.,]/g, "");
  if (!numStr) return 0;

  if (numStr.includes(",") && !numStr.includes(".")) {
    numStr = numStr.replace(",", ".");
  } else if (numStr.includes(",") && numStr.includes(".")) {
    numStr = numStr.replace(/\./g, "").replace(",", ".");
  } else if (numStr.includes(".")) {
    // Jika tidak ada multiplier dan formatnya 1.600.000
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

function parseSmartCaption(caption) {
  const captionLower = caption.toLowerCase();
  let isDebit = false;
  if (captionLower.includes("debit") || captionLower.includes("uang masuk") || captionLower.includes("topup") || captionLower.includes("top up") || captionLower.includes("reimburse") || captionLower.includes("masuk")) {
    isDebit = true;
  }

  let parsedNominal = 0;
  let merchantText = caption ? caption : "Bukti Transfer / Nota";

  if (caption) {
    // Match angka termasuk singkatan (misal: 1.6jt / 1,6jt / 50rb / 250k / Rp 1.600.000)
    const allMatches = caption.match(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|ribu|k|m|milyar|miliar)?/gi);
    
    if (allMatches) {
      let maxVal = 0;
      let maxStr = "";
      for (let m of allMatches) {
        const parsed = parseAmountString(m);
        if (parsed > maxVal) {
          maxVal = parsed;
          maxStr = m;
        }
      }
      if (maxVal > 0) {
        parsedNominal = maxVal;
        
        let cleanRemarks = caption
          .replace(maxStr, "")
          .replace(/uang masuk|topup|top up|debit|reimburse|masuk|kredit|pengeluaran/gi, "")
          .replace(/^[-_\s:]+|[-_\s:]+$/g, "")
          .trim();

        if (cleanRemarks.length > 0) {
          merchantText = cleanRemarks;
        }
      }
    }
  }

  return { isDebit, parsedNominal, merchantText };
}

console.log("Test 1 (1.6jt):", parseSmartCaption("Uang masuk 1.6jt Kontrakkan Tukang Pek.Pulomas"));
console.log("Test 2 (1,6jt):", parseSmartCaption("1,6jt Kontrakkan Tukang Pek.Pulomas"));
console.log("Test 3 (1.2jt):", parseSmartCaption("Uang keluar 1.2jt sewa alat"));
console.log("Test 4 (50rb):", parseSmartCaption("Konsumsi rapat 50rb"));
console.log("Test 5 (250k):", parseSmartCaption("Beli bensin 250k"));
console.log("Test 6 (1.5juta):", parseSmartCaption("Uang masuk 1.5juta dari kantor"));
