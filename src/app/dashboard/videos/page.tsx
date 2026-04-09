'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ProdutoModelo } from '../admin/produtos-modelos/page';
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

export default function VideosPage() {
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [vimeoThumbById, setVimeoThumbById] = useState<Record<string, string>>({});

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
        setLoadError('Nao foi possivel carregar os videos no momento.');
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  const baseVideos = useMemo<VideoItem[]>(() => {
    return produtos
      .map((produto) => {
        const videoUrl = normalizeExternalUrl(produto.videoUrl || '');
        if (!videoUrl) return null;

        const isVimeo = isVimeoVideoUrl(videoUrl);

        return {
          id: produto.id,
          nome: produto.nomeAbreviado?.trim() || produto.nome,
          fotoUrl: produto.fotoUrl,
          descricaoCurta: produto.descricaoCurta,
          videoUrl,
          thumbnailUrl: getVideoThumbnail(videoUrl) || produto.fotoUrl,
          isVimeo,
        };
      })
      .filter((item): item is VideoItem => Boolean(item));
  }, [produtos]);

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
      <header className={styles.header}>
        <h1 className={styles.title}>Videos</h1>
        <p className={styles.subtitle}>Todos os videos cadastrados nos produtos com URL valida.</p>
      </header>

      {videos.length === 0 ? (
        <div className={styles.empty}>Nenhum produto com video cadastrado.</div>
      ) : (
        <section className={styles.grid}>
          {videos.map((video) => (
            <article key={video.id} className={styles.card}>
              {video.thumbnailUrl ? (
                <a
                  href={video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
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
    </div>
  );
}
