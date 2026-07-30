export interface OCRResult {
  date: string;
  merchant: string;
  amount: number;
  category: string;
  confidence: number;
  rawText?: string;
  refNo?: string;
}

export function parseIndonesianReceiptText(text: string): OCRResult {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  
  let date = new Date().toISOString().split("T")[0];
  let merchant = "Toko / Merchant Umum";
  let amount = 0;
  let category = "Operasional";
  let confidence = 0.85;
  let refNo = "-";

  // 1. Detect Merchant
  if (/INDOMARET/i.test(text)) merchant = "Indomaret";
  else if (/ALFAMART/i.test(text)) merchant = "Alfamart";
  else if (/PERTAMINA|SPBU/i.test(text)) {
    merchant = "SPBU Pertamina";
    category = "Transportasi";
  } else if (/BCA|MANDIRI|BRI|BNI|BANK/i.test(text)) {
    merchant = "Transfer Bank";
    category = "Transfer / Mutasi";
  } else if (lines.length > 0) {
    merchant = lines[0].replace(/[^a-zA-Z0-9\s.-]/g, "").slice(0, 30);
  }

  // 2. Detect Amount (Prioritize TOTAL / GRAND TOTAL / BAYAR / NOMINAL)
  const totalMatches = text.match(/(?:TOTAL|GRAND TOTAL|BAYAR|JUMLAH|NOMINAL)\s*[:=]?\s*(?:RP\.?)?\s*([\d.,]+)/i);
  if (totalMatches) {
    const rawVal = totalMatches[1].replace(/\./g, "").replace(",", ".");
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) amount = parsed;
  }

  if (amount === 0) {
    const rpMatches = text.match(/(?:RP\.?)\s*([\d.,]+)/i);
    if (rpMatches) {
      const rawVal = rpMatches[1].replace(/\./g, "").replace(",", ".");
      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed) && parsed > 0) amount = parsed;
    }
  }

  if (amount === 0) {
    const numberMatches = text.match(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/g);
    if (numberMatches && numberMatches.length > 0) {
      const numbers = numberMatches.map(n => parseFloat(n.replace(/\./g, "").replace(",", "."))).filter(n => n > 100);
      if (numbers.length > 0) {
        amount = Math.max(...numbers);
      }
    }
  }

  // 3. Detect Date (DD/MM/YYYY or YYYY-MM-DD)
  const dateMatch = text.match(/(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/);
  if (dateMatch) {
    date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  }

  // 4. Detect Category
  if (/MAKAN|RESTORAN|RM\s|WARUNG|KONSUMSI|KAPAL\sAPI|KOPI/i.test(text)) {
    category = "Konsumsi";
  } else if (/BENSIN|PARKIR|TOL|SPBU|PERTALITE|PERTAMAX/i.test(text)) {
    category = "Transportasi";
  } else if (/ATK|KERTAS|PENA|GRAMEDIA|FOTOCOPY/i.test(text)) {
    category = "Alat Tulis";
  } else if (/SEMENT|PAKU|CAT|KAYU|BANGUNAN|PIPA/i.test(text)) {
    category = "Material";
  }

  // 5. Detect Reference Number
  const refMatch = text.match(/(?:INV|REF|NO|STRUK|TRANSAKSI)\s*[:#]?\s*([A-Z0-9-]{5,20})/i);
  if (refMatch) {
    refNo = refMatch[1];
  }

  return {
    date,
    merchant,
    amount,
    category,
    confidence,
    rawText: text,
    refNo
  };
}
