function detectTransactionTypeAndCategory(text) {
  const tLower = (text || "").toLowerCase();

  const incomeKeywords = [
    "uang masuk", "topup", "top up", "top-up", "reimburse", "terima transfer",
    "kas masuk", "dana masuk", "transfer masuk", "tf masuk", "masuk kas", "terima kas"
  ];

  let isIncome = false;
  for (let kw of incomeKeywords) {
    if (tLower.includes(kw)) {
      isIncome = true;
      break;
    }
  }

  if (isIncome) {
    return { type: "Debit", category: "Uang Masuk / TopUp" };
  }

  let category = "Lain-Lain";
  const catRules = [
    { cat: "Akomodasi", keywords: ["kontrakan", "sewa rumah", "sewa mess", "bensin", "pertalite", "pertamax", "solar", "tol", "parkir", "makan", "minum", "konsumsi", "nasi", "ojek", "grab", "gojek", "travel", "tiket", "makanan"] },
    { cat: "Upah", keywords: ["tukang", "gaji", "upah", "honor", "lembur", "mandor", "kasbon"] },
    { cat: "Material", keywords: ["semen", "pasir", "batu", "cat", "paku", "baut", "besi", "kayu", "pipa", "kabel", "keramik", "bata", "triplek", "material", "bahan", "benang", "colokan", "dinabolt", "kawat"] },
    { cat: "Alat", keywords: ["sewa alat", "rental", "rent", "bor", "cangkul", "helm", "rompi", "mesin", "genset", "molen"] },
    { cat: "ATK", keywords: ["kertas", "pena", "pulpen", "spidol", "materai", "print", "fotocopy", "buku", "atk", "tinta"] }
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

module.exports = { detectTransactionTypeAndCategory };
