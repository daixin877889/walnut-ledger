export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
export function createCsv(headers: string[], rows: unknown[][]) { return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}` }
