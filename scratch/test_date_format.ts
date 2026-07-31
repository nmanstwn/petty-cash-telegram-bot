function formatDateOnlyInline(dateVal: any): string {
  if (!dateVal) return "";
  const s = String(dateVal).trim();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

  // 1. Direct YYYY-MM-DD (e.g. 2026-07-24)
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const monthIdx = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return `${String(day).padStart(2, "0")} ${monthNames[monthIdx]} ${year}`;
  }

  // 2. Direct DD-MM-YYYY (e.g. 24-07-2026 or 24/07/2026)
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthIdx = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return `${String(day).padStart(2, "0")} ${monthNames[monthIdx]} ${year}`;
  }

  // 3. Direct DD Mon YYYY (e.g. 24 Jul 2026)
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(s)) {
    return s;
  }

  // 4. Fallback: Parse Date object using UTC methods
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;

  const day = String(d.getUTCDate()).padStart(2, "0");
  const monthIdx = d.getUTCMonth();
  const year = d.getUTCFullYear();

  return `${day} ${monthNames[monthIdx]} ${year}`;
}

console.log("Test 2026-07-24:", formatDateOnlyInline("2026-07-24"));
console.log("Test 2026-07-24T00:00:00.000Z:", formatDateOnlyInline("2026-07-24T00:00:00.000Z"));
console.log("Test 24/07/2026:", formatDateOnlyInline("24/07/2026"));
console.log("Test 24 Jul 2026:", formatDateOnlyInline("24 Jul 2026"));
