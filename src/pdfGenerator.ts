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
        }
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
          const altRes = await fetch(altUrl);
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

async function buildPDFDocument(data: ProjectReportData, doc: typeof PDFDocument.prototype): Promise<void> {
  const startX = 20;
  const startY = 20;
  const totalWidth = 801.89; // Fits 841.89 width with 20pt margins

  // 1. TITLE BOX HEADER
  const titleHeight = 36;
  doc.rect(startX, startY, totalWidth, titleHeight).strokeColor("#000000").lineWidth(1).stroke();

  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(11);
  doc.text(`Laporan keuangan proyek ${data.projectName}`, startX, startY + 4, { width: totalWidth, align: "center" });
  doc.fontSize(10).text(`[${data.projectName}]`, startX, startY + 16, { width: totalWidth, align: "center" });
  doc.fontSize(8.5).text(`PERIODE ${data.year}`, startX, startY + 26, { width: totalWidth, align: "center" });

  // 2. TABLE HEADERS GEOMETRY
  const headerY = startY + titleHeight;
  const headerHeight = 26;

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

  doc.rect(startX, headerY, totalWidth, headerHeight).lineWidth(1).stroke();

  doc.moveTo(cols.kredit.x, headerY + 13)
     .lineTo(cols.kredit.x + cols.kredit.w, headerY + 13)
     .lineWidth(0.8)
     .stroke();

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

  vLineXPositions.forEach(vx => {
    const topY = (vx > cols.kredit.x && vx < cols.debit.x) ? (headerY + 13) : headerY;
    doc.moveTo(vx, topY).lineTo(vx, headerY + headerHeight).lineWidth(0.8).stroke();
  });

  doc.font("Helvetica-Bold").fontSize(8);
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

  // 3. TABLE BODY
  let currentY = headerY + headerHeight;
  let runningBalance = 0;

  doc.font("Helvetica").fontSize(7.5).fillColor("#000000");

  const minRows = Math.max(15, data.transactions.length);

  for (let i = 0; i < minRows; i++) {
    const tx = i < data.transactions.length ? data.transactions[i] : null;
    let calcRowHeight = 16;

    if (tx) {
      const descHeight = doc.heightOfString(tx.description || "", { width: cols.deskripsi.w - 8 });
      const noteHeight = doc.heightOfString(tx.note || "", { width: cols.keterangan.w - 8 });
      calcRowHeight = Math.max(16, descHeight + 7, noteHeight + 7);
    }

    const rowTop = currentY;

    doc.rect(startX, rowTop, totalWidth, calcRowHeight).lineWidth(0.5).stroke();

    vLineXPositions.forEach(vx => {
      doc.moveTo(vx, rowTop).lineTo(vx, rowTop + calcRowHeight).lineWidth(0.5).stroke();
    });

    if (tx) {
      const textPaddingY = rowTop + 3.5;

      if (tx.date) {
        doc.text(tx.date, cols.tanggal.x + 2, textPaddingY, { width: cols.tanggal.w - 4, align: "center" });
      }

      doc.text(toTitleCase(tx.description), cols.deskripsi.x + 4, textPaddingY, { width: cols.deskripsi.w - 8, align: "left", lineBreak: false });

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
        doc.text(tx.note, cols.keterangan.x + 4, textPaddingY, { width: cols.keterangan.w - 8, align: "left", lineBreak: false });
      }
    }

    currentY += calcRowHeight;
  }

  // Footer Stamp on Page 1
  doc.moveTo(startX, currentY + 10).lineTo(startX + totalWidth, currentY + 10).lineWidth(1).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333");
  doc.text("ASET HARTONO MULYA JAYA KONSTRUKSI", startX, currentY + 15, { width: totalWidth, align: "center" });

  // 4. PAGE 2: PHOTO ATTACHMENTS (2 CARDS PER ROW, 2 ROWS PER PAGE = 4 CARDS PER PAGE)
  const txsWithPhoto = data.transactions.filter(t => Boolean(t.photoUrl) || (t.photoPath && fs.existsSync(t.photoPath)));

  if (txsWithPhoto.length > 0) {
    doc.addPage({ margin: 20, size: "A4", layout: "landscape" });

    // Header Title Box
    const headerTitleH = 34;
    doc.rect(startX, startY, totalWidth, headerTitleH).strokeColor("#000000").lineWidth(1).stroke();
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(10.5);
    doc.text("LAMPIRAN DOKUMENTASI FOTO BUKTI NOTA & TRANSFER (REKAP MINGGUAN)", startX, startY + 5, { width: totalWidth, align: "center" });
    doc.fontSize(9.5).text(`[${data.projectName}]`, startX, startY + 18, { width: totalWidth, align: "center" });

    let photoY = startY + headerTitleH + 12;
    let colIdx = 0;
    const cardW = 393; // 2 columns: (801.89 - 15) / 2 = 393.44pt
    const cardH = 230; // 2 rows fit within 540pt

    for (let idx = 0; idx < txsWithPhoto.length; idx++) {
      const tx = txsWithPhoto[idx];
      const cardX = startX + colIdx * (cardW + 15.89);

      // Card Outer Frame
      doc.rect(cardX, photoY, cardW, cardH).strokeColor("#000000").lineWidth(0.9).stroke();

      // Card Header Info (Line 1 & Line 2)
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
      doc.text(`Bukti #${idx + 1}: ${tx.date || ""} - ${toTitleCase(tx.description)}`, cardX + 8, photoY + 7, { width: cardW - 16, align: "left", lineBreak: false });
      
      const cat = tx.category || "Lain-Lain";
      const type = tx.type || "Kredit";
      doc.font("Helvetica").fontSize(8).fillColor("#333333");
      doc.text(`Nominal: Rp ${formatAmountNumber(tx.amount)} | Kategori: ${cat} | Tipe: ${type}`, cardX + 8, photoY + 20, { width: cardW - 16, align: "left", lineBreak: false });

      // Inner Photo Container Box
      const imgFrameX = cardX + 8;
      const imgFrameY = photoY + 34;
      const imgFrameW = cardW - 16;
      const imgFrameH = cardH - 42;

      // Draw light container border
      doc.rect(imgFrameX, imgFrameY, imgFrameW, imgFrameH).strokeColor("#cbd5e1").lineWidth(0.8).stroke();

      let imgBuf: Buffer | null = null;
      if (tx.photoPath && fs.existsSync(tx.photoPath)) {
        try { imgBuf = fs.readFileSync(tx.photoPath); } catch {}
      } else if (tx.photoUrl) {
        imgBuf = await fetchImageBuffer(tx.photoUrl);
      }

      if (imgBuf) {
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
        doc.text(`📷 FOTO BUKTI DOKUMENTASI NOTA / TRANSFER #${idx + 1}`, imgFrameX, imgFrameY + (imgFrameH / 2) - 5, { width: imgFrameW, align: "center" });
      }

      colIdx++;
      if (colIdx >= 2) {
        colIdx = 0;
        photoY += cardH + 12;
        if (photoY + cardH > 550 && idx < txsWithPhoto.length - 1) {
          doc.addPage({ margin: 20, size: "A4", layout: "landscape" });
          photoY = startY;
        }
      }
    }

    // Footer Stamp on Page 2
    doc.moveTo(startX, 555).lineTo(startX + totalWidth, 555).lineWidth(1).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333");
    doc.text("ASET HARTONO MULYA JAYA KONSTRUKSI", startX, 560, { width: totalWidth, align: "center" });
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
