function escapeHtml(val) {
  if (val == null) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatExportResponse(res, { filename, headers, rows, format = "csv" }) {
  const isXls = String(format).toLowerCase() === "xls";

  if (isXls) {
    const safeFilename = filename.endsWith(".xls") ? filename : `${filename.replace(/\.csv$/, "")}.xls`;
    const xml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>Sheet1</x:Name>
    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  table { border-collapse: collapse; font-family: Sarabun, Tahoma, sans-serif; font-size: 11pt; }
  th { background-color: #4F46E5; color: #FFFFFF; font-weight: bold; border: 1px solid #CBD5E1; padding: 8px 12px; text-align: left; }
  td { border: 1px solid #CBD5E1; padding: 6px 12px; }
  .text-cell { mso-number-format: "\\@"; }
</style>
</head>
<body>
<table>
  <thead>
    <tr>
      ${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
    </tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (r) =>
          `<tr>${r
            .map((c) => `<td class="text-cell">${escapeHtml(c)}</td>`)
            .join("")}</tr>`,
      )
      .join("")}
  </tbody>
</table>
</body>
</html>`.trim();

    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
    );
    return res.send("\uFEFF" + xml);
  }

  // Standard UTF-8 CSV with BOM
  const safeFilename = filename.endsWith(".csv") ? filename : `${filename.replace(/\.xls$/, "")}.csv`;
  const escapeCsv = (val) => {
    const s = val == null ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const csv =
    "\uFEFF" +
    [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
  );
  return res.send(csv);
}

