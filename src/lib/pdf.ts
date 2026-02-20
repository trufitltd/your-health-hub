import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface PrescriptionPdfInput {
  title: string;
  lines: string[] | string;
  verificationUrl?: string;
  verificationCode?: string;
}

export const createPrescriptionPdfBlob = async ({
  title,
  lines,
  verificationUrl,
  verificationCode,
}: PrescriptionPdfInput): Promise<Blob> => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const normalizedLines = Array.isArray(lines) ? lines : String(lines ?? '').split('\n');

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 40, 48);

  if (verificationCode) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Verification Code: ${verificationCode}`, 40, 68);
  }

  if (verificationUrl) {
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 200 });
    doc.addImage(qrDataUrl, 'PNG', pageWidth - 140, 28, 92, 92);
    doc.setFontSize(9);
    doc.text('Scan to verify', pageWidth - 140, 130);
  }

  doc.setFontSize(11);
  let cursorY = 96;
  const maxTextWidth = pageWidth - 80;
  normalizedLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(String(line ?? ''), maxTextWidth);
    doc.text(wrapped, 40, cursorY);
    cursorY += wrapped.length * 15;
  });

  if (verificationUrl) {
    doc.setFontSize(10);
    doc.setTextColor(40, 90, 170);
    doc.textWithLink('Verify online', 40, Math.min(cursorY + 20, 800), { url: verificationUrl });
    doc.text(verificationUrl, 110, Math.min(cursorY + 20, 800));
  }

  return doc.output('blob');
};
