async function testJsonData() {
  const APPS_SCRIPT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec";
  const projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";
  const url = `${APPS_SCRIPT_WEBHOOK_URL}?action=json_data&project=${encodeURIComponent(projectName)}`;

  console.log("🔍 Fetching:", url);
  const res = await fetch(url, { redirect: "follow" });
  console.log("📥 Status:", res.status);
  console.log("📥 Headers:", res.headers.get("content-type"));

  const txt = await res.text();
  console.log("📦 Body (first 500 chars):\n", txt.slice(0, 500));
}

testJsonData();
