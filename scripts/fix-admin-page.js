const fs = require('fs');
const file = 'src/app/dashboard/admin/produtos-modelos/page.tsx';
let content = fs.readFileSync(file, 'utf-8');

const search = `  };
  if (!cleaned || cleaned === '-' || cleaned === '--') return NaN;`;

const replace = `  };
}

function parseOrderInput(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePrecoInput(raw: string): number {
  const value = raw.trim();
  if (!value) return NaN;

  // Accept common BR formats like "R$ 28.000,00" and plain "28000.00".
  const cleaned = value
    .replace(/\\s+/g, '')
    .replace(/^R\\$/i, '')
    .replace(/[^\\d,.-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '--') return NaN;`;

content = content.replace(search, replace);
fs.writeFileSync(file, content, 'utf-8');
console.log('Fixed syntax error.');
