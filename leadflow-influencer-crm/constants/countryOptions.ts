type CountryOption = {
  label: string;
  value: string;
  code: string;
};

type RawCountryRow = {
  code: string;
  label: string;
  enName: string;
};

const EXCLUDED_REGION_CODES = new Set([
  'EU', // European Union
  'EZ', // Eurozone
  'UN', // United Nations
  'XA', // Pseudo locale
  'XB', // Pseudo locale
]);

function getDisplayNames(locale: string) {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      return new Intl.DisplayNames([locale], { type: 'region' });
    }
  } catch (_err) {
    // Fall through to minimal fallback.
  }
  return { of: (code: string) => code } as { of: (code: string) => string };
}

function buildCountryOptionsZh(): CountryOption[] {
  const zh = getDisplayNames('zh-CN');
  const en = getDisplayNames('en');
  const rawItems: RawCountryRow[] = [];

  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      if (EXCLUDED_REGION_CODES.has(code)) continue;

      const zhName = String(zh.of(code) || code);
      const enName = String(en.of(code) || code);
      if (!zhName && !enName) continue;
      if (zhName === code && enName === code) continue;
      if (/pseudo/i.test(enName)) continue;

      rawItems.push({
        code,
        label: zhName,
        enName,
      });
    }
  }

  // Intl can expose deprecated/alias region codes (e.g. GB/UK, VN/VD). Merge same Chinese label
  // into one dropdown item so the UI doesn't show duplicates, while preserving aliases for backend matching.
  const byLabel = new Map<string, RawCountryRow[]>();
  rawItems.forEach((item) => {
    const key = item.label.trim();
    if (!byLabel.has(key)) byLabel.set(key, []);
    byLabel.get(key)!.push(item);
  });

  const items: CountryOption[] = Array.from(byLabel.entries()).map(([label, rows]) => {
    const seenTokens = new Set<string>();
    const tokens: string[] = [];
    rows.forEach((row) => {
      [row.code, row.enName].forEach((token) => {
        const text = String(token || '').trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (seenTokens.has(key)) return;
        seenTokens.add(key);
        tokens.push(text);
      });
    });

    // Prefer a stable canonical code in display metadata (shortest non-alias heuristic by sort order).
    const sortedRows = rows.slice().sort((a, b) => a.code.localeCompare(b.code));
    const canonicalCode = sortedRows[0]?.code || '';

    return {
      code: canonicalCode,
      label,
      // Backend parses all aliases/names from this pipe-delimited payload.
      value: `${tokens.join('|')}|${label}`,
    };
  });

  items.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  return items;
}

export const COUNTRY_OPTIONS_ZH = buildCountryOptionsZh();
