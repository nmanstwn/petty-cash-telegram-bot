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

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url || !url.startsWith("http")) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
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

  // 4. PAGE 2: PHOTO ATTACHMENTS (4 PHOTOS PER ROW)
  const txsWithPhoto = data.transactions.filter(t => (t.photoUrl && String(t.photoUrl).startsWith("http")) || (t.photoPath && fs.existsSync(t.photoPath)));
  if (txsWithPhoto.length > 0) {
    doc.addPage({ margin: 20, size: "A4", layout: "landscape" });

    doc.rect(startX, startY, totalWidth, 35).strokeColor("#000000").lineWidth(1).stroke();
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(11);
    doc.text(`LAMPIRAN DOKUMENTASI FOTO BUKTI NOTA & TRANSFER`, startX, startY + 6, { width: totalWidth, align: "center" });
    doc.fontSize(9).text(`[${data.projectName}]`, startX, startY + 20, { width: totalWidth, align: "center" });

    let photoY = startY + 45;
    let colIdx = 0;
    const cardW = 192; // 4 columns: (801.89 - 30) / 4 ≈ 192pt
    const cardH = 135;

    for (let idx = 0; idx < txsWithPhoto.length; idx++) {
      const tx = txsWithPhoto[idx];
      const cardX = startX + colIdx * (cardW + 10);

      doc.rect(cardX, photoY, cardW, cardH).strokeColor("#000000").lineWidth(0.8).stroke();
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000000");
      doc.text(`Bukti #${idx + 1}: ${tx.date || ""}`, cardX + 4, photoY + 5, { width: cardW - 8, align: "center" });
      doc.font("Helvetica").fontSize(7);
      doc.text(toTitleCase(tx.description), cardX + 4, photoY + 15, { width: cardW - 8, align: "center" });
      doc.text(`Rp ${formatAmountNumber(tx.amount)}`, cardX + 4, photoY + 25, { width: cardW - 8, align: "center" });

      const imgFrameY = photoY + 36;
      const imgFrameH = cardH - 42;

      let imgBuf: Buffer | null = null;
      if (tx.photoPath && fs.existsSync(tx.photoPath)) {
        try { imgBuf = fs.readFileSync(tx.photoPath); } catch {}
      } else if (tx.photoUrl) {
        imgBuf = await fetchImageBuffer(tx.photoUrl);
      }

      if (imgBuf) {
        try {
          doc.image(imgBuf, cardX + 5, imgFrameY, { fit: [cardW - 10, imgFrameH], align: "center", valig: "center" });
        } catch {
          doc.rect(cardX + 5, imgFrameY, cardW - 10, imgFrameH).fillAndStroke("#f8fafc", "#cbd5e1");
          doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8);
          doc.text(`📷 BUKTI FOTO #${idx + 1}`, cardX + 5, imgFrameY + 35, { width: cardW - 10, align: "center" });
        }
      } else {
        doc.rect(cardX + 5, imgFrameY, cardW - 10, imgFrameH).fillAndStroke("#f8fafc", "#cbd5e1");
        doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8);
        doc.text(`📷 BUKTI FOTO #${idx + 1}`, cardX + 5, imgFrameY + 35, { width: cardW - 10, align: "center" });
      }

      colIdx++;
      if (colIdx >= 4) {
        colIdx = 0;
        photoY += cardH + 12;
        if (photoY + cardH > 540) {
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
