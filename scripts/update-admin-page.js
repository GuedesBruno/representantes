const fs = require('fs');

const file = 'src/app/dashboard/admin/produtos-modelos/page.tsx';
let content = fs.readFileSync(file, 'utf-8');

// 1. imports
content = content.replace(
  "import { db } from '@/lib/firebase';",
  "import { db } from '@/lib/firebase';\nimport { AMBIENTES_PRODUTO } from '@/lib/constants';"
);

// 2. interface
content = content.replace(
  "categoria?: string;",
  "categoria?: string;\n  ambientes?: string[];"
);

// 3. EMPTY_FORM
content = content.replace(
  "categoria: '',",
  "categoria: '',\n  ambientes: [] as string[],"
);

// 4. normalizeRow
content = content.replace(
  /function normalizeRow[\s\S]*?}/,
  `function normalizeRow(values: unknown[]): typeof EMPTY_FORM {
  const toText = (v: unknown) => String(v ?? '').trim();
  const ambientesRaw = toText(values[3]);
  const ambientes = ambientesRaw ? ambientesRaw.split(',').map(a => a.trim()).filter(Boolean) : [];
  return {
    nome: toText(values[0]),
    nomeAbreviado: toText(values[1]),
    categoria: toText(values[2]),
    ambientes,
    fotoUrl: toText(values[4]),
    catalogoUrl: toText(values[5]),
    precoUnitario: toText(values[6]),
    linkSite: toText(values[7]),
    videoUrl: toText(values[8]),
    descricaoCurta: toText(values[9]),
    ordemExibicao: toText(values[10]),
    descricao: toText(values[11]),
  };
}`
);

// 5. openEdit
content = content.replace(
  "categoria: p.categoria ?? '',",
  "categoria: p.categoria ?? '',\n      ambientes: p.ambientes ?? [],"
);

// 6. handleSubmit payload
content = content.replace(
  "categoria: form.categoria.trim(),",
  "categoria: form.categoria.trim(),\n        ambientes: form.ambientes,"
);

// 7. handleCsvImport payload
content = content.replace(
  "categoria: row.categoria.trim(),",
  "categoria: row.categoria.trim(),\n          ambientes: row.ambientes,"
);

// 8. export CSV headers & rows
content = content.replace(
  "      'categoria',",
  "      'categoria',\n      'ambientes',"
);
content = content.replace(
  "      \`\"\${(p.categoria || '').replace(/\"/g, '\"\"')}\"\`,",
  "      \`\"\${(p.categoria || '').replace(/\"/g, '\"\"')}\"\`,\n      \`\"\${(p.ambientes || []).join(', ')}\"\`,"
);

// 9. UI Form
const uiFormMatch = `              <div className={styles.field}>
                <label className={styles.label} htmlFor="ordemExibicao">Ordem de Exibição</label>`;

const uiFormReplacement = `              <div className={\`\${styles.field} \${styles.fieldFull}\`}>
                <label className={styles.label}>Ambientes</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {AMBIENTES_PRODUTO.map(amb => (
                    <label key={amb} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.ambientes.includes(amb)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm(prev => ({ ...prev, ambientes: [...prev.ambientes, amb] }));
                          } else {
                            setForm(prev => ({ ...prev, ambientes: prev.ambientes.filter(a => a !== amb) }));
                          }
                        }}
                      />
                      {amb}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ordemExibicao">Ordem de Exibição</label>`;

content = content.replace(uiFormMatch, uiFormReplacement);


// 10. Fix CSV Splice Logic - We need to replace it entirely
const spliceRegex = /if \(cols\.length < 5\) \{[\s\S]*?cols\.push\(''\); \/\/ descricao\n\s*\} else if \(cols\.length === 10\) \{[\s\S]*?\}/g;

const spliceReplacement = `if (cols.length < 5) {
                setCsvError('Linha inválida: esperadas ao menos 5 colunas.');
                return;
              }
              if (cols.length === 5) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(2, 0, ''); // categoria
                cols.splice(3, 0, ''); // ambientes
                cols.splice(5, 0, ''); // catalogoUrl
                cols.splice(8, 0, ''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 6) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(2, 0, ''); // categoria
                cols.splice(3, 0, ''); // ambientes
                cols.splice(5, 0, ''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 7) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(2, 0, ''); // categoria
                cols.splice(3, 0, ''); // ambientes
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 8) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(3, 0, ''); // ambientes
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 9) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.push(''); // ambientes
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 10) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.push(''); // ambientes
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
              } else if (cols.length === 11) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.push(''); // ambientes
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
              }`;

content = content.replace(spliceRegex, spliceReplacement);


fs.writeFileSync(file, content, 'utf-8');
console.log('Admin page updated.');
