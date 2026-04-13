import { useEffect, useState } from 'react';
import styles from './visual-table.module.css';

export default function TabelaPrecosVisual() {
  const [data, setData] = useState<string[][]>([]);

  useEffect(() => {
    fetch('/tabela_precos_2026.json')
      .then((res) => res.json())
      .then((json) => setData(json));
  }, []);

  if (!data.length) return <div>Carregando tabela...</div>;

  const headers = data[0];
  const rows = data.slice(1);

  // Descobrir o índice da coluna "Valor"
  const valorIdx = headers.findIndex(h => h.toLowerCase().includes('valor'));
  const produtoIdx = headers.findIndex(h => h.toLowerCase().includes('produto'));
  // Função para abreviar o nome do produto se for muito longo
  function abreviarNome(nome: string, maxLen = 38) {
    if (nome.length <= maxLen) return nome;
    const ini = Math.ceil(maxLen / 2) - 2;
    const fim = maxLen - ini - 3;
    return nome.slice(0, ini) + '...' + nome.slice(nome.length - fim);
  }

  return (
    <div className={styles.visualTableWrap}>
      <table className={styles.visualTable}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => {
                if (j === valorIdx && cell !== undefined && cell !== null && cell !== '') {
                  const valor = typeof cell === 'number' ? cell : Number(cell);
                  if (!isNaN(valor)) {
                    return <td key={j}>{valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>;
                  }
                }
                if (j === produtoIdx && typeof cell === 'string') {
                  const abreviado = abreviarNome(cell);
                  return (
                    <td key={j} title={cell} style={{maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                      {abreviado}
                    </td>
                  );
                }
                return <td key={j}>{cell}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
