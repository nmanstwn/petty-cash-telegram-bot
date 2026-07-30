const sampleText = `
BCA
Transfer Successful
24 Jul 2026 12:23:12
IDR 1,600,000.00
Beneficiary Name NUR ROHMAN SETIAWAN
Beneficiary Account 204 - 068 - 7966
Transaction Type Transfer to BCA Account
Transfer Currency IDR - Indonesian Rupiah
Source of Fund 162 - 0** - **68
Source Currency IDR - Indonesian Rupiah
Transfer Amount IDR 1,600,000.00
Remarks Kontrakkan Tukang Pek.Pulomas
Reference No. 728ADF6A-7290-45C4-B9A8-D99084A453EF
`;

// Extract Nominal
const amtMatches = sampleText.match(/(?:IDR|Rp\.?)\s*([\d.,]+)/gi) || sampleText.match(/(?:TRANSFER AMOUNT|TOTAL|BAYAR|NOMINAL)\s*:?\s*(?:IDR|Rp\.?)?\s*([\d.,]+)/gi);
console.log("Amount matches:", amtMatches);

if (amtMatches) {
  for (let i = 0; i < amtMatches.length; i++) {
    const cleanStr = amtMatches[i].replace(/IDR|Rp\.?/gi, "").trim();
    const numOnly = cleanStr.split(".")[0].replace(/[^0-9]/g, "");
    const parsedAmt = parseInt(numOnly, 10);
    console.log(`Parsed Amount #${i+1}:`, parsedAmt);
  }
}

// Extract Beneficiary & Remarks
const beneficiaryMatch = sampleText.match(/(?:Beneficiary Name|Penerima|Nama)\s*:?\s*([A-Za-z0-9\s]+)/i);
const remarksMatch = sampleText.match(/(?:Remarks|Catatan|Berita)\s*:?\s*([A-Za-z0-9\s.]+)/i);

console.log("Beneficiary:", beneficiaryMatch ? beneficiaryMatch[1].trim() : "None");
console.log("Remarks:", remarksMatch ? remarksMatch[1].trim() : "None");
