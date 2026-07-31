async function testIframeFetch() {
  const APPS_SCRIPT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbznCS67gVB2zDpVlCLJwIUELX9QAJJMQtv3sPnKqHrShuGjCmGwQv7-prn6Vw0JNss/exec";
  const projectName = "PERPUSTAKAAN LANTAI 10 - PULOMAS";
  const url = `${APPS_SCRIPT_WEBHOOK_URL}?action=report&project=${encodeURIComponent(projectName)}`;

  const res = await fetch(url);
  const text = await res.text();

  const urls = [...text.matchAll(/https?:\/\/[^\s"'\\]+/g)].map(m => m[0]);
  console.log("All URLs found in response:", urls);
}

testIframeFetch();
