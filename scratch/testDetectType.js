function detectTransactionTypeAndCategory(text) {
  const tLower = (text || "").toLowerCase();
  
  const debitKeywords = ["debit", "uang masuk", "topup", "top up", "reimburse", "masuk", "terima", "terima uang", "setoran"];
  let isDebit = false;
  for (let kw of debitKeywords) {
    if (tLower.includes(kw)) {
      isDebit = true;
      break;
    }
  }

  if (isDebit) {
    return { type: "Debit", category: "Uang Masuk / TopUp" };
  }

  let category = "Lain-Lain";

  const catRules = [
    { cat: "Upah", keywords: ["tukang", "kontrakan tukang", "gaji", "upah", "honor", "lembur", "mandor", "kasbon tukang"] },
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

console.log("Test 1:", detectTransactionTypeAndCategory("1.6 bayar kontrakan tukang pek. pulomas"));
console.log("Test 2:", detectTransactionTypeAndCategory("150rb beli semen 3 sak"));
console.log("Test 3:", detectTransactionTypeAndCategory("50rb beli bensin pertalite"));
console.log("Test 4:", detectTransactionTypeAndCategory("100rb sewa bor"));
console.log("Test 5:", detectTransactionTypeAndCategory("25rb fotocopy & print"));
console.log("Test 6:", detectTransactionTypeAndCategory("2.1jt topup kas utama"));
