function formatDisplayDate(dateVal) {
  if (!dateVal) return "";

  if (Object.prototype.toString.call(dateVal) === '[object Date]') {
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, "0");
    const d = String(dateVal.getDate()).padStart(2, "0");
    const monthMap = {
      "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
      "07": "Jul", "08": "Agt", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    };
    return `${d} ${monthMap[m] || m} ${y}`;
  }

  const s = String(dateVal).trim();

  if (s.includes("GMT") || s.includes("Waktu") || s.includes("00:00:00")) {
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getFullYear();
      const m = String(dObj.getMonth() + 1).padStart(2, "0");
      const d = String(dObj.getDate()).padStart(2, "0");
      const monthMap = {
        "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
        "07": "Jul", "08": "Agt", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
      };
      return `${d} ${monthMap[m] || m} ${y}`;
    }
  }

  const parts = s.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parts[0];
    const monthMap = {
      "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun",
      "07": "Jul", "08": "Agt", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
    };
    const monthName = monthMap[parts[1]] || parts[1];
    const day = parts[2];
    return `${day} ${monthName} ${year}`;
  }
  return s;
}

console.log("Test 1 (ISO):", formatDisplayDate("2026-07-24"));
console.log("Test 2 (JS Date):", formatDisplayDate(new Date(2026, 6, 24)));
console.log("Test 3 (GMT string):", formatDisplayDate("Fri Jul 24 2026 00:00:00 GMT+0700 (Waktu Indonesia Barat)"));
