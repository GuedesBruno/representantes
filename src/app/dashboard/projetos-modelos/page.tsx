'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import type { ProdutoModelo } from '../admin/produtos-modelos/page';
import type { KitItem, KitModelo } from '../admin/kits-modelos/page';
import styles from './projetos-modelos.module.css';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function truncateProductName(name: string, maxLength = 32) {
  if (name.length <= maxLength) {
    return name;
  }

  return `${name.slice(0, maxLength - 1)}…`;
}

function calcTotal(kit: KitModelo, produtos: ProdutoModelo[]): number {
  return kit.itens.reduce((acc, item) => {
    const p = produtos.find((x) => x.id === item.produtoId);
    return acc + (p ? p.precoUnitario * item.quantidade : 0);
  }, 0);
}

type EditableKitItem = KitItem;

function SvgIcon({ type, width = 16, height = 16 }: { type: 'website' | 'catalog' | 'video' | 'info'; width?: number; height?: number }) {
  if (type === 'website') {
    return (
      <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M2 12h20M12 2a8 8 0 0 1 0 16 8 8 0 0 1 0 -16" stroke="currentColor" strokeWidth="2" />
        <path d="M9 2C6 4.5 5 8 5 12s1 7.5 4 10M15 2c3 2.5 4 6 4 10s-1 7.5 -4 10" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 'catalog') {
    return (
      <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M9 9h6M9 15h6M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'video') {
    return (
      <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="2.18" stroke="currentColor" strokeWidth="2" />
        <path d="M7 12l5-3v6l-5 -3Z" fill="currentColor" />
        <path d="M14 12l5-3v6l-5 -3Z" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'info') {
    return (
      <svg width={width} height={height} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function InfoDescriptionTooltip({ text }: { text: string }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, maxWidth: 320, placeBelow: false });

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const tooltipMaxWidth = Math.min(360, Math.max(240, viewportWidth - 24));

    let left = rect.left + (rect.width / 2) - (tooltipMaxWidth / 2);
    left = Math.max(12, Math.min(left, viewportWidth - tooltipMaxWidth - 12));

    const placeBelow = rect.top < 170;
    const top = placeBelow ? rect.bottom + 10 : rect.top - 10;

    setPosition({ left, top, maxWidth: tooltipMaxWidth, placeBelow });
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleLayoutChange = () => updatePosition();
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);

    return () => {
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [isOpen]);

  return (
    <span
      className={styles.infoIconContainer}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.infoIconButton}
        aria-label="Ver descrição"
      >
        <SvgIcon type="info" width={22} height={22} />
      </button>

      {isOpen && (
        <span
          className={`${styles.infoTooltip} ${position.placeBelow ? styles.infoTooltipBelow : styles.infoTooltipAbove}`}
          role="tooltip"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            maxWidth: `${position.maxWidth}px`,
            transform: position.placeBelow ? 'none' : 'translateY(-100%)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function normalizeExternalVideoUrl(rawUrl: string): string | null {
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

function getVideoEmbedUrl(rawUrl: string): string | null {
  const normalizedUrl = normalizeExternalVideoUrl(rawUrl);
  if (!normalizedUrl) {
    return null;
  }

  const parsed = new URL(normalizedUrl);

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    let videoId = '';

    if (host.includes('youtu.be')) {
      videoId = path.split('/').filter(Boolean)[0] ?? '';
    } else if (path.startsWith('/live/')) {
      videoId = path.split('/')[2] ?? '';
    } else if (path.startsWith('/shorts/')) {
      videoId = path.split('/')[2] ?? '';
    } else if (path.startsWith('/embed/')) {
      videoId = path.split('/')[2] ?? '';
    } else if (path.startsWith('/watch/')) {
      videoId = path.split('/')[2] ?? '';
    } else {
      videoId = parsed.searchParams.get('v') ?? '';
    }

    if (!videoId) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  }

  if (host.includes('vimeo.com')) {
    const segments = path.split('/').filter(Boolean);
    const numericIndex = segments.findIndex((segment) => /^\d+$/.test(segment));
    if (numericIndex < 0) return null;

    const videoId = segments[numericIndex];
    const pathHash = segments[numericIndex + 1] ?? '';
    const queryHash = parsed.searchParams.get('h') ?? '';
    const hash = queryHash || (/^[a-zA-Z0-9]+$/.test(pathHash) ? pathHash : '');

    if (hash) {
      return `https://player.vimeo.com/video/${videoId}?h=${hash}`;
    }

    return `https://player.vimeo.com/video/${videoId}`;
  }

  return null;
}

function VideoModal({ embedUrl, sourceUrl, title, onClose }: { embedUrl: string; sourceUrl: string; title: string; onClose: () => void }) {
  return (
    <div className={styles.imageLightbox} onClick={onClose}>
      <div className={`${styles.imageLightboxContent} ${styles.videoLightboxContent}`} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.imageLightboxClose}
          onClick={onClose}
          aria-label="Fechar vídeo"
        >
          ×
        </button>
        <iframe
          src={embedUrl}
          title={title}
          className={styles.videoLightboxFrame}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          loading="lazy"
          referrerPolicy="origin-when-cross-origin"
          allowFullScreen
        />
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.videoFallbackLink}
        >
          Clique aqui para abrir em nova aba.
        </a>
      </div>
    </div>
  );
}

function KitDetailModal({
  kit,
  produtos,
  user,
  projectUnits = 1,
  initialCustomizing = false,
  onClose,
}: {
  kit: KitModelo;
  produtos: ProdutoModelo[];
  user: any;
  projectUnits?: number;
  initialCustomizing?: boolean;
  onClose: () => void;
}) {
  const normalizedProjectUnits = Math.max(1, projectUnits);
  const [detailMode, setDetailMode] = useState<'kit' | 'project'>('kit');
  const [isCustomizing, setIsCustomizing] = useState(initialCustomizing);
  const [itens, setItens] = useState<EditableKitItem[]>(kit.itens.map((i) => ({ ...i })));
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [videoModal, setVideoModal] = useState<{ embedUrl: string; sourceUrl: string; title: string } | null>(null);

  const projectItens = useMemo(
    () => itens.map((i) => ({ ...i, quantidade: i.quantidade * normalizedProjectUnits })),
    [itens, normalizedProjectUnits]
  );
  const displayedItens = detailMode === 'project' ? projectItens : itens;

  function setQuantidade(produtoId: string, val: string) {
    const n = Math.max(1, parseInt(val, 10) || 1);
    setItens((prev) =>
      prev.map((i) => i.produtoId === produtoId ? { ...i, quantidade: n } : i)
    );
  }

  function resetQuantidades() {
    setItens(kit.itens.map((i) => ({ ...i })));
  }

  useEffect(() => {
    setItens(kit.itens.map((i) => ({ ...i })));
    setIsCustomizing(initialCustomizing);
    setDetailMode('kit');
  }, [kit, initialCustomizing]);

  useEffect(() => {
    if (detailMode === 'project') {
      setIsCustomizing(false);
    }
  }, [detailMode]);

  const totalGeral = projectItens.reduce((acc, item) => {
    const p = produtos.find((x) => x.id === item.produtoId);
    return acc + (p ? p.precoUnitario * item.quantidade : 0);
  }, 0);

  async function handleRequestQuote() {
    setRequestError('');
    setRequestSuccess('');
    setRequesting(true);

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
          kitId: kit.id,
          kitNome: kit.nome,
          itens: projectItens.map((i) => ({
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
        setRequestSuccess('Cotação solicitada com sucesso! Em breve o vendedor entrará em contato.');
      } else {
        setRequestError(data.message ?? 'Cotação registrada, mas o email para o vendedor não foi enviado.');
      }
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Erro ao solicitar cotação.');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className={styles.detailPanelOverlay} onClick={onClose}>
      <div className={styles.detailContainer} onClick={(e) => e.stopPropagation()}>

        <div className={styles.detailCardSide}>
          <div className={`${styles.kitCard} ${styles.kitCardPreview}`}>
            <h3 className={styles.openedCardTitle}>{kit.nome}</h3>
            <div className={styles.openedCardMeta}>
              <span className={styles.openedCardCount}>{normalizedProjectUnits} {normalizedProjectUnits === 1 ? 'kit' : 'kits'}</span>
              <span className={styles.openedCardCount}>{kit.itens.length} produto(s)</span>
              <span className={styles.openedCardCategory}>{kit.categoria}</span>
            </div>
          </div>
        </div>

        <div className={styles.detailTreeSide}>
          <div className={styles.panelHeader}>
            <div className={styles.detailModeToggle} role="tablist" aria-label="Modo do detalhamento">
              <button
                type="button"
                role="tab"
                aria-selected={detailMode === 'kit'}
                className={`${styles.detailModeButton} ${detailMode === 'kit' ? styles.detailModeButtonActive : ''}`}
                onClick={() => setDetailMode('kit')}
              >
                Detalhamento do Kit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailMode === 'project'}
                className={`${styles.detailModeButton} ${detailMode === 'project' ? styles.detailModeButtonActive : ''}`}
                onClick={() => setDetailMode('project')}
              >
                Detalhamento do Projeto
              </button>
            </div>
            <div className={styles.panelHeaderActions}>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Fechar painel"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.panelBody}>
            <div className={styles.productsTree}>
            <ul className={`${styles.treeList} ${displayedItens.length >= 8 ? styles.treeListTwoColumns : ''}`}>
              {displayedItens.map((item) => {
                const produto = produtos.find((p) => p.id === item.produtoId);
                const videoEmbedUrl = produto?.videoUrl ? getVideoEmbedUrl(produto.videoUrl) : null;
                const videoSourceUrl = produto?.videoUrl ? normalizeExternalVideoUrl(produto.videoUrl) : null;
                return (
                  <li key={item.produtoId} className={styles.treeItem}>
                    <div className={styles.treeItemWrapper}>
                      {/* Left: Image with Quantity Badge */}
                      <div className={styles.imageColumnContainer}>
                        {produto?.fotoUrl && (
                          <button
                            type="button"
                            className={styles.imageExpandBtn}
                            onClick={() => setExpandedImage({ src: produto.fotoUrl, alt: item.nomeProduto })}
                            title="Expandir imagem"
                          >
                            <img
                              src={produto.fotoUrl}
                              alt={item.nomeProduto}
                              className={styles.productThumbnail}
                            />
                          </button>
                        )}
                        {/* Quantity Badge */}
                        <div className={styles.quantityBadge}>
                          {item.quantidade}x
                        </div>
                      </div>

                      {/* Right: Name and Buttons */}
                      <div className={styles.infoColumn}>
                        {/* Line 1: Name */}
                        <div className={styles.nameQtyRow}>
                          <span className={styles.productTreeName} title={item.nomeProduto}>
                            {truncateProductName(item.nomeProduto)}
                          </span>
                        </div>

                        {/* Line 2: Buttons */}
                        <div className={styles.productLinks}>
                          {produto?.linkSite && (
                            <a
                              href={produto.linkSite}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.productLinkIcon}
                              title="Ir para website"
                            >
                              <SvgIcon type="website" width={14} height={14} />
                              Website
                            </a>
                          )}
                          {(produto?.catalogoUrl || produto?.fotoUrl) && (
                            <a
                              href={produto.catalogoUrl || produto.fotoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.productLinkIcon}
                              title="Ver catálogo"
                            >
                              <SvgIcon type="catalog" width={14} height={14} />
                              Catálogo
                            </a>
                          )}
                          {videoSourceUrl && videoEmbedUrl && (
                            <button
                              type="button"
                              className={styles.productLinkIcon}
                              title="Abrir vídeo"
                              onClick={() => setVideoModal({ embedUrl: videoEmbedUrl, sourceUrl: videoSourceUrl, title: item.nomeProduto })}
                            >
                              <SvgIcon type="video" width={14} height={14} />
                              Vídeo
                            </button>
                          )}
                          {videoSourceUrl && !videoEmbedUrl && (
                            <a
                              href={videoSourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.productLinkIcon}
                              title="Abrir vídeo em nova aba"
                            >
                              <SvgIcon type="video" width={14} height={14} />
                              Vídeo
                            </a>
                          )}
                          {produto?.descricaoCurta && (
                            <InfoDescriptionTooltip text={produto.descricaoCurta} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Edit Quantity Mode */}
                    {isCustomizing && detailMode === 'kit' && (
                      <div className={styles.productEditRow}>
                        <label className={styles.qtyEditLabel}>Quantidade:</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantidade}
                          onChange={(e) => setQuantidade(item.produtoId, e.target.value)}
                          className={styles.productQtyInput}
                          aria-label={`Quantidade de ${item.nomeProduto}`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </div>
          </div>

          <div className={styles.panelFooter}>
            <div className={styles.footerContent}>
              {requestError && <div className={styles.errorMsg}>{requestError}</div>}
              {requestSuccess && <div className={styles.successMsg}>{requestSuccess}</div>}

              <div className={styles.footerBar}>
                <div className={styles.footerActions}>
                {!isCustomizing ? (
                  <>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setIsCustomizing(true)}
                      disabled={detailMode === 'project'}
                    >
                      Personalizar Projeto
                    </button>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={handleRequestQuote}
                      disabled={requesting}
                    >
                      {requesting ? 'Enviando...' : 'Solicitar Orçamento'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={resetQuantidades}
                    >
                      Restaurar
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => setIsCustomizing(false)}
                    >
                      Confirmado
                    </button>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={handleRequestQuote}
                      disabled={requesting}
                    >
                      {requesting ? 'Enviando...' : 'Solicitar Orçamento'}
                    </button>
                  </>
                )}
                </div>

                <div className={styles.footerTotal}>
                  <span className={styles.totalLabelFooter}>Valor Total do Projeto:</span>
                  <span className={styles.totalValueFooter}>{formatCurrency(totalGeral)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {expandedImage && (
        <div className={styles.imageLightbox} onClick={() => setExpandedImage(null)}>
          <div className={styles.imageLightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.imageLightboxClose}
              onClick={() => setExpandedImage(null)}
              aria-label="Fechar imagem ampliada"
            >
              ×
            </button>
            <img src={expandedImage.src} alt={expandedImage.alt} className={styles.imageLightboxImg} />
          </div>
        </div>
      )}

      {videoModal && (
        <VideoModal
          embedUrl={videoModal.embedUrl}
          sourceUrl={videoModal.sourceUrl}
          title={`Vídeo do produto ${videoModal.title}`}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  );
}

type ViewMode = 'investimento' | 'estrutura';
type FixedCategory = 'Educação' | 'Biblioteca';
type KitLevel = 'basico' | 'intermediario' | 'modelo';

type KitOption = {
  level: KitLevel;
  kit: KitModelo;
  total: number;
};

const FIXED_CATEGORIES: FixedCategory[] = ['Educação', 'Biblioteca'];
const LEVELS: KitLevel[] = ['basico', 'intermediario', 'modelo'];
const LEVEL_LABELS: Record<KitLevel, string> = {
  basico: 'Kit Inicial',
  intermediario: 'Kit Intermediário',
  modelo: 'Kit Completo',
};
const LEVEL_LABELS_PLURAL: Record<KitLevel, string> = {
  basico: 'Kits Iniciais',
  intermediario: 'Kits Intermediários',
  modelo: 'Kits Completos',
};
const INVESTMENT_VALUES = [200000, 500000, 1000000, 3000000] as const;

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getFixedCategory(categoria: string): FixedCategory | null {
  const normalized = normalizeText(categoria);
  if (normalized.includes('educ')) return 'Educação';
  if (normalized.includes('bibli')) return 'Biblioteca';
  return null;
}

function getKitLevel(nome: string): KitLevel | null {
  const normalized = normalizeText(nome);
  if (normalized.includes('inicial') || normalized.includes('basic')) return 'basico';
  if (normalized.includes('intermed')) return 'intermediario';
  if (normalized.includes('completo') || normalized.includes('modelo')) return 'modelo';
  return null;
}

function calculateInvestmentPlan(budget: number, baseOption: KitOption, options: KitOption[]) {
  const primaryUnits = Math.floor(budget / baseOption.total);
  let remaining = budget - (primaryUnits * baseOption.total);
  const extras: Array<{ option: KitOption; qty: number }> = [];

  if (primaryUnits <= 0) {
    return { primaryUnits: 0, remaining: budget, extras };
  }

  const sortedCandidates = [...options].sort((a, b) => b.total - a.total);
  const minPrice = sortedCandidates.length > 0 ? sortedCandidates[sortedCandidates.length - 1].total : Infinity;
  let guard = 0;

  while (remaining >= minPrice && guard < 40) {
    const next = sortedCandidates.find((candidate) => candidate.total <= remaining);
    if (!next) break;
    const existing = extras.find((x) => x.option.kit.id === next.kit.id);
    if (existing) {
      existing.qty += 1;
    } else {
      extras.push({ option: next, qty: 1 });
    }
    remaining -= next.total;
    guard += 1;
  }

  return { primaryUnits, remaining, extras };
}

function buildPlanText(plan: ReturnType<typeof calculateInvestmentPlan>, baseOption: KitOption) {
  if (plan.primaryUnits <= 0) {
    return `Investimento insuficiente para 1 unidade de ${LEVEL_LABELS[baseOption.level]}.`;
  }

  const unidadeLabel = plan.primaryUnits === 1 ? 'unidade' : 'unidades';
  const initial = `Você pode montar ${plan.primaryUnits} ${unidadeLabel} do ${LEVEL_LABELS[baseOption.level]}`;
  if (plan.extras.length === 0) {
    return `${initial}.`;
  }

  const extrasText = plan.extras
    .map((extra) => `+ ${extra.qty} de ${LEVEL_LABELS[extra.option.level]}`)
    .join(' ');

  return `${initial} ${extrasText}.`;
}

function InvestmentKitDetail({
  kit,
  produtos,
  baseKitUnits,
  extraProjectTotal,
  extraKits,
  detailMode,
  onOpenRequestModal,
}: {
  kit: KitModelo;
  produtos: ProdutoModelo[];
  baseKitUnits: number;
  extraProjectTotal: number;
  extraKits: Array<{ kit: KitModelo; qty: number }>;
  detailMode: 'kit' | 'project';
  onOpenRequestModal: () => void;
}) {
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [itens, setItens] = useState<EditableKitItem[]>(kit.itens.map((item) => ({ ...item })));
  const total = itens.reduce((acc, item) => {
    const produto = produtos.find((product) => product.id === item.produtoId);
    return acc + ((produto?.precoUnitario ?? 0) * item.quantidade);
  }, 0);
  const projectTotal = (total * Math.max(1, baseKitUnits)) + extraProjectTotal;
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [videoModal, setVideoModal] = useState<{ embedUrl: string; sourceUrl: string; title: string } | null>(null);

  useEffect(() => {
    setItens(kit.itens.map((item) => ({ ...item })));
    setIsCustomizing(false);
  }, [kit]);

  function setQuantidade(produtoId: string, value: string) {
    const nextQuantity = Math.max(1, parseInt(value, 10) || 1);
    setItens((prev) => prev.map((item) => (
      item.produtoId === produtoId ? { ...item, quantidade: nextQuantity } : item
    )));
  }

  function resetQuantidades() {
    setItens(kit.itens.map((item) => ({ ...item })));
  }

  function multiplyItemsForProject<T extends KitItem>(itemsToScale: T[], multiplier: number): EditableKitItem[] {
    return itemsToScale.map((item) => ({
      ...item,
      quantidade: item.quantidade * Math.max(1, multiplier),
    }));
  }

  const kitGroups = [
    {
      key: kit.id,
      name: kit.nome,
      qty: Math.max(1, baseKitUnits),
      items: detailMode === 'project' ? multiplyItemsForProject(itens, Math.max(1, baseKitUnits)) : itens,
      editable: true,
    },
    ...extraKits.map((extra) => ({
      key: extra.kit.id,
      name: extra.kit.nome,
      qty: extra.qty,
      items: detailMode === 'project' ? multiplyItemsForProject(extra.kit.itens, Math.max(1, extra.qty)) : extra.kit.itens,
      editable: false,
    })),
  ];

  const showGroupedByKit = kitGroups.length > 1;

  function renderProductItem(
    item: EditableKitItem | KitItem,
    editable: boolean
  ) {
    const produto = produtos.find((p) => p.id === item.produtoId);
    const videoEmbedUrl = produto?.videoUrl ? getVideoEmbedUrl(produto.videoUrl) : null;
    const videoSourceUrl = produto?.videoUrl ? normalizeExternalVideoUrl(produto.videoUrl) : null;

    return (
      <li key={`${item.produtoId}-${item.quantidade}-${editable ? 'editable' : 'fixed'}`} className={styles.treeItem}>
        <div className={styles.treeItemWrapper}>
          <div className={styles.imageColumnContainer}>
            {produto?.fotoUrl && (
              <button
                type="button"
                className={styles.imageExpandBtn}
                onClick={() => setExpandedImage({ src: produto.fotoUrl, alt: item.nomeProduto })}
                title="Expandir imagem"
              >
                <img src={produto.fotoUrl} alt={item.nomeProduto} className={styles.productThumbnail} />
              </button>
            )}
            <div className={styles.quantityBadge}>{item.quantidade}x</div>
          </div>

          <div className={styles.infoColumn}>
            <div className={styles.nameQtyRow}>
              <span className={styles.productTreeName} title={item.nomeProduto}>
                {item.nomeProduto}
              </span>
            </div>

            <div className={styles.productLinks}>
              {produto?.linkSite && (
                <a
                  href={produto.linkSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.productLinkIcon}
                  title="Ir para website"
                >
                  <SvgIcon type="website" width={14} height={14} />
                  Website
                </a>
              )}
              {(produto?.catalogoUrl || produto?.fotoUrl) && (
                <a
                  href={produto.catalogoUrl || produto.fotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.productLinkIcon}
                  title="Ver catálogo"
                >
                  <SvgIcon type="catalog" width={14} height={14} />
                  Catálogo
                </a>
              )}
              {videoSourceUrl && videoEmbedUrl && (
                <button
                  type="button"
                  className={styles.productLinkIcon}
                  title="Abrir vídeo"
                  onClick={() => setVideoModal({ embedUrl: videoEmbedUrl, sourceUrl: videoSourceUrl, title: item.nomeProduto })}
                >
                  <SvgIcon type="video" width={14} height={14} />
                  Vídeo
                </button>
              )}
              {videoSourceUrl && !videoEmbedUrl && (
                <a
                  href={videoSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.productLinkIcon}
                  title="Abrir vídeo em nova aba"
                >
                  <SvgIcon type="video" width={14} height={14} />
                  Vídeo
                </a>
              )}
              {produto?.descricaoCurta && (
                <InfoDescriptionTooltip text={produto.descricaoCurta} />
              )}
            </div>

            {isCustomizing && editable && detailMode === 'kit' && (
              <div className={styles.productEditRow}>
                <label className={styles.qtyEditLabel}>Quantidade:</label>
                <input
                  type="number"
                  min="1"
                  value={item.quantidade}
                  onChange={(e) => setQuantidade(item.produtoId, e.target.value)}
                  className={styles.productQtyInput}
                  aria-label={`Quantidade de ${item.nomeProduto}`}
                />
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className={styles.investmentDetailWrap}>
      <div className={styles.investmentDetailBody}>
        {showGroupedByKit ? (
          <div key={`project-columns-${detailMode}`} className={styles.investmentKitColumns}>
            {kitGroups.map((group) => (
              <section key={group.key} className={styles.investmentKitColumn}>
                <header className={styles.investmentKitColumnHeader}>
                  <h5 className={styles.investmentKitColumnTitle}>{group.name}</h5>
                  <span className={styles.investmentKitColumnMeta}>
                    {group.qty} {group.qty === 1 ? 'kit' : 'kits'}
                  </span>
                </header>
                <ul className={styles.treeList}>
                  {group.items.map((item) => renderProductItem(item, group.editable))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul
            key={`detail-list-${detailMode}`}
            className={`${styles.treeList} ${itens.length > 8 ? styles.treeListThreeColumns : styles.treeListTwoColumns}`}
          >
            {(detailMode === 'project' ? multiplyItemsForProject(itens, Math.max(1, baseKitUnits)) : itens)
              .map((item) => renderProductItem(item, true))}
          </ul>
        )}
      </div>

      <div className={styles.investmentDetailFooter}>
        <div className={styles.footerBar}>
          <div className={styles.footerActions}>
            {!isCustomizing ? (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setIsCustomizing(true)}
                disabled={detailMode === 'project'}
              >
                Personalizar Projeto
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={resetQuantidades}
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setIsCustomizing(false)}
                >
                  Confirmado
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={onOpenRequestModal}
            >
              Solicitar Orçamento
            </button>
          </div>

          <div className={styles.investmentDetailFooterTotal}>
            <span className={styles.totalLabelFooter}>Valor Total do Projeto</span>
            <strong className={styles.investmentDetailTotal}>{formatCurrency(projectTotal)}</strong>
          </div>
        </div>
      </div>

      {expandedImage && (
        <div className={styles.imageLightbox} onClick={() => setExpandedImage(null)}>
          <div className={styles.imageLightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.imageLightboxClose}
              onClick={() => setExpandedImage(null)}
              aria-label="Fechar imagem ampliada"
            >
              ×
            </button>
            <img src={expandedImage.src} alt={expandedImage.alt} className={styles.imageLightboxImg} />
          </div>
        </div>
      )}

      {videoModal && (
        <VideoModal
          embedUrl={videoModal.embedUrl}
          sourceUrl={videoModal.sourceUrl}
          title={`Vídeo do produto ${videoModal.title}`}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  );
}

function ProjetosModelosPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [kits, setKits] = useState<KitModelo[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [selectedInvestment, setSelectedInvestment] = useState<Record<FixedCategory, number | null>>({
    Educação: null,
    Biblioteca: null,
  });
  const [customInvestmentInput, setCustomInvestmentInput] = useState<Record<FixedCategory, string>>({
    Educação: '',
    Biblioteca: '',
  });
  const [investmentPanel, setInvestmentPanel] = useState<{ category: FixedCategory; budget: number } | null>(null);
  const [selectedBandKit, setSelectedBandKit] = useState<KitModelo | null>(null);
  const [structureKitUnits, setStructureKitUnits] = useState<Record<FixedCategory, number>>({
    Educação: 1,
    Biblioteca: 1,
  });
  const [isCompactCategories, setIsCompactCategories] = useState(false);
  const [activeMobileCategory, setActiveMobileCategory] = useState<FixedCategory>('Educação');
  const [showCustomizeForm, setShowCustomizeForm] = useState(false);
  const [customCategory, setCustomCategory] = useState<FixedCategory>('Educação');
  const [customLevel, setCustomLevel] = useState<KitLevel>('basico');
  const [customQuantity, setCustomQuantity] = useState(1);

  const [modalKit, setModalKit] = useState<KitModelo | null>(null);
  const [modalProjectUnits, setModalProjectUnits] = useState(1);
  const [modalInitialCustomizing, setModalInitialCustomizing] = useState(false);
  const [detailMode, setDetailMode] = useState<'kit' | 'project'>('kit');
  const mode: ViewMode = searchParams.get('modo') === 'estrutura' ? 'estrutura' : 'investimento';

  function openKitModal(kit: KitModelo, initialCustomizing = false, projectUnits = 1) {
    setModalInitialCustomizing(initialCustomizing);
    setModalProjectUnits(Math.max(1, projectUnits));
    setModalKit(kit);
  }

  const setModeInUrl = (nextMode: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('modo', nextMode);
    router.replace(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (modalKit || investmentPanel) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }

    return () => {
      document.body.classList.remove('sidebar-collapsed');
    };
  }, [modalKit, investmentPanel]);

  useEffect(() => {
    if (mode !== 'investimento') {
      setInvestmentPanel(null);
      setSelectedBandKit(null);
    }
  }, [mode]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');

    const updateCompactState = () => {
      setIsCompactCategories(media.matches);
    };

    updateCompactState();
    media.addEventListener('change', updateCompactState);

    return () => {
      media.removeEventListener('change', updateCompactState);
    };
  }, []);

  useEffect(() => {
    setDetailMode('kit');
  }, [selectedBandKit?.id]);

  useEffect(() => {
    let resolvedP = false;
    let resolvedK = false;

    const checkDone = () => {
      if (resolvedP && resolvedK) setLoadingData(false);
    };

    const unsubP = onSnapshot(
      query(collection(db, 'produtos_modelos'), orderBy('nome')),
      (snap) => {
        setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoModelo)));
        resolvedP = true;
        checkDone();
      }
    );

    const unsubK = onSnapshot(
      query(collection(db, 'kits_modelos'), orderBy('nome')),
      (snap) => {
        setKits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KitModelo)));
        resolvedK = true;
        checkDone();
      }
    );

    return () => {
      unsubP();
      unsubK();
    };
  }, []);

  const kitsComTotal = useMemo(() => {
    return kits.map((kit) => ({ kit, total: calcTotal(kit, produtos) }));
  }, [kits, produtos]);

  const kitsByCategory = useMemo(() => {
    const structure: Record<FixedCategory, Partial<Record<KitLevel, KitOption>>> = {
      Educação: {},
      Biblioteca: {},
    };

    kitsComTotal.forEach(({ kit, total }) => {
      if (total <= 0) return;
      const fixedCategory = getFixedCategory(kit.categoria);
      const level = getKitLevel(kit.nome);
      if (!fixedCategory || !level) return;

      const current = structure[fixedCategory][level];
      if (!current || total < current.total) {
        structure[fixedCategory][level] = { level, kit, total };
      }
    });

    return structure;
  }, [kitsComTotal]);

  const availableLevelsForCustom = useMemo(() => {
    return LEVELS.filter((level) => Boolean(kitsByCategory[customCategory][level]));
  }, [customCategory, kitsByCategory]);

  useEffect(() => {
    if (!availableLevelsForCustom.includes(customLevel)) {
      setCustomLevel(availableLevelsForCustom[0] ?? 'basico');
    }
  }, [availableLevelsForCustom, customLevel]);

  const customSelectedOption = kitsByCategory[customCategory][customLevel] ?? null;
  const customTotal = customSelectedOption ? customSelectedOption.total * customQuantity : 0;

  const activeInvestmentCategory = investmentPanel?.category ?? null;
  const activeBudget = investmentPanel?.budget ?? null;
  const activeOptions = LEVELS
    .map((level) => (activeInvestmentCategory ? kitsByCategory[activeInvestmentCategory][level] : null))
    .filter((opt): opt is KitOption => Boolean(opt));
  const displayedCategories = isCompactCategories ? [activeMobileCategory] : FIXED_CATEGORIES;

  const selectedBandOption = selectedBandKit
    ? activeOptions.find((option) => option.kit.id === selectedBandKit.id) ?? null
    : null;

  const selectedBandPlan = selectedBandOption && activeBudget
    ? calculateInvestmentPlan(activeBudget, selectedBandOption, activeOptions)
    : null;

  const selectedBandTotal = selectedBandKit ? calcTotal(selectedBandKit, produtos) : 0;
  const selectedBandUnits = selectedBandPlan
    ? selectedBandPlan.primaryUnits
    : 0;

  const selectedBandProjectTotal = selectedBandPlan
    ? (selectedBandPlan.primaryUnits * (selectedBandOption?.total ?? 0))
      + selectedBandPlan.extras.reduce((sum, extra) => sum + (extra.qty * extra.option.total), 0)
    : 0;

  const selectedBandLevel = selectedBandKit
    ? getKitLevel(selectedBandKit.nome) ?? 'modelo'
    : null;
  const selectedBandLevelLabelDisplay = selectedBandLevel
    ? (selectedBandUnits === 1 ? LEVEL_LABELS[selectedBandLevel] : LEVEL_LABELS_PLURAL[selectedBandLevel])
    : '';

  function applyCustomInvestment(category: FixedCategory) {
    const rawValue = customInvestmentInput[category] ?? '';
    const numericOnly = rawValue.replace(/\D/g, '');
    const parsed = Number(numericOnly);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    setSelectedInvestment((prev) => ({ ...prev, [category]: parsed }));
    setInvestmentPanel({ category, budget: parsed });
    setSelectedBandKit(null);
  }

  if (loadingData) {
    return <div className={styles.loading}>Carregando kits…</div>;
  }

  return (
    <div className={styles.page}>
      {kitsComTotal.length === 0 ? (
        <div className={styles.empty}>Nenhum kit cadastrado ainda. Aguarde o administrador configurar os kits modelos.</div>
      ) : (
        <>
          {isCompactCategories && (
            <div className={styles.mobileCategoryToggle} role="tablist" aria-label="Selecionar categoria">
              {FIXED_CATEGORIES.map((fixedCategory) => (
                <button
                  key={fixedCategory}
                  type="button"
                  role="tab"
                  aria-selected={activeMobileCategory === fixedCategory}
                  className={`${styles.mobileCategoryButton} ${activeMobileCategory === fixedCategory ? styles.mobileCategoryButtonActive : ''}`}
                  onClick={() => setActiveMobileCategory(fixedCategory)}
                >
                  {fixedCategory}
                </button>
              ))}
            </div>
          )}

          <div className={styles.dualColumns}>
            {displayedCategories.map((fixedCategory) => {
              const levelEntries = LEVELS
                .map((level) => kitsByCategory[fixedCategory][level])
                .filter((opt): opt is KitOption => Boolean(opt));

              return (
                <section key={fixedCategory} className={styles.categoryColumn}>
                  <div className={styles.categoryHeader}>{fixedCategory}</div>

                  {mode === 'investimento' ? (
                    <div className={styles.investmentValues}>
                      {INVESTMENT_VALUES.map((value) => (
                        <button
                          key={`${fixedCategory}-${value}`}
                          type="button"
                          className={`${styles.valueCard} ${selectedInvestment[fixedCategory] === value ? styles.valueCardActive : ''}`}
                          onClick={() => {
                            setSelectedInvestment((prev) => ({ ...prev, [fixedCategory]: value }));
                            setInvestmentPanel({ category: fixedCategory, budget: value });
                            setSelectedBandKit(null);
                          }}
                        >
                          {formatCurrency(value)}
                        </button>
                      ))}
                      <div className={`${styles.valueCard} ${styles.valueCardCustom}`}>
                        <label className={styles.valueCardInputLabel} htmlFor={`custom-investment-${fixedCategory}`}>
                          Valor personalizado
                        </label>
                        <div className={styles.valueCardInputRow}>
                          <span className={styles.valueCardCurrency}>R$</span>
                          <input
                            id={`custom-investment-${fixedCategory}`}
                            type="text"
                            inputMode="numeric"
                            className={styles.valueCardInput}
                            placeholder="Digite um valor"
                            value={customInvestmentInput[fixedCategory]}
                            onChange={(e) => {
                              const nextValue = e.target.value.replace(/\D/g, '');
                              setCustomInvestmentInput((prev) => ({ ...prev, [fixedCategory]: nextValue }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                applyCustomInvestment(fixedCategory);
                              }
                            }}
                            onBlur={() => applyCustomInvestment(fixedCategory)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.structureCards}>
                      <div className={styles.structureQuantityRow}>
                        <label className={styles.structureQuantityLabel} htmlFor={`structure-qty-${fixedCategory}`}>
                          Quantos kits?
                        </label>
                        <input
                          id={`structure-qty-${fixedCategory}`}
                          type="number"
                          min={1}
                          className={styles.structureQuantityInput}
                          value={structureKitUnits[fixedCategory]}
                          onChange={(e) => {
                            const nextValue = Math.max(1, Number(e.target.value) || 1);
                            setStructureKitUnits((prev) => ({ ...prev, [fixedCategory]: nextValue }));
                          }}
                        />
                      </div>
                      {LEVELS.map((level) => {
                        const option = kitsByCategory[fixedCategory][level];
                        if (!option) {
                          return (
                            <div key={`${fixedCategory}-${level}`} className={`${styles.valueCard} ${styles.structureCardMuted}`}>
                              {LEVEL_LABELS[level]} indisponível
                            </div>
                          );
                        }

                        return (
                          <button
                            key={option.kit.id}
                            type="button"
                            className={`${styles.valueCard} ${styles.structureCard}`}
                            onClick={() => openKitModal(option.kit, false, structureKitUnits[fixedCategory])}
                          >
                            <span className={styles.structureCardName}>{option.kit.nome}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {mode === 'investimento' && selectedInvestment[fixedCategory] && levelEntries.length === 0 && (
                    <div className={styles.noCategoryData}>Cadastre kits Básico, Intermediário e Modelo para {fixedCategory}.</div>
                  )}
                </section>
              );
            })}
          </div>

          {mode === 'investimento' && investmentPanel && activeBudget && activeInvestmentCategory && (
            <div className={styles.investmentPanelOverlay}>
              <div className={styles.investmentPanelContainer}>
                <aside className={styles.investmentCardSide}>
                  <div className={styles.investmentCardStack}>
                    <div className={styles.investmentLeftCard}>
                      <h3 className={styles.investmentLeftCardTitle}>{activeInvestmentCategory}</h3>
                      <span className={styles.investmentCardLabel}>Investimento</span>
                      <div className={styles.investmentCardValue}>{formatCurrency(activeBudget)}</div>
                    </div>

                    {selectedBandKit && (
                      <div className={styles.investmentLeftCard}>
                        <span className={styles.investmentMountCount}>Você monta {selectedBandUnits}</span>
                        <h4 className={styles.investmentSelectedLevel}>{selectedBandLevelLabelDisplay}</h4>
                        <div className={styles.investmentSelectedPriceBlock}>
                          <span className={styles.investmentSelectedPriceTop}>DE</span>
                          <div className={styles.investmentSelectedTotal}>{formatCurrency(selectedBandTotal)}</div>
                          <span className={styles.investmentSelectedPriceBottom}>CADA</span>
                        </div>
                      </div>
                    )}

                    {selectedBandPlan?.extras.map((extra) => (
                      <Fragment key={extra.option.kit.id}>
                        <div className={styles.investmentCardPlus} aria-hidden="true">
                          +
                        </div>
                        <div className={styles.investmentLeftCard}>
                          <span className={styles.investmentExtraLabel}>
                            {extra.qty} {extra.qty === 1 ? 'kit adicional' : 'kits adicionais'}
                          </span>
                          <h4 className={styles.investmentSelectedLevel}>{extra.option.kit.nome}</h4>
                          <div className={styles.investmentSelectedPriceBlock}>
                            <span className={styles.investmentSelectedPriceTop}>DE</span>
                            <div className={styles.investmentSelectedTotal}>{formatCurrency(extra.option.total)}</div>
                            <span className={styles.investmentSelectedPriceBottom}>CADA</span>
                          </div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </aside>

                <section className={styles.investmentBandsSide}>
                  <div className={styles.panelHeader}>
                    {selectedBandKit ? (
                      <div className={styles.detailModeToggle} role="tablist" aria-label="Modo do detalhamento">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={detailMode === 'kit'}
                          className={`${styles.detailModeButton} ${detailMode === 'kit' ? styles.detailModeButtonActive : ''}`}
                          onClick={() => setDetailMode('kit')}
                        >
                          Detalhamento do Kit
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={detailMode === 'project'}
                          className={`${styles.detailModeButton} ${detailMode === 'project' ? styles.detailModeButtonActive : ''}`}
                          onClick={() => setDetailMode('project')}
                        >
                          Detalhamento do Projeto
                        </button>
                      </div>
                    ) : (
                      <h4 className={styles.tableTitle}>Selecione o Kit</h4>
                    )}
                    <div className={styles.panelHeaderActions}>
                      {selectedBandKit && (
                        <button
                          type="button"
                          className={`${styles.btnSecondary} ${styles.panelHeaderBackBtn}`}
                          onClick={() => setSelectedBandKit(null)}
                        >
                          Voltar para faixas
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={() => {
                          setInvestmentPanel(null);
                          setSelectedBandKit(null);
                        }}
                        aria-label="Fechar painel de investimento"
                      >
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {!selectedBandKit ? (
                    <div className={styles.investmentBandsList}>
                      {LEVELS.map((level) => {
                        const option = kitsByCategory[activeInvestmentCategory][level];
                        if (!option) {
                          return (
                            <div key={level} className={styles.investmentBandStripMuted}>
                              {LEVEL_LABELS[level]} indisponível
                            </div>
                          );
                        }

                        const plan = calculateInvestmentPlan(activeBudget, option, activeOptions);

                        return (
                          <button
                            key={option.kit.id}
                            type="button"
                            className={styles.investmentBandStrip}
                            onClick={() => setSelectedBandKit(option.kit)}
                          >
                            <div className={styles.investmentBandTopRow}>
                              <span className={styles.investmentBandTitle}>{LEVEL_LABELS[level]}</span>
                              <div className={styles.investmentBandValueBlock}>
                                <span className={styles.investmentBandValue}>{formatCurrency(option.total)}</span>
                                <span className={styles.investmentBandUnit}>POR KIT</span>
                              </div>
                            </div>
                            <span className={styles.investmentBandText}>{buildPlanText(plan, option)}</span>
                            {option.kit.descricao && (
                              <span className={styles.investmentBandDescription}>{option.kit.descricao}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <InvestmentKitDetail
                      kit={selectedBandKit}
                      produtos={produtos}
                      baseKitUnits={selectedBandUnits}
                      extraProjectTotal={selectedBandPlan?.extras.reduce((sum, extra) => sum + (extra.qty * extra.option.total), 0) ?? 0}
                      extraKits={selectedBandPlan?.extras.map((extra) => ({ kit: extra.option.kit, qty: extra.qty })) ?? []}
                      detailMode={detailMode}
                      onOpenRequestModal={() => {
                        openKitModal(selectedBandKit, false);
                        setInvestmentPanel(null);
                        setSelectedBandKit(null);
                      }}
                    />
                  )}
                </section>
              </div>
            </div>
          )}

          {mode === 'estrutura' && showCustomizeForm && (
            <section className={styles.customFormSection}>
              <h3 className={styles.customFormTitle}>Personalizar Estrutura</h3>
              <div className={styles.customFormGrid}>
                <label className={styles.customLabel}>
                  Local/Categoria
                  <select
                    className={styles.filterInput}
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value as FixedCategory)}
                  >
                    {FIXED_CATEGORIES.map((fixedCategory) => (
                      <option key={fixedCategory} value={fixedCategory}>{fixedCategory}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.customLabel}>
                  Tipo de Estrutura
                  <select
                    className={styles.filterInput}
                    value={customLevel}
                    onChange={(e) => setCustomLevel(e.target.value as KitLevel)}
                  >
                    {availableLevelsForCustom.map((level) => (
                      <option key={level} value={level}>{LEVEL_LABELS[level]}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.customLabel}>
                  Quantidade
                  <input
                    type="number"
                    min={1}
                    className={styles.filterInput}
                    value={customQuantity}
                    onChange={(e) => setCustomQuantity(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
              </div>

              <div className={styles.customTotalRow}>
                <span>Total dinâmico:</span>
                <strong>{formatCurrency(customTotal)}</strong>
              </div>

              {customSelectedOption && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => openKitModal(customSelectedOption.kit)}
                >
                  Abrir Tabela de Detalhamento
                </button>
              )}
            </section>
          )}
        </>
      )}

      {modalKit && (
        <KitDetailModal
          kit={modalKit}
          produtos={produtos}
          user={user}
          projectUnits={modalProjectUnits}
          initialCustomizing={modalInitialCustomizing}
          onClose={() => {
            setModalKit(null);
            setModalProjectUnits(1);
            setModalInitialCustomizing(false);
          }}
        />
      )}
    </div>
  );
}

export default function ProjetosModelosPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Carregando kits…</div>}>
      <ProjetosModelosPageContent />
    </Suspense>
  );
}
