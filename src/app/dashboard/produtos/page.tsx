'use client';

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ProdutoModelo } from '../admin/produtos-modelos/page';
import styles from './produtos.module.css';

function normalizeExternalUrl(rawUrl: string): string | null {
  const input = rawUrl.trim();
  if (!input) return null;

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeRichHtml(raw: string) {
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'span', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: ['style'],
  });
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [produtoInfoAberto, setProdutoInfoAberto] = useState<ProdutoModelo | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'produtos_modelos'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoModelo));
        docs.sort((a, b) => {
          const ordemA = Number.isFinite(a.ordemExibicao) ? Number(a.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          const ordemB = Number.isFinite(b.ordemExibicao) ? Number(b.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          if (ordemA !== ordemB) return ordemA - ordemB;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        });
        setProdutos(docs);
        setLoadError('');
        setLoading(false);
      },
      () => {
        setLoadError('Nao foi possivel carregar os produtos no momento.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  if (loading) {
    return <div className={styles.loading}>Carregando produtos...</div>;
  }

  if (loadError) {
    return <div className={styles.error}>{loadError}</div>;
  }

  return (
    <div className={styles.page}>
      {produtos.length === 0 ? (
        <div className={styles.empty}>Nenhum produto cadastrado.</div>
      ) : (
        <section className={styles.grid}>
          {produtos.map((produto) => {
            const catalogoUrl = normalizeExternalUrl(produto.catalogoUrl || '');
            const videoUrl = normalizeExternalUrl(produto.videoUrl || '');
            const siteUrl = normalizeExternalUrl(produto.linkSite || '');
            const displayName = produto.nomeAbreviado?.trim() || produto.nome;

            return (
              <article key={produto.id} className={styles.card} title={produto.nome}>
                <div className={styles.thumbWrap}>
                  {produto.fotoUrl ? (
                    <img src={produto.fotoUrl} alt={produto.nome} className={styles.thumb} loading="lazy" />
                  ) : (
                    <div className={styles.thumbPlaceholder} aria-hidden="true" />
                  )}
                </div>

                <h2 className={styles.name} title={produto.nome}>{displayName}</h2>
                <p className={styles.description}>{produto.descricaoCurta || 'Sem descricao cadastrada.'}</p>

                <div className={styles.actions}>
                  {catalogoUrl ? (
                    <a href={catalogoUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                      Catalogo
                    </a>
                  ) : null}

                  {videoUrl ? (
                    <a href={videoUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                      Video
                    </a>
                  ) : null}

                  {siteUrl ? (
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                      Site
                    </a>
                  ) : null}

                  <button
                    type="button"
                    className={styles.infoButton}
                    onClick={() => setProdutoInfoAberto(produto)}
                    aria-label={`Informacoes do produto ${displayName}`}
                  >
                    i
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {produtoInfoAberto ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setProdutoInfoAberto(null)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="produto-info-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setProdutoInfoAberto(null)}
              aria-label="Fechar informacoes do produto"
            >
              ✕
            </button>

            <div className={styles.modalContent}>
              <div className={styles.modalMediaColumn}>
                {produtoInfoAberto.fotoUrl ? (
                  <img
                    src={produtoInfoAberto.fotoUrl}
                    alt={produtoInfoAberto.nome}
                    className={styles.modalImage}
                  />
                ) : (
                  <div className={styles.modalImagePlaceholder} aria-hidden="true" />
                )}
              </div>

              <div className={styles.modalTextColumn}>
                <h3 id="produto-info-title" className={styles.modalTitle}>{produtoInfoAberto.nome}</h3>
                {produtoInfoAberto.descricao?.trim() ? (
                  <div
                    className={styles.modalText}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(produtoInfoAberto.descricao) }}
                  />
                ) : (
                  <p className={styles.modalText}>Sem descricao detalhada cadastrada.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
