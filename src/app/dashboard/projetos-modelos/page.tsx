'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { CATEGORIAS_KIT } from '@/lib/constants';
import type { ProdutoModelo } from '../admin/produtos-modelos/page';
import type { KitModelo } from '../admin/kits-modelos/page';
import styles from './projetos-modelos.module.css';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function calcTotal(kit: KitModelo, produtos: ProdutoModelo[]): number {
  return kit.itens.reduce((acc, item) => {
    const p = produtos.find((x) => x.id === item.produtoId);
    return acc + (p ? p.precoUnitario * item.quantidade : 0);
  }, 0);
}

function KitCard({ kit, total, orcamento }: { kit: KitModelo; total: number; orcamento: number }) {
  const quantidadeKits = orcamento > 0 && total > 0 ? Math.floor(orcamento / total) : null;

  return (
    <Link href={`/dashboard/projetos-modelos/${kit.id}`} className={styles.kitCard} aria-label={`Ver kit ${kit.nome}`}>
      <div className={styles.kitCardTop}>
        <span className={styles.kitCategory}>{kit.categoria}</span>
        <span className={styles.kitTotal}>{formatCurrency(total)}</span>
      </div>
      <h3 className={styles.kitName}>{kit.nome}</h3>
      {kit.descricao && <p className={styles.kitDesc}>{kit.descricao}</p>}
      <div className={styles.kitMeta}>
        <span className={styles.kitCount}>{kit.itens.length} produto(s)</span>
        {quantidadeKits !== null && quantidadeKits > 0 && (
          <span className={styles.kitFit}>
            ✓ {quantidadeKits}× no orçamento
          </span>
        )}
        {quantidadeKits === 0 && (
          <span className={styles.kitNoFit}>Orçamento insuficiente</span>
        )}
      </div>
    </Link>
  );
}

export default function ProjetosModelosPage() {
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [kits, setKits] = useState<KitModelo[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [orcamento, setOrcamento] = useState('');
  const [categoria, setCategoria] = useState('');

  useEffect(() => {
    let resolvedP = false;
    let resolvedK = false;

    const checkDone = () => { if (resolvedP && resolvedK) setLoadingData(false); };

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

    return () => { unsubP(); unsubK(); };
  }, []);

  const orcamentoNum = useMemo(() => {
    const raw = orcamento.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  }, [orcamento]);

  const kitsComTotal = useMemo(() => {
    return kits.map((kit) => ({ kit, total: calcTotal(kit, produtos) }));
  }, [kits, produtos]);

  const kitsFiltrados = useMemo(() => {
    return kitsComTotal.filter(({ kit, total }) => {
      if (categoria && kit.categoria !== categoria) return false;
      if (orcamentoNum > 0 && total > orcamentoNum) return false;
      return true;
    });
  }, [kitsComTotal, categoria, orcamentoNum]);

  const kitsForaDoBudget = useMemo(() => {
    if (orcamentoNum <= 0 || !categoria) return [];
    return kitsComTotal.filter(({ kit, total }) => {
      if (categoria && kit.categoria !== categoria) return false;
      if (total <= orcamentoNum) return false;
      return true;
    });
  }, [kitsComTotal, categoria, orcamentoNum]);

  function handleOrcamentoChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow only digits, comma and dot
    const val = e.target.value.replace(/[^\d.,]/g, '');
    setOrcamento(val);
  }

  if (loadingData) {
    return <div className={styles.loading}>Carregando kits…</div>;
  }

  return (
    <div className={styles.page}>
      {/* Filters */}
      <div className={styles.filtersCard}>
        <h2 className={styles.filtersTitle}>Filtrar Kits</h2>
        <div className={styles.filtersRow}>
          <div className={styles.filterField}>
            <label className={styles.filterLabel} htmlFor="orcamento">Valor máximo do orçamento (R$)</label>
            <input
              id="orcamento"
              type="text"
              inputMode="decimal"
              className={styles.filterInput}
              placeholder="Ex: 800000"
              value={orcamento}
              onChange={handleOrcamentoChange}
            />
          </div>
          <div className={styles.filterField}>
            <label className={styles.filterLabel} htmlFor="categoria">Categoria</label>
            <select
              id="categoria"
              className={styles.filterInput}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {CATEGORIAS_KIT.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {(orcamento || categoria) && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => { setOrcamento(''); setCategoria(''); }}
            >
              Limpar filtros
            </button>
          )}
        </div>

        {orcamentoNum > 0 && (
          <p className={styles.filterSummary}>
            Orçamento: <strong>{formatCurrency(orcamentoNum)}</strong>
            {categoria && <> · Categoria: <strong>{categoria}</strong></>}
            {' '}— {kitsFiltrados.length} kit(s) se encaixam
          </p>
        )}
      </div>

      {/* Results */}
      {kitsComTotal.length === 0 ? (
        <div className={styles.empty}>
          Nenhum kit cadastrado ainda. Aguarde o administrador configurar os kits modelos.
        </div>
      ) : kitsFiltrados.length === 0 && orcamentoNum > 0 ? (
        <div className={styles.noResults}>
          <p>Nenhum kit se encaixa no orçamento informado{categoria ? ` para a categoria "${categoria}"` : ''}.</p>
          {kitsForaDoBudget.length > 0 && (
            <p className={styles.suggestionText}>
              O kit mais próximo nessa categoria custa{' '}
              <strong>
                {formatCurrency(Math.min(...kitsForaDoBudget.map((k) => k.total)))}
              </strong>.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {kitsFiltrados.map(({ kit, total }) => (
            <KitCard
              key={kit.id}
              kit={kit}
              total={total}
              orcamento={orcamentoNum}
            />
          ))}
        </div>
      )}

      {/* Kits outside budget suggestion */}
      {kitsFiltrados.length > 0 && orcamentoNum > 0 && kitsForaDoBudget.length > 0 && (
        <div className={styles.suggestionsSection}>
          <h3 className={styles.suggestionsTitle}>Kits acima do orçamento</h3>
          <div className={styles.grid}>
            {kitsForaDoBudget.map(({ kit, total }) => (
              <KitCard
                key={kit.id}
                kit={kit}
                total={total}
                orcamento={orcamentoNum}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
