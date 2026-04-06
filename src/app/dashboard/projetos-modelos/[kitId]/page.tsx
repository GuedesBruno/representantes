'use client';

import { use, useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import type { ProdutoModelo } from '../../admin/produtos-modelos/page';
import type { KitModelo, KitItem } from '../../admin/kits-modelos/page';
import styles from './kit-detail.module.css';

interface EditableItem extends KitItem {
  quantidade: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className={styles.tooltipWrapper} aria-label={text}>
      <span className={styles.infoIcon} aria-hidden="true">i</span>
      <span className={styles.tooltipBox} role="tooltip">{text}</span>
    </span>
  );
}

export default function KitDetailPage({ params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = use(params);
  const router = useRouter();

  const [kit, setKit] = useState<KitModelo | null>(null);
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [itens, setItens] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Load kit once
  useEffect(() => {
    getDoc(doc(db, 'kits_modelos', kitId)).then((snap) => {
      if (!snap.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = { id: snap.id, ...snap.data() } as KitModelo;
      setKit(data);
      setItens(data.itens.map((i) => ({ ...i })));
    });
  }, [kitId]);

  // Load products (live prices)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'produtos_modelos')),
      (snap) => {
        setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoModelo)));
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  function setQuantidade(produtoId: string, val: string) {
    const n = Math.max(1, parseInt(val, 10) || 1);
    setItens((prev) =>
      prev.map((i) => i.produtoId === produtoId ? { ...i, quantidade: n } : i)
    );
  }

  function resetQuantidades() {
    if (!kit) return;
    setItens(kit.itens.map((i) => ({ ...i })));
  }

  const totalGeral = itens.reduce((acc, item) => {
    const p = produtos.find((x) => x.id === item.produtoId);
    return acc + (p ? p.precoUnitario * item.quantidade : 0);
  }, 0);

  if (loading) {
    return <div className={styles.loading}>Carregando…</div>;
  }

  if (notFound || !kit) {
    return (
      <div className={styles.notFound}>
        <p>Kit não encontrado.</p>
        <button type="button" className={styles.backBtn} onClick={() => router.back()}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Breadcrumb / back */}
      <button type="button" className={styles.backBtn} onClick={() => router.back()}>
        ← Voltar aos Kits
      </button>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <span className={styles.categoryBadge}>{kit.categoria}</span>
          <h2 className={styles.kitName}>{kit.nome}</h2>
          {kit.descricao && <p className={styles.kitDesc}>{kit.descricao}</p>}
        </div>
        <div className={styles.totalBox} aria-live="polite">
          <span className={styles.totalLabel}>Valor Total do Projeto</span>
          <span className={styles.totalValue}>{formatCurrency(totalGeral)}</span>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={resetQuantidades}
          >
            Restaurar quantidades
          </button>
        </div>
      </div>

      {/* Products table */}
      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Produto</th>
                <th className={styles.th} style={{ width: '100px', textAlign: 'center' }}>Quantidade</th>
                <th className={styles.th} style={{ width: '80px', textAlign: 'center' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const produto = produtos.find((p) => p.id === item.produtoId);
                return (
                  <tr key={item.produtoId} className={styles.tr}>
                    {/* Photo + name + tooltip */}
                    <td className={styles.td}>
                      <div className={styles.productCell}>
                        {produto?.fotoUrl ? (
                          <img
                            src={produto.fotoUrl}
                            alt={item.nomeProduto}
                            className={styles.thumb}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.thumbPlaceholder} aria-hidden="true" />
                        )}
                        <span className={styles.productName}>
                          {item.nomeProduto}
                          {produto?.descricaoCurta && (
                            <Tooltip text={produto.descricaoCurta} />
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Editable quantity */}
                    <td className={styles.td} style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => setQuantidade(item.produtoId, e.target.value)}
                        className={styles.qtyInput}
                        aria-label={`Quantidade de ${item.nomeProduto}`}
                      />
                    </td>

                    {/* External link */}
                    <td className={styles.td} style={{ textAlign: 'center' }}>
                      {produto?.linkSite ? (
                        <a
                          href={produto.linkSite}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.extLink}
                          aria-label={`Ver ${item.nomeProduto} no site`}
                          title="Ver no site"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <polyline points="15 3 21 3 21 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      ) : (
                        <span className={styles.noLink}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Total footer — price privacy: only total, no unit prices */}
        <div className={styles.totalFooter} aria-live="polite">
          <span className={styles.totalFooterLabel}>Total do Projeto</span>
          <span className={styles.totalFooterValue}>{formatCurrency(totalGeral)}</span>
        </div>
      </div>

      <p className={styles.privacyNote}>
        * Os preços unitários dos produtos não são exibidos individualmente.
      </p>
    </div>
  );
}
