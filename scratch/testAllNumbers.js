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

const tests = [
  "400rb",
  "400ribu",
  "400k",
  "50rb",
  "250k",
  "1.6jt",
  "1,6jt",
  "1.6",
  "2.1",
  "0.5",
  "1500rb",
  "2juta",
  "1.5m",
  "400000"
];

tests.forEach(t => {
  console.log(`${t} => Rp ${parseAmountString(t).toLocaleString("id-ID")}`);
});
