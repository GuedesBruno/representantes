'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Produto } from '../admin/produtos-modelos/page';
import styles from './videos.module.css';

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

type VideoItem = {
  id: string;
  nome: string;
  fotoUrl: string;
  descricaoCurta: string;
  videoUrl: string;
  thumbnailUrl: string;
  isVimeo: boolean;
};

async function getVimeoThumbnail(videoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/video-thumbnail?url=${encodeURIComponent(videoUrl)}`);
    if (!response.ok) return null;

    const data = await response.json() as { thumbnailUrl?: string };
    const thumbnail = normalizeExternalUrl(data.thumbnailUrl || '');
    return thumbnail;
  } catch {
    return null;
  }
}

function getVideoThumbnail(rawUrl: string): string | null {
  const normalizedUrl = normalizeExternalUrl(rawUrl);
  if (!normalizedUrl) return null;

  const parsed = new URL(normalizedUrl);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    let videoId = '';

    if (host.includes('youtu.be')) {
      videoId = path.split('/').filter(Boolean)[0] ?? '';
    } else if (path.startsWith('/shorts/')) {
      videoId = path.split('/')[2] ?? '';
    } else if (path.startsWith('/live/')) {
      videoId = path.split('/')[2] ?? '';
    } else if (path.startsWith('/embed/')) {
      videoId = path.split('/')[2] ?? '';
    } else {
      videoId = parsed.searchParams.get('v') ?? '';
    }

    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  }

  return null;
}

function isVimeoVideoUrl(rawUrl: string): boolean {
  const normalizedUrl = normalizeExternalUrl(rawUrl);
  if (!normalizedUrl) return false;
  const host = new URL(normalizedUrl).hostname.toLowerCase();
  return host.includes('vimeo.com');
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
      // O ID do vídeo costuma ser o primeiro ou segundo segmento numérico
      // Ex: vimeo.com/123456789 ou vimeo.com/channels/mychannel/123456789
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

export default function VideosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [vimeoThumbById, setVimeoThumbById] = useState<Record<string, string>>({});
  const [videoAberto, setVideoAberto] = useState<string | null>(null);
  const [strapiVideos, setStrapiVideos] = useState<{ slug: string; videoUrl: string }[]>([]);

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
        setLoadError('Nao foi possivel carregar os videos no momento.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

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
          const vUrlRaw = attr.videos || attr.videoUrl || attr.video_url || attr.video || attr.linkVideo;
          let vUrl = '';
          
          if (typeof vUrlRaw === 'string') vUrl = vUrlRaw;
          else if (Array.isArray(vUrlRaw?.data)) {
            vUrl = vUrlRaw.data[0]?.attributes?.url || '';
          }
          else if (vUrlRaw?.data?.attributes?.url) vUrl = vUrlRaw.data.attributes.url;

          if (vUrl && vUrl.startsWith('/')) vUrl = `${process.env.NEXT_PUBLIC_STRAPI_URL || 'https://innovative-friendship-159ff40007.strapiapp.com'}${vUrl}`;

          if (slug && vUrl) {
            list.push({ slug: String(slug).toLowerCase(), videoUrl: String(vUrl) });
          }
        });
        setStrapiVideos(list);
      } catch (err) {
        console.warn('Strapi indisponível ou bloqueado por CORS. Usando apenas vídeos cadastrados no Firebase.');
      }
    }
    fetchStrapiVideos();
  }, []);

  const baseVideos = useMemo<VideoItem[]>(() => {
    return produtos
      .map((produto) => {
        let strapiVideoUrl = null;
        if (produto.linkSite) {
          try {
            const siteUrl = normalizeExternalUrl(produto.linkSite) || '';
            const lowerSiteUrl = siteUrl.toLowerCase();
            const pathParts = new URL(siteUrl).pathname.split('/').filter(Boolean);
            const rawSlug = pathParts.pop()?.toLowerCase() || '';
            
            const matched = strapiVideos.find(s => 
              s.slug === rawSlug || 
              lowerSiteUrl.includes(`/${s.slug}`)
            );
            if (matched) strapiVideoUrl = matched.videoUrl;
          } catch {}
        }
        const finalVideoUrl = normalizeExternalUrl(produto.videoUrl || strapiVideoUrl || '');
        if (!finalVideoUrl) return null;

        const isVimeo = isVimeoVideoUrl(finalVideoUrl);

        return {
          id: produto.id,
          nome: produto.nomeAbreviado?.trim() || produto.nome,
          fotoUrl: produto.fotoUrl,
          descricaoCurta: produto.descricaoCurta,
          videoUrl: finalVideoUrl,
          thumbnailUrl: getVideoThumbnail(finalVideoUrl) || produto.fotoUrl,
          isVimeo,
        };
      })
      .filter((item): item is VideoItem => Boolean(item));
  }, [produtos, strapiVideos]);

  useEffect(() => {
    const pending = baseVideos.filter((video) => video.isVimeo && !vimeoThumbById[video.id]);
    if (pending.length === 0) return;

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        pending.map(async (video) => {
          const thumbnail = await getVimeoThumbnail(video.videoUrl);
          return [video.id, thumbnail] as const;
        })
      );

      if (cancelled) return;

      setVimeoThumbById((prev) => {
        const next = { ...prev };
        entries.forEach(([id, thumbnail]) => {
          if (thumbnail) next[id] = thumbnail;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [baseVideos, vimeoThumbById]);

  const videos = useMemo<VideoItem[]>(() => {
    return baseVideos.map((video) => ({
      ...video,
      thumbnailUrl: video.isVimeo ? (vimeoThumbById[video.id] || video.fotoUrl) : video.thumbnailUrl,
    }));
  }, [baseVideos, vimeoThumbById]);

  if (loading) {
    return <div className={styles.loading}>Carregando videos...</div>;
  }

  if (loadError) {
    return <div className={styles.error}>{loadError}</div>;
  }

  return (
    <div className={styles.page}>
      {videos.length === 0 ? (
        <div className={styles.empty}>Nenhum produto com video cadastrado.</div>
      ) : (
        <section className={styles.grid}>
          {videos.map((video) => (
            <article key={video.id} className={styles.card}>
              {video.thumbnailUrl ? (
                <a
                  href={video.videoUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    const embed = getEmbedUrl(video.videoUrl);
                    if (embed) setVideoAberto(embed);
                  }}
                  className={styles.thumbLink}
                  title={`Abrir video de ${video.nome}`}
                >
                  <img src={video.thumbnailUrl} alt={video.nome} className={styles.thumb} loading="lazy" />
                  <span className={styles.playOverlay} aria-hidden="true">
                    <span className={styles.playIcon}>▶</span>
                  </span>
                </a>
              ) : (
                <div className={styles.thumbPlaceholder} aria-hidden="true" />
              )}

              <h2 className={styles.name}>{video.nome}</h2>
              <p className={styles.description}>{video.descricaoCurta || 'Sem descricao cadastrada.'}</p>
            </article>
          ))}
        </section>
      )}

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
        @media (max-width: 768px) {
          .videoModalContent {
            width: 100vw; height: auto; aspect-ratio: 16/9; border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
