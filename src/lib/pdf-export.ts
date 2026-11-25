import type { CompanySetup } from '@/types/erp';

export interface PdfSummaryItem {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}

export interface PdfExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  company?: CompanySetup;
  summary?: PdfSummaryItem[];
  orientation?: 'portrait' | 'landscape';
}

const DEFAULT_COMPANY: CompanySetup = {
  name: 'Salma Rahman',
  tagline: 'Trading House',
  logoText: 'SRTH',
  logoDataUrl: '/company-logo.png',
  currency: 'BDT',
  openingCash: 0,
  openingBank: 0,
  openingBkash: 0,
  openingNagad: 0,
  address: 'House 14, Road 6, Islampur Garments Market, Dhaka-1100',
  phone: '+880 1711-000000',
};

function resolveCompany(explicit?: CompanySetup): CompanySetup {
  if (explicit) return explicit;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('srth_erp_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { company?: CompanySetup };
        if (parsed?.company?.name) return parsed.company;
      }
    } catch {
      // ignore storage read error
    }
  }
  return DEFAULT_COMPANY;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isNumericColumn(header: string, colIndex: number, rows: (string | number)[][]): boolean {
  if (/(bdt|amount|price|rate|total|paid|due|balance|cost|salary|basic|overtime|bonus|advance|deduction|qty|quantity|stock|opening|purchased|sold|returned|damaged|units|pcs|hours|%|value|discount|principal|interest|in|out|profit|sales)/i.test(header)) {
    return true;
  }
  const sample = rows.slice(0, 6).map((r) => r[colIndex]).filter((v) => v !== '' && v !== '—' && v !== undefined);
  if (sample.length === 0) return false;
  return sample.every((v) => typeof v === 'number' || /^[+\-−]?৳?[\d,.]+(%|\s*pcs|\s*h)?$/i.test(String(v).trim()));
}

function formatGeneratedTimestamp(): string {
  const now = new Date();
  return now.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sanitizePdfFilename(filename: string): string {
  return filename
    .replace(/\.csv$/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
}

/**
 * Generates a professional, branded A4 PDF document with company logo letterhead,
 * repeating diagonal company logo + name watermark on every page, formatted data table,
 * and signatory footer via a popup-safe hidden print iframe (SSR-safe).
 */
export function exportToPDF(options: PdfExportOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const company = resolveCompany(options.company);
  const orientation =
    options.orientation ?? (options.headers.length >= 7 ? 'landscape' : 'portrait');
  const cleanTitle = sanitizePdfFilename(options.filename);
  const generatedAt = formatGeneratedTimestamp();

  const rightAlignFlags = options.headers.map((h, idx) =>
    isNumericColumn(h, idx, options.rows),
  );

  const logoMarkup = company.logoDataUrl
    ? `<img src="${escapeHtml(company.logoDataUrl)}" alt="${escapeHtml(company.name)}" class="brand-logo-img" />`
    : `<div class="brand-logo-badge">${escapeHtml(company.logoText || company.name.slice(0, 2).toUpperCase())}</div>`;

  const watermarkLogoMarkup = company.logoDataUrl
    ? `<img src="${escapeHtml(company.logoDataUrl)}" alt="" class="wm-logo-img" />`
    : `<div class="wm-logo-badge">${escapeHtml(company.logoText || company.name.slice(0, 2).toUpperCase())}</div>`;

  const summaryHtml =
    options.summary && options.summary.length > 0
      ? `<div class="summary-grid">${options.summary
          .map(
            (s) => `
          <div class="summary-card">
            <div class="summary-label">${escapeHtml(s.label)}</div>
            <div class="summary-value ${s.tone === 'success' ? 'tone-success' : s.tone === 'danger' ? 'tone-danger' : ''}">${escapeHtml(s.value)}</div>
          </div>`,
          )
          .join('')}</div>`
      : '';

  const theadHtml = `<tr>${options.headers
    .map(
      (h, idx) =>
        `<th class="${rightAlignFlags[idx] ? 'num' : ''}">${escapeHtml(h)}</th>`,
    )
    .join('')}</tr>`;

  const tbodyHtml =
    options.rows.length > 0
      ? options.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, idx) => {
                  const text = cell === '' || cell === null || cell === undefined ? '—' : String(cell);
                  return `<td class="${rightAlignFlags[idx] ? 'num' : ''}">${escapeHtml(text)}</td>`;
                })
                .join('')}</tr>`,
          )
          .join('')
      : `<tr><td colspan="${Math.max(1, options.headers.length)}" class="empty-row">No records available for this report.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title></title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Bengali", Arial, sans-serif;
      color: #1a1c19;
      background: #ffffff;
      font-size: 10.5px;
      line-height: 1.45;
    }

    /* Repeating diagonal company logo & name watermark on every printed PDF page */
    .watermark {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .watermark-inner {
      transform: rotate(-28deg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      opacity: 0.065;
      text-align: center;
      user-select: none;
    }
    .wm-logo-img {
      width: 110px;
      height: 110px;
      object-fit: contain;
      border-radius: 18px;
      filter: grayscale(100%);
    }
    .wm-logo-badge {
      width: 96px;
      height: 96px;
      border-radius: 22px;
      border: 4px solid #1a1c19;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1a1c19;
    }
    .wm-company-name {
      font-size: 40px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #1a1c19;
      white-space: nowrap;
    }
    .wm-tagline {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #1a1c19;
    }

    /* Foreground document wrapper */
    .doc {
      position: relative;
      z-index: 1;
      padding: 14mm 12mm 16mm 12mm;
    }

    /* Executive Letterhead */
    .letterhead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #1f211d;
      position: relative;
    }
    .letterhead::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: -2px;
      width: 96px;
      height: 3px;
      background: #b7e34a;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo-img {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid #e4e4e0;
    }
    .brand-logo-badge {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: #1f211d;
      color: #c5f055;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .company-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0;
      color: #1a1c19;
    }
    .company-tagline {
      font-size: 10px;
      font-weight: 600;
      color: #555952;
      margin: 1px 0 3px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .company-contact {
      font-size: 9.5px;
      color: #6b6f68;
      margin: 0;
    }

    .doc-meta {
      text-align: right;
      min-width: 210px;
    }
    .doc-title {
      font-size: 14px;
      font-weight: 700;
      color: #1a1c19;
      margin: 0;
    }
    .doc-subtitle {
      font-size: 10px;
      color: #555952;
      margin: 2px 0 6px;
    }
    .meta-pills {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      font-size: 9px;
      color: #4b4f48;
    }
    .meta-pill {
      background: #f4f5f0;
      border: 1px solid #e3e5dd;
      border-radius: 5px;
      padding: 2px 7px;
      font-weight: 500;
    }

    /* Optional Summary KPI Strip */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .summary-card {
      border: 1px solid #e4e5df;
      border-radius: 8px;
      padding: 8px 10px;
      background: #fafaf7;
    }
    .summary-label {
      font-size: 8.5px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #6b6f68;
      font-weight: 600;
    }
    .summary-value {
      font-size: 13px;
      font-weight: 700;
      margin-top: 2px;
      color: #1a1c19;
      font-variant-numeric: tabular-nums;
    }
    .tone-success { color: #1b7f46; }
    .tone-danger { color: #b84a27; }

    /* Professional Table */
    .table-wrap {
      margin-top: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th {
      background: #1f211d;
      color: #ffffff;
      font-weight: 600;
      text-align: left;
      padding: 7px 8px;
      font-size: 8.8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 2px solid #b7e34a;
      white-space: nowrap;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #e7e8e2;
      color: #242622;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td {
      background: rgba(246, 247, 242, 0.72);
    }
    th.num, td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .empty-row {
      text-align: center;
      padding: 20px;
      color: #6b6f68;
      font-style: italic;
    }

    /* Signatory & Document Footer */
    .signatures {
      margin-top: 28px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      padding-top: 26px;
      border-top: 1px solid #b8bbb3;
      text-align: center;
    }
    .sig-title {
      font-size: 9.5px;
      font-weight: 600;
      color: #2a2c28;
    }
    .sig-sub {
      font-size: 8.5px;
      color: #6b6f68;
      margin-top: 2px;
    }

    .doc-footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #e4e5df;
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      color: #777b74;
    }
  </style>
</head>
<body>
  <div class="watermark" aria-hidden="true">
    <div class="watermark-inner">
      ${watermarkLogoMarkup}
      <div class="wm-company-name">${escapeHtml(company.name)}</div>
      ${company.tagline ? `<div class="wm-tagline">${escapeHtml(company.tagline)}</div>` : ''}
    </div>
  </div>

  <div class="doc">
    <header class="letterhead">
      <div class="brand">
        ${logoMarkup}
        <div>
          <h1 class="company-name">${escapeHtml(company.name)}</h1>
          ${company.tagline ? `<p class="company-tagline">${escapeHtml(company.tagline)}</p>` : ''}
          <p class="company-contact">${escapeHtml(company.address)}${company.phone ? ` &bull; ${escapeHtml(company.phone)}` : ''}</p>
        </div>
      </div>
    </header>

    ${summaryHtml}

    <div class="table-wrap">
      <table>
        <thead>${theadHtml}</thead>
        <tbody>${tbodyHtml}</tbody>
      </table>
    </div>

    <div class="signatures">
      <div class="sig-box">
        <div class="sig-title">Prepared By</div>
        <div class="sig-sub">Accounts / Operations</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">Checked By</div>
        <div class="sig-sub">Branch Manager</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">Authorized Signatory</div>
        <div class="sig-sub">${escapeHtml(company.name)}</div>
      </div>
    </div>

    <footer class="doc-footer">
      <span>${escapeHtml(company.name)} &mdash; Official Business Management Report</span>
      <span>Printed ${escapeHtml(generatedAt)}</span>
    </footer>
  </div>
</body>
</html>`;

  // Use a hidden iframe so browser popup blockers never block the PDF dialog
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  const previousTitle = document.title;
  const triggerPrint = () => {
    try {
      document.title = cleanTitle;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        document.title = previousTitle;
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  };

  // Wait for any embedded logo image to finish loading before opening Save-as-PDF dialog
  const images = Array.from(iframeDoc.images);
  if (images.length === 0) {
    setTimeout(triggerPrint, 120);
  } else {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setTimeout(triggerPrint, 120);
    };
    Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    ).then(finish);
    setTimeout(finish, 800);
  }
}
