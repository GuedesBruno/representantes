'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from '../usuarios/usuarios-admin.module.css'; // Reusing styles for consistency

const MATERIAL_ORDER_OPTIONS = [
  { href: '/dashboard/folhetos', label: 'Folhetos' },
  { href: '/dashboard/atas-abertas', label: 'Atas Abertas' },
  { href: '/dashboard/tabela-precos', label: 'Tabela de Preços' },
  { href: '/dashboard/videos', label: 'Vídeos' },
  { href: '/dashboard/produtos', label: 'Produtos' },
  { href: '/dashboard/projetos', label: 'Projetos' },
  { href: '/dashboard/projetos-modelos', label: 'Projetos (Antigo)' },
] as const;

const DEFAULT_MATERIAL_ORDER = MATERIAL_ORDER_OPTIONS.map((item) => item.href);

function normalizeMaterialOrder(rawOrder: unknown): string[] {
  if (!Array.isArray(rawOrder)) {
    return DEFAULT_MATERIAL_ORDER;
  }

  const validSet = new Set<string>(DEFAULT_MATERIAL_ORDER);
  const unique = new Set<string>();

  for (const value of rawOrder) {
    const href = String(value ?? '').trim();
    if (validSet.has(href)) {
      unique.add(href);
    }
  }

  const normalized = [...unique];
  for (const href of DEFAULT_MATERIAL_ORDER) {
    if (!normalized.includes(href)) {
      normalized.push(href);
    }
  }

  return normalized;
}

export default function ConfiguraçõesPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [materialOrder, setMaterialOrder] = useState<string[]>(DEFAULT_MATERIAL_ORDER);
  const [materialOrderLoading, setMaterialOrderLoading] = useState(true);
  const [materialOrderSaving, setMaterialOrderSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [loading, isAdmin, router]);

  useEffect(() => {
    async function loadMaterialOrder() {
      try {
        const snapshot = await getDoc(doc(db, 'app_settings', 'navigation'));
        const rawOrder = snapshot.data()?.materialOrder;
        setMaterialOrder(normalizeMaterialOrder(rawOrder));
      } catch {
        setMaterialOrder(DEFAULT_MATERIAL_ORDER);
      } finally {
        setMaterialOrderLoading(false);
      }
    }

    if (isAdmin) {
      loadMaterialOrder();
    }
  }, [isAdmin]);

  const materialLabelByHref = useMemo(() => {
    return Object.fromEntries(MATERIAL_ORDER_OPTIONS.map((item) => [item.href, item.label]));
  }, []);

  function moveMaterial(fromIndex: number, direction: 'up' | 'down') {
    setMessage('');
    setError('');

    setMaterialOrder((prev) => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
  }

  async function handleSaveMaterialOrder() {
    if (!user) return;

    setMaterialOrderSaving(true);
    setMessage('');
    setError('');

    try {
      await setDoc(
        doc(db, 'app_settings', 'navigation'),
        {
          materialOrder,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage('Configurações salvas com sucesso.');
    } catch {
      setError('Não foi possível salvar as configurações agora. Tente novamente.');
    } finally {
      setMaterialOrderSaving(false);
    }
  }

  if (loading || materialOrderLoading) {
    return <div className={styles.loading}>Carregando configurações…</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h3 className={styles.sectionTitle}>Ordem de Exibição (Materiais)</h3>
        <p className={styles.settingHint}>Defina a ordem dos módulos no menu lateral.</p>

        <ul className={styles.orderList}>
          {materialOrder.map((href, index) => (
            <li key={href} className={styles.orderItem}>
              <span className={styles.orderLabel}>{materialLabelByHref[href] ?? href}</span>
              <div className={styles.orderButtons}>
                <button
                  type="button"
                  className={styles.orderButton}
                  disabled={index === 0}
                  onClick={() => moveMaterial(index, 'up')}
                >
                  Subir
                </button>
                <button
                  type="button"
                  className={styles.orderButton}
                  disabled={index === materialOrder.length - 1}
                  onClick={() => moveMaterial(index, 'down')}
                >
                  Descer
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setMaterialOrder(DEFAULT_MATERIAL_ORDER);
              setMessage('');
              setError('');
            }}
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={materialOrderSaving}
            onClick={handleSaveMaterialOrder}
          >
            {materialOrderSaving ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.success}>{message}</p> : null}
      </section>
    </div>
  );
}
