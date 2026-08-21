import AdmZip from "adm-zip";

/**
 * Minimal, hand-built .xlsx (OOXML SpreadsheetML) writer. The app has no
 * Excel-generation library, and adding one just for this wasn't necessary:
 * `adm-zip` is already a project dependency (lib/package-installer.ts uses
 * it for theme/plugin ZIPs), and an .xlsx file IS a zip archive of a
 * handful of small, well-documented XML parts — no sharedStrings table is
 * used (cells use inline strings, which every reader — Excel, LibreOffice,
 * Google Sheets — supports natively), which keeps this to a single
 * worksheet part instead of a second cross-referenced one.
 */

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(rowNum: number, colIndex: number, value: string | number): string {
  const ref = `${colLetter(colIndex)}${rowNum}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  const str = xmlEscape(String(value));
  if (!str) return `<c r="${ref}"/>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${str}</t></is></c>`;
}

export function buildXlsxBuffer(sheetName: string, rows: (string | number)[][]): Buffer {
  const rowsXml = rows
    .map((row, i) => {
      const rowNum = i + 1;
      return `<row r="${rowNum}">${row.map((val, c) => cellXml(rowNum, c, val)).join("")}</row>`;
    })
    .join("");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;

  const safeName = xmlEscape(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf-8"));
  zip.addFile("_rels/.rels", Buffer.from(rootRels, "utf-8"));
  zip.addFile("xl/workbook.xml", Buffer.from(workbookXml, "utf-8"));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(workbookRels, "utf-8"));
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(sheetXml, "utf-8"));
  return zip.toBuffer();
}
