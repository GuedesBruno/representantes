'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'produtos_modelos'), orderBy('nome'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoModelo)));
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
      <header className={styles.header}>
        <h1 className={styles.title}>Produtos</h1>
        <p className={styles.subtitle}>Catalogos e videos refletem os dados cadastrados em Produtos Modelos.</p>
      </header>

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
                {produto.fotoUrl ? (
                  <img src={produto.fotoUrl} alt={produto.nome} className={styles.thumb} loading="lazy" />
                ) : (
                  <div className={styles.thumbPlaceholder} aria-hidden="true" />
                )}

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
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
