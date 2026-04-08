'use client';

import { use, useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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

function truncateProductName(name: string, maxLength = 32) {
  if (name.length <= maxLength) {
    return name;
  }

  return `${name.slice(0, maxLength - 1)}…`;
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
  const { user } = useAuth();

  const [kit, setKit] = useState<KitModelo | null>(null);
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [itens, setItens] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteSuccess, setQuoteSuccess] = useState('');
  const [sending, setSending] = useState(false);

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

  async function handleRequestQuote() {
    setQuoteError('');
    setQuoteSuccess('');
    setSending(true);

    try {
      if (!user || !user.email) {
        throw new Error('Usuário não autenticado.');
      }

      const idToken = await user.getIdToken();

      const response = await fetch('/api/projects/request-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          kitId: kit?.id,
          kitNome: kit?.nome,
          itens: itens.map((i) => ({
            produtoId: i.produtoId,
            nomeProduto: i.nomeProduto,
            quantidade: i.quantidade,
            precoUnitario: produtos.find((p) => p.id === i.produtoId)?.precoUnitario || 0,
          })),
          totalGeral,
          representanteEmail: user.email,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Erro ao solicitar cotação.');
      }

      if (data.emailSent) {
        setQuoteSuccess('Cotação solicitada com sucesso! Em breve o vendedor entrará em contato.');
      } else {
        setQuoteError(data.message ?? 'Cotação registrada, mas o email para o vendedor não foi enviado.');
      }
      setTimeout(() => {
        router.push('/dashboard/projetos-modelos');
      }, 2500);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Erro ao solicitar cotação.');
    } finally {
      setSending(false);
    }
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
          <div className={styles.headerActions}>
            {!isCustomizing ? (
              <>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsCustomizing(true)}
                >
                  ✏️ Personalizar Projeto
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleRequestQuote}
                  disabled={sending}
                >
                  {sending ? 'Enviando...' : '📧 Solicitar Cotação'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={resetQuantidades}
                >
                  ↺ Restaurar
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsCustomizing(false)}
                >
                  ✓ Confirmado
                </button>
              </>
            )}
          </div>
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
                <th className={styles.th} style={{ width: '200px', textAlign: 'center' }}>Links</th>
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
                        <span className={styles.productName} title={item.nomeProduto}>
                          {truncateProductName(item.nomeProduto)}
                          {produto?.descricaoCurta && (
                            <Tooltip text={produto.descricaoCurta} />
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Quantity - read-only or editable */}
                    <td className={styles.td} style={{ textAlign: 'center' }}>
                      {isCustomizing ? (
                        <input
                          type="number"
                          min={1}
                          value={item.quantidade}
                          onChange={(e) => setQuantidade(item.produtoId, e.target.value)}
                          className={styles.qtyInput}
                          aria-label={`Quantidade de ${item.nomeProduto}`}
                        />
                      ) : (
                        <span className={styles.qtyReadonly}>{item.quantidade}</span>
                      )}
                    </td>

                    {/* Product links - catalog, video, website */}
                    <td className={styles.td} style={{ textAlign: 'center' }}>
                      <div className={styles.productLinksContainer}>
                        {produto?.fotoUrl && (
                          <a
                            href={produto.fotoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.productLink}
                            title="Ver catálogo"
                          >
                            📄 Catálogo
                          </a>
                        )}
                        <span className={styles.productLink} title="Vídeo em breve">🎥 Vídeo</span>
                        {produto?.linkSite && (
                          <a
                            href={produto.linkSite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.productLink}
                            title="Ir para website"
                          >
                            🌐 Site
                          </a>
                        )}
                      </div>
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

      {/* Messages */}
      {quoteError && <div className={styles.errorMsg}>{quoteError}</div>}
      {quoteSuccess && <div className={styles.successMsg}>{quoteSuccess}</div>}

      <p className={styles.privacyNote}>
        * Os preços unitários dos produtos não são exibidos individualmente.
      </p>
    </div>
  );
}
