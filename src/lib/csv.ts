/** One CSV cell. Text a spreadsheet would run as a formula is prefixed with a quote. */
export function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  // Leading =, +, -, @, tab or CR would run as a formula; a plain negative number cannot.
  const safe =
    /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)
      ? `'${text}`
      : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(lines: unknown[][]) {
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}

/** Saves `content` as a file from the browser. */
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
