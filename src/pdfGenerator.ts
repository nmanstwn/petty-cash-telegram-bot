import PDFDocument from "pdfkit";
import fs from "fs";

export interface Transaction {
  id?: string;
  date?: string;
  description: string;
  type: "Kredit" | "Debit";
  category?: "Material" | "Upah" | "Alat" | "ATK" | "Akomodasi" | "Lain-Lain";
  amount: number;
  note?: string;
  userName?: string;
  status?: "Approved" | "Pending" | "Rejected";
  photoUrl?: string;
  photoPath?: string;
}

export interface ProjectReportData {
  projectName: string;
  year: string;
  transactions: Transaction[];
}

export function toTitleCase(str: string): string {
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

export function formatAmountNumber(num: number): string {
  if (!num || num === 0) return "-";
  return num.toLocaleString("id-ID");
}

export function formatSaldoNumber(num: number): string {
  if (!num || num === 0) return "-";
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString("id-ID")})`;
  }
  return num.toLocaleString("id-ID");
}

export function formatDateOnly(dateVal: any): string {
  if (!dateVal) return "";
  const s = String(dateVal).trim();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

  // 1. Direct YYYY-MM-DD match (e.g. 2026-07-24)
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const monthIdx = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    return `${String(day).padStart(2, "0")} ${monthNames[monthIdx]} ${year}`;
  }

  // 2. Direct DD-MM-YYYY match (e.g. 24-07-2026 or 24/07/2026)
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthIdx = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return `${String(day).padStart(2, "0")} ${monthNames[monthIdx]} ${year}`;
  }

  // 3. Direct DD Mon YYYY match (e.g. 24 Jul 2026)
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/.test(s)) {
    return s;
  }

  // 4. Fallback: Parse Date object safely using UTC methods
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;

  const day = String(d.getUTCDate()).padStart(2, "0");
  const monthIdx = d.getUTCMonth();
  const year = d.getUTCFullYear();

  return `${day} ${monthNames[monthIdx]} ${year}`;
}

function convertDriveUrlToDirect(url: string): string {
  if (!url) return url;
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1 && match1[1]) {
    return `https://drive.google.com/uc?export=view&id=${match1[1]}`;
  }
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2 && match2[1] && url.includes("drive.google.com")) {
    return `https://drive.google.com/uc?export=view&id=${match2[1]}`;
  }
  return url;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;

  if (url.startsWith("data:image")) {
    try {
      const parts = url.split(",");
      if (parts.length >= 2) {
        const base64Data = parts[1].replace(/\s+/g, "");
        if (base64Data) {
          return Buffer.from(base64Data, "base64");
        }
      }
    } catch (e) {
      console.error("❌ Base64 decode error:", e);
      return null;
    }
  }

  const directUrl = convertDriveUrlToDirect(url);
  console.log("🔍 Fetching photo URL:", directUrl);

  if (directUrl.startsWith("http")) {
    try {
      const res = await fetch(directUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        signal: AbortSignal.timeout(5000)
      });

      const contentType = res.headers.get("content-type") || "";
      console.log(`📥 Fetch status: ${res.status}, Content-Type: ${contentType}`);

      if (!res.ok) return null;

      if (!contentType.toLowerCase().startsWith("image/") && !contentType.includes("octet-stream")) {
        console.warn(`⚠️ Warning: URL returned non-image content-type: ${contentType}`);
        const driveIdMatch = directUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (driveIdMatch && driveIdMatch[1]) {
          const altUrl = `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}`;
          console.log(`🔄 Retrying with alt Google Drive URL: ${altUrl}`);
          const altRes = await fetch(altUrl, {
            signal: AbortSignal.timeout(5000)
          });
          const altType = altRes.headers.get("content-type") || "";
          if (altRes.ok && (altType.toLowerCase().startsWith("image/") || altType.includes("octet-stream"))) {
            const arrayBuf = await altRes.arrayBuffer();
            return Buffer.from(arrayBuf);
          }
        }
        return null;
      }

      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err: any) {
      console.error("❌ Fetch image error:", err.message);
      return null;
    }
  }

  return null;
}

function truncateTextToWidth(doc: typeof PDFDocument.prototype, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;

  const ellipsis = "…";
  let truncated = text;
  while (truncated.length > 0 && doc.widthOfString(truncated + ellipsis) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + ellipsis;
}

async function buildPDFDocument(data: ProjectReportData, doc: typeof PDFDocument.prototype): Promise<void> {
  const startX = 20;
  const startY = 20;
  const totalWidth = 801.89; // Fits 841.89 width with 20pt margins
  const MAX_TABLE_Y = 538;   // Bottom limit for table rows before breaking to next page
  const FOOTER_Y = 555;      // Fixed Y for footer stamp

  // Standar ketebalan garis: 2 tingkat konsisten di seluruh dokumen
  const OUTER_LINE = 0.75; // border utama/luar (title box, outer frame tabel, footer, card foto)
  const INNER_LINE = 0.4;  // grid dalam (garis antar baris, garis vertikal antar kolom)

  const cols = {
    tanggal: { x: startX, w: 60 },
    deskripsi: { x: startX + 60, w: 140 },
    kredit: {
      x: startX + 200,
      w: 330,
      sub: [
        { name: "Material", x: startX + 200, w: 55 },
        { name: "Upah", x: startX + 255, w: 55 },
        { name: "Alat", x: startX + 310, w: 55 },
        { name: "ATK", x: startX + 365, w: 55 },
        { name: "Akomodasi", x: startX + 420, w: 55 },
        { name: "Lain-Lain", x: startX + 475, w: 55 }
      ]
    },
    debit: { x: startX + 530, w: 65 },
    saldo: { x: startX + 595, w: 75 },
    keterangan: { x: startX + 670, w: 131.89 }
  };

  const vLineXPositions = [
    cols.deskripsi.x,
    cols.kredit.x,
    cols.kredit.sub[1].x,
    cols.kredit.sub[2].x,
    cols.kredit.sub[3].x,
    cols.kredit.sub[4].x,
    cols.kredit.sub[5].x,
    cols.debit.x,
    cols.saldo.x,
    cols.keterangan.x
  ];

  // Helper untuk menggambar footer stamp konsisten di setiap halaman
  function drawFooter() {
    doc.moveTo(startX, FOOTER_Y)
       .lineTo(startX + totalWidth, FOOTER_Y)
       .lineWidth(OUTER_LINE)
       .strokeColor("#000000")
       .stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333");
    doc.text("ASET HARTONO MULYA JAYA KONSTRUKSI", startX, FOOTER_Y + 5, { width: totalWidth, align: "center" });
  }

  // Helper untuk menggambar table header (Title Box + Column Headers)
  function drawTableHeader(isFirstPage: boolean): number {
    let headerY = startY;

    if (isFirstPage) {
      const titleHeight = 36;
      doc.rect(startX, startY, totalWidth, titleHeight).strokeColor("#000000").lineWidth(OUTER_LINE).stroke();
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(11);
      doc.text(`Laporan keuangan proyek ${data.projectName}`, startX, startY + 4, { width: totalWidth, align: "center" });
      doc.fontSize(10).text(`[${data.projectName}]`, startX, startY + 16, { width: totalWidth, align: "center" });
      doc.fontSize(8.5).text(`PERIODE ${data.year}`, startX, startY + 26, { width: totalWidth, align: "center" });
      headerY = startY + titleHeight;
    } else {
      const titleHeight = 26;
      doc.rect(startX, startY, totalWidth, titleHeight).strokeColor("#000000").lineWidth(OUTER_LINE).stroke();
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(10);
      doc.text(`Laporan keuangan proyek ${data.projectName} (Lanjutan)`, startX, startY + 4, { width: totalWidth, align: "center" });
      doc.fontSize(8).text(`PERIODE ${data.year}`, startX, startY + 15, { width: totalWidth, align: "center" });
      headerY = startY + titleHeight;
    }

    const headerHeight = 26;
    doc.rect(startX, headerY, totalWidth, headerHeight).lineWidth(OUTER_LINE).strokeColor("#000000").stroke();

    // Garis horizontal pemisah sub-header Kredit
    doc.moveTo(cols.kredit.x, headerY + 13)
       .lineTo(cols.kredit.x + cols.kredit.w, headerY + 13)
       .lineWidth(INNER_LINE)
       .strokeColor("#000000")
       .stroke();

    // Garis vertikal header
    vLineXPositions.forEach(vx => {
      const topY = (vx > cols.kredit.x && vx < cols.debit.x) ? (headerY + 13) : headerY;
      doc.moveTo(vx, topY).lineTo(vx, headerY + headerHeight).lineWidth(INNER_LINE).strokeColor("#000000").stroke();
    });

    // Label Header
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
    doc.text("Tanggal", cols.tanggal.x, headerY + 8, { width: cols.tanggal.w, align: "center" });
    doc.text("Deskripsi", cols.deskripsi.x, headerY + 8, { width: cols.deskripsi.w, align: "center" });

    doc.text("Kredit", cols.kredit.x, headerY + 3, { width: cols.kredit.w, align: "center" });
    doc.fontSize(7);
    cols.kredit.sub.forEach(subCol => {
      doc.text(subCol.name, subCol.x, headerY + 15, { width: subCol.w, align: "center" });
    });

    doc.fontSize(8);
    doc.text("Debit", cols.debit.x, headerY + 8, { width: cols.debit.w, align: "center" });
    doc.text("Saldo", cols.saldo.x, headerY + 8, { width: cols.saldo.w, align: "center" });
    doc.text("Keterangan", cols.keterangan.x, headerY + 8, { width: cols.keterangan.w, align: "center" });

    return headerY + headerHeight;
  }

  // Helper untuk menutup tabel di halaman aktif
  function closeTablePage(pageTableBodyTop: number, currentTableBottom: number) {
    // Garis vertikal di badan tabel
    vLineXPositions.forEach(vx => {
      doc.moveTo(vx, pageTableBodyTop)
         .lineTo(vx, currentTableBottom)
         .lineWidth(INNER_LINE)
         .strokeColor("#000000")
         .stroke();
    });

    // Outer frame border badan tabel
    doc.rect(startX, pageTableBodyTop, totalWidth, currentTableBottom - pageTableBodyTop)
       .lineWidth(OUTER_LINE)
       .strokeColor("#000000")
       .stroke();

    // Footer stamp
    drawFooter();
  }

  // ==================== 1. RENDER TABEL TRANSAKSI ====================
  let currentY = drawTableHeader(true);
  let pageTableBodyTop = currentY;
  let runningBalance = 0;

  const totalItems = Math.max(15, data.transactions.length);

  for (let i = 0; i < totalItems; i++) {
    const tx = i < data.transactions.length ? data.transactions[i] : null;

    let calcRowHeight = 16;
    let descText = "";
    let descActualHeight = 0;
    let noteActualHeight = 0;

    if (tx) {
      doc.font("Helvetica").fontSize(7.5);
      descText = toTitleCase(tx.description || "");
      const descWidth = cols.deskripsi.w - 8;
      descActualHeight = doc.heightOfString(descText, { width: descWidth });
      const noteWidth = cols.keterangan.w - 8;
      noteActualHeight = tx.note ? doc.heightOfString(tx.note, { width: noteWidth }) : 0;
      calcRowHeight = Math.max(16, descActualHeight + 7, noteActualHeight + 7);
    }

    // Jika baris ini melebihi batas bawah halaman aktif:
    if (currentY + calcRowHeight > MAX_TABLE_Y) {
      if (!tx) {
        // Jika hanya baris dummy pengisi dan sudah penuh 1 halaman, hentikan padding
        break;
      }

      // 1. Tutup tabel di halaman ini
      closeTablePage(pageTableBodyTop, currentY);

      // 2. Buat halaman baru
      doc.addPage({ margin: 20, size: "A4", layout: "landscape" });

      // 3. Gambar header baru di halaman lanjutan
      currentY = drawTableHeader(false);
      pageTableBodyTop = currentY;
    }

    const rowTop = currentY;
    const rowBottom = rowTop + calcRowHeight;

    // Garis horizontal bawah baris
    doc.moveTo(startX, rowBottom)
       .lineTo(startX + totalWidth, rowBottom)
       .lineWidth(INNER_LINE)
       .strokeColor("#000000")
       .stroke();

    if (tx) {
      const textPaddingY = rowTop + 3.5;
      doc.font("Helvetica").fontSize(7.5).fillColor("#000000");

      if (tx.date) {
        doc.text(formatDateOnly(tx.date), cols.tanggal.x + 2, textPaddingY, { width: cols.tanggal.w - 4, align: "center" });
      }

      // Deskripsi: rata kiri, vertical center
      const descWidth = cols.deskripsi.w - 8;
      const descY = rowTop + (calcRowHeight - descActualHeight) / 2;
      doc.text(descText, cols.deskripsi.x + 4, descY, { width: descWidth, align: "left" });

      if (tx.type === "Debit") {
        runningBalance += tx.amount;
        doc.text(formatAmountNumber(tx.amount), cols.debit.x + 2, textPaddingY, { width: cols.debit.w - 4, align: "right" });
      } else {
        runningBalance -= tx.amount;
        const descLower = (tx.description || "").toLowerCase();
        let cat = tx.category || "Lain-Lain";
        if (descLower.includes("kontrakan")) cat = "Akomodasi";

        const targetSub = cols.kredit.sub.find(s => s.name === cat) || cols.kredit.sub[5];
        doc.text(formatAmountNumber(tx.amount), targetSub.x + 2, textPaddingY, { width: targetSub.w - 4, align: "right" });
      }

      doc.text(formatSaldoNumber(runningBalance), cols.saldo.x + 2, textPaddingY, { width: cols.saldo.w - 4, align: "right" });

      if (tx.note) {
        const noteWidth = cols.keterangan.w - 8;
        const noteY = rowTop + (calcRowHeight - noteActualHeight) / 2;
        doc.text(tx.note, cols.keterangan.x + 4, noteY, { width: noteWidth, align: "left" });
      }
    }

    currentY += calcRowHeight;
  }

  // Tutup halaman tabel terakhir
  closeTablePage(pageTableBodyTop, currentY);

  // ==================== 2. RENDER LAMPIRAN FOTO ====================
  const txsWithPhoto = data.transactions.filter(t => Boolean(t.photoUrl) || (t.photoPath && fs.existsSync(t.photoPath)));

  if (txsWithPhoto.length > 0) {
    const PHOTOS_PER_ROW = 4;
    const ROWS_PER_PAGE = 2;
    const PHOTOS_PER_PAGE = PHOTOS_PER_ROW * ROWS_PER_PAGE; // 8 foto per lembar
    const cardGap = 12;
    const cardW = (totalWidth - (PHOTOS_PER_ROW - 1) * cardGap) / PHOTOS_PER_ROW;
    const cardH = 230;
    const headerTitleH = 34;
    const gridStartY = startY + headerTitleH + 12;
    const headerZoneH = 40;
    const headerBottomGap = 8;

    function drawPhotoPageHeader() {
      doc.rect(startX, startY, totalWidth, headerTitleH).strokeColor("#000000").lineWidth(OUTER_LINE).stroke();
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(10.5);
      doc.text("LAMPIRAN DOKUMENTASI FOTO BUKTI NOTA & TRANSFER (REKAP MINGGUAN)", startX, startY + 5, { width: totalWidth, align: "center" });
      doc.fontSize(9.5).text(`[${data.projectName}]`, startX, startY + 18, { width: totalWidth, align: "center" });
    }

    // Buka halaman lampiran pertama
    doc.addPage({ margin: 20, size: "A4", layout: "landscape" });
    drawPhotoPageHeader();

    for (let idx = 0; idx < txsWithPhoto.length; idx++) {
      const pagePhotoIdx = idx % PHOTOS_PER_PAGE;

      // Jika berpindah lembar lampiran (setiap 8 kartu)
      if (idx > 0 && pagePhotoIdx === 0) {
        drawFooter();
        doc.addPage({ margin: 20, size: "A4", layout: "landscape" });
        drawPhotoPageHeader();
      }

      const rowIdx = Math.floor(pagePhotoIdx / PHOTOS_PER_ROW);
      const colIdx = pagePhotoIdx % PHOTOS_PER_ROW;

      const cardX = startX + colIdx * (cardW + cardGap);
      const photoY = gridStartY + rowIdx * (cardH + 12);

      const tx = txsWithPhoto[idx];

      // Outer Card Frame
      doc.rect(cardX, photoY, cardW, cardH).strokeColor("#000000").lineWidth(OUTER_LINE).stroke();

      // Card Header: judul + info nominal
      const cat = tx.category || "Lain-Lain";
      const type = tx.type || "Kredit";
      const textAreaWidth = cardW - 12;

      const titleText = `Bukti #${idx + 1}: ${formatDateOnly(tx.date)} - ${toTitleCase(tx.description)}`;
      const infoText = `Rp ${formatAmountNumber(tx.amount)} | ${cat} | ${type}`;
      const gapBetweenLines = 3;

      doc.font("Helvetica-Bold").fontSize(7.5);
      const titleHeight = doc.heightOfString(titleText, { width: textAreaWidth });

      doc.font("Helvetica").fontSize(6.5);
      const infoHeight = doc.heightOfString(infoText, { width: textAreaWidth });

      const totalTextHeight = titleHeight + gapBetweenLines + infoHeight;
      const textBlockStartY = photoY + (headerZoneH - totalTextHeight) / 2;

      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000000");
      doc.text(titleText, cardX + 6, textBlockStartY, { width: textAreaWidth, align: "left" });

      doc.font("Helvetica").fontSize(6.5).fillColor("#333333");
      doc.text(infoText, cardX + 6, textBlockStartY + titleHeight + gapBetweenLines, { width: textAreaWidth, align: "left" });

      // Inner Photo Container Box
      const imgFrameX = cardX + 6;
      const imgFrameY = photoY + headerZoneH;
      const imgFrameW = cardW - 12;
      const imgFrameH = cardH - headerZoneH - headerBottomGap;

      doc.rect(imgFrameX, imgFrameY, imgFrameW, imgFrameH).strokeColor("#cbd5e1").lineWidth(INNER_LINE).stroke();

      let imgBuf: Buffer | null = null;
      if (tx.photoPath && fs.existsSync(tx.photoPath)) {
        try { imgBuf = fs.readFileSync(tx.photoPath); } catch {}
      } else if (tx.photoUrl) {
        imgBuf = await fetchImageBuffer(tx.photoUrl);
      }

      if (imgBuf && imgBuf.length > 50) {
        try {
          doc.fillColor("#000000");
          doc.image(imgBuf, imgFrameX + 2, imgFrameY + 2, {
            fit: [imgFrameW - 4, imgFrameH - 4],
            align: "center",
            valign: "center"
          });
        } catch (imgErr) {
          console.error("PDFKit doc.image error:", imgErr);
          doc.rect(imgFrameX, imgFrameY, imgFrameW, imgFrameH).fillAndStroke("#f8fafc", "#cbd5e1");
          doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(9);
          doc.text(`📷 FOTO BUKTI DOKUMENTASI NOTA / TRANSFER #${idx + 1}`, imgFrameX, imgFrameY + (imgFrameH / 2) - 5, { width: imgFrameW, align: "center" });
        }
      } else {
        doc.rect(imgFrameX, imgFrameY, imgFrameW, imgFrameH).fillAndStroke("#f8fafc", "#cbd5e1");
        doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(9);
        doc.text(`📷 FOTO BUKTI DOKUMENTASI NOTA / TRANSFER #${idx + 1}`, imgFrameX, imgFrameY + (imgFrameH / 2) - 12, { width: imgFrameW, align: "center" });
        doc.font("Helvetica").fontSize(7.5).fillColor("#94a3b8");
        doc.text("(Kirim foto nota fisik di Telegram saat input transaksi untuk menampilkan foto di sini)", imgFrameX, imgFrameY + (imgFrameH / 2) + 4, { width: imgFrameW, align: "center" });
      }
    }

    // Footer di lembar lampiran foto terakhir
    drawFooter();
  }

  doc.end();
}

export function generatePDFBuffer(data: ProjectReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 20, size: "A4", layout: "landscape" });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", (err) => reject(err));

    buildPDFDocument(data, doc).catch(reject);
  });
}

export function generatePDFReport(data: ProjectReportData, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 20, size: "A4", layout: "landscape" });
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);
    buildPDFDocument(data, doc).catch(reject);

    stream.on("finish", () => resolve(outputPath));
    stream.on("error", (err) => reject(err));
  });
}
