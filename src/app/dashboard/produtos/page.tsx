'use client';

import { useEffect, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Produto } from '../admin/produtos-modelos/page';
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

function getEmbedUrl(rawUrl: string): string | null {
  const url = normalizeExternalUrl(rawUrl);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let videoId = host.includes('youtu.be') ? parsed.pathname.slice(1) : (parsed.searchParams.get('v') || parsed.pathname.split('/')[2] || '');
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
    if (host.includes('vimeo.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const videoId = parts.find(p => /^\d+$/.test(p)) || parts[0];
      const hash = parts.length > 1 && parts[parts.length - 1] !== videoId ? parts[parts.length - 1] : null;
      
      let embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1`;
      if (hash) embedUrl += `&h=${hash}`;
      return embedUrl;
    }
    return url;
  } catch {
    return null;
  }
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [produtoInfoAberto, setProdutoInfoAberto] = useState<Produto | null>(null);
  const [videoAberto, setVideoAberto] = useState<string | null>(null);
  const [strapiData, setStrapiData] = useState<{ slug: string; videoUrl: string }[]>([]);
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  useEffect(() => {
    async function fetchStrapiVideos() {
      try {
        const res = await fetch(`/api/strapi-videos`);
        if (!res.ok) {
          console.error('Falha na API interna ao buscar os vídeos do Strapi.');
          return;
        }
        const json = await res.json();
        const list: { slug: string; videoUrl: string }[] = [];
        json.data?.forEach((item: any) => {
          const attr = item.attributes || item;
          const slug = attr.slug;
          
          // Extração do Vídeo
          const vUrlRaw = attr.videos || attr.videoUrl || attr.video_url || attr.video || attr.linkVideo;
          let vUrl = '';
          if (typeof vUrlRaw === 'string') vUrl = vUrlRaw;
          else if (Array.isArray(vUrlRaw?.data)) {
            vUrl = vUrlRaw.data[0]?.attributes?.url || '';
          }
          else if (vUrlRaw?.data?.attributes?.url) vUrl = vUrlRaw.data.attributes.url;
          if (vUrl && vUrl.startsWith('/')) vUrl = `${process.env.NEXT_PUBLIC_STRAPI_URL || 'https://innovative-friendship-159ff40007.strapiapp.com'}${vUrl}`;

          // (Documentos logic removed)

          if (slug) {
            list.push({ 
              slug: String(slug).toLowerCase(), 
              videoUrl: vUrl
            });
          }
        });
        setStrapiData(list);
      } catch (err) {
        console.warn('Strapi indisponível ou bloqueado por CORS. Usando apenas vídeos cadastrados no Firebase.');
      }
    }
    fetchStrapiVideos();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'produtos'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Produto));
        docs.sort((a, b) => {
          const ordemA = Number.isFinite(a.ordemExibicao) ? Number(a.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          const ordemB = Number.isFinite(b.ordemExibicao) ? Number(b.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          if (ordemA !== ordemB) return ordemA - ordemB;
          return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
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

  const categorias = useMemo(() => {
    const cats = new Set<string>();
    produtos.forEach(p => {
      if (p.categoria) cats.add(p.categoria);
    });
    return Array.from(cats).sort();
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p => {
      const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.nomeAbreviado || '').toLowerCase().includes(busca.toLowerCase());
      const matchCat = categoriaFiltro ? p.categoria === categoriaFiltro : true;
      return matchBusca && matchCat;
    });
  }, [produtos, busca, categoriaFiltro]);

  if (loading) {
    return <div className={styles.loading}>Carregando produtos...</div>;
  }

  if (loadError) {
    return <div className={styles.error}>{loadError}</div>;
  }

  return (
    <div className={styles.page}>
      {produtos.length > 0 && (
        <div className={styles.filters}>
          <input 
            type="search" 
            placeholder="Buscar produto por nome..." 
            value={busca} 
            onChange={e => setBusca(e.target.value)} 
            className={styles.searchInput}
          />
          <select 
            value={categoriaFiltro} 
            onChange={e => setCategoriaFiltro(e.target.value)}
            className={styles.selectInput}
          >
            <option value="">Todas as categorias</option>
            {categorias.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {produtosFiltrados.length === 0 ? (
        <div className={styles.empty}>Nenhum produto encontrado.</div>
      ) : (
        <section className={styles.grid}>
          {produtosFiltrados.map((produto) => {
            const catalogoUrl = normalizeExternalUrl(produto.catalogoUrl || '');
            const videoUrl = normalizeExternalUrl(produto.videoUrl || '');
            const siteUrl = normalizeExternalUrl(produto.linkSite || '');
            
            let strapiVideoUrl = null;
            if (siteUrl) {
              try {
                const lowerSiteUrl = siteUrl.toLowerCase();
                const pathParts = new URL(siteUrl).pathname.split('/').filter(Boolean);
                const rawSlug = pathParts.pop()?.toLowerCase() || '';
                
                const matched = strapiData.find(s => 
                  s.slug === rawSlug || 
                  lowerSiteUrl.includes(`/${s.slug}`)
                );
                if (matched) {
                  strapiVideoUrl = matched.videoUrl;
                }
              } catch {}
            }
            const finalVideoUrl = videoUrl || strapiVideoUrl;

            const displayName = produto.nomeAbreviado?.trim() || produto.nome;

            return (
              <article key={produto.id} className={styles.card} title={produto.nome}>
                {produto.categoria && (
                  <span className={styles.categoryBadge}>{produto.categoria}</span>
                )}
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

                  {finalVideoUrl ? (
                    <button 
                      type="button" 
                      className={styles.linkBtn} 
                      onClick={() => {
                        const embed = getEmbedUrl(finalVideoUrl);
                        if (embed) setVideoAberto(embed);
                        else alert('Formato de vídeo não suportado.');
                      }}
                    >
                      Vídeo
                    </button>
                  ) : null}

                  {siteUrl ? (
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                      Site
                    </a>
                  ) : null}

                  {/* Documentos button removed */}

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

      {videoAberto ? (
        <div className="videoModalOverlay" role="presentation" onClick={() => setVideoAberto(null)}>
          <div className="videoModalContent" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="videoModalClose"
              onClick={() => setVideoAberto(null)}
              aria-label="Fechar vídeo"
            >
              ✕
            </button>
            <iframe
              src={videoAberto}
              title="Reprodutor de Vídeo"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </div>
      ) : null}

      {/* Documentos Modal removed */}

      <style>{`
        .videoModalOverlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(0, 0, 0, 0.85);
          z-index: 9999; display: flex; align-items: center; justify-content: center;
        }
        .videoModalContent {
          position: relative; width: 60vw; height: 80vh;
          background-color: #000; border-radius: 8px; overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .videoModalClose {
          position: absolute; top: 12px; right: 12px;
          background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%;
          width: 32px; height: 32px; font-size: 1rem; cursor: pointer; z-index: 10;
          display: flex; align-items: center; justify-content: center; transition: background 0.2s;
        }
        .videoModalClose:hover { background: rgba(220,38,38,0.9); }
        
        .videoModalClose:hover { background: rgba(220,38,38,0.9); }

        @media (max-width: 768px) {
          .videoModalContent {
            width: 100vw; height: auto; aspect-ratio: 16/9; border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
