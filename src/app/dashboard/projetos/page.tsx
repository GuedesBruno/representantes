'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ESTADOS_BR, STATUS_LABELS } from '@/lib/constants';
import styles from './projetos.module.css';

interface Projeto {
  id: string;
  nome: string;
  cliente: string;
  estado: string;
  municipio: string;
  status: string;
  tipoSolucao?: string;
  estimativaValor?: number;
  revendedorId: string;
  criadoEm?: { toDate(): Date };
  atualizadoEm?: { toDate(): Date };
}

const STATUS_COLORS: Record<string, string> = {
  em_prospeccao: 'prospecting',
  em_andamento: 'active',
  ganho: 'won',
  perdido: 'lost',
  pausado: 'paused',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function ProjectCard({ projeto }: { projeto: Projeto }) {
  const statusKey = STATUS_COLORS[projeto.status] || 'active';
  const statusLabel = STATUS_LABELS[projeto.status] ?? projeto.status;
  const date = projeto.atualizadoEm?.toDate?.() ?? projeto.criadoEm?.toDate?.();
  const dateStr = date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—';

  return (
    <article className={styles.card} aria-label={`Projeto: ${projeto.nome}`}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{projeto.nome}</h3>
          <p className={styles.cardClient}>{projeto.cliente}</p>
        </div>
        <span
          className={`${styles.badge} ${styles[`badge_${statusKey}`]}`}
          aria-label={`Status: ${statusLabel}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
          {projeto.municipio}, {projeto.estado}
        </span>
        {projeto.tipoSolucao && (
          <span className={styles.metaItem}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {projeto.tipoSolucao}
          </span>
        )}
      </div>

      <div className={styles.cardFooter}>
        {projeto.estimativaValor ? (
          <span className={styles.value}>{formatCurrency(projeto.estimativaValor)}</span>
        ) : (
          <span className={styles.valueEmpty}>Valor não informado</span>
        )}
        <time className={styles.date} dateTime={date?.toISOString()}>
          Atualizado: {dateStr}
        </time>
      </div>
    </article>
  );
}

export default function ProjetosPage() {
  const { user } = useAuth();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'projetos'),
      where('revendedorId', '==', user.uid),
      orderBy('atualizadoEm', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Projeto[];
        setProjetos(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsubscribe;
  }, [user]);

  const filtered = useMemo(() => {
    return projetos.filter((p) => {
      const matchSearch =
        !search ||
        p.nome.toLowerCase().includes(search.toLowerCase()) ||
        p.cliente.toLowerCase().includes(search.toLowerCase()) ||
        p.municipio.toLowerCase().includes(search.toLowerCase());
      const matchEstado = !filterEstado || p.estado === filterEstado;
      const matchStatus = !filterStatus || p.status === filterStatus;
      return matchSearch && matchEstado && matchStatus;
    });
  }, [projetos, search, filterEstado, filterStatus]);

  const totalValue = filtered.reduce((acc, p) => acc + (p.estimativaValor ?? 0), 0);

  return (
    <div className={styles.page}>
      {/* Summary strip */}
      <div className={styles.summary} role="region" aria-label="Resumo dos projetos">
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{loading ? '—' : projetos.length}</span>
          <span className={styles.summaryLabel}>Total de projetos</span>
        </div>
        <div className={styles.summaryDivider} aria-hidden="true" />
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{loading ? '—' : filtered.length}</span>
          <span className={styles.summaryLabel}>Exibindo</span>
        </div>
        <div className={styles.summaryDivider} aria-hidden="true" />
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{loading ? '—' : formatCurrency(totalValue)}</span>
          <span className={styles.summaryLabel}>Pipeline filtrado</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters} role="search" aria-label="Filtros de projetos">
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Buscar por nome, cliente ou município…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar projetos"
          />
        </div>

        <select
          className={styles.select}
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos os estados</option>
          {ESTADOS_BR.map((e) => (
            <option key={e.sigla} value={e.sigla}>{e.nome} ({e.sigla})</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {(search || filterEstado || filterStatus) && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => { setSearch(''); setFilterEstado(''); setFilterStatus(''); }}
            aria-label="Limpar filtros"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true" aria-label="Carregando projetos">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={styles.skeletonCard} aria-hidden="true">
              <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
              <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
              <div className={`${styles.skeletonLine} ${styles.skeletonLineNarrow}`} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty} role="status">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="var(--color-gray-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className={styles.emptyTitle}>
            {projetos.length === 0 ? 'Nenhum projeto encontrado' : 'Nenhum projeto corresponde aos filtros'}
          </p>
          <p className={styles.emptyText}>
            {projetos.length === 0
              ? 'Cadastre sua primeira oportunidade para começar.'
              : 'Tente ajustar os filtros ou limpar a busca.'}
          </p>
        </div>
      ) : (
        <div className={styles.grid} aria-label={`${filtered.length} projetos encontrados`}>
          {filtered.map((projeto) => (
            <ProjectCard key={projeto.id} projeto={projeto} />
          ))}
        </div>
      )}
    </div>
  );
}
