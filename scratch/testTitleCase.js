function toTitleCase(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .split(" ")
    .map(word => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

console.log("Test 1:", toTitleCase("KONTRAKAN TUKANG PEK. PULOMAS"));
console.log("Test 2:", toTitleCase("kontrakan tukang pek. pulomas"));
console.log("Test 3:", toTitleCase("beli semen 3 sak - toko bangunan jaya"));
