import xlsx from 'xlsx';
import fs from 'fs';

const workbook = xlsx.readFile('tabela_precos_2026.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

fs.writeFileSync('tabela_precos_2026.json', JSON.stringify(data, null, 2));
console.log('Planilha convertida para JSON com sucesso!');
