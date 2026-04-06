'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { CATEGORIAS_KIT } from '@/lib/constants';
import type { ProdutoModelo } from '../produtos-modelos/page';
import styles from './kits-admin.module.css';

export interface KitItem {
  produtoId: string;
  nomeProduto: string;
  quantidade: number;
}

export interface KitModelo {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  itens: KitItem[];
  criadoEm?: { toDate(): Date };
  atualizadoEm?: { toDate(): Date };
}

const EMPTY_KIT = { nome: '', categoria: CATEGORIAS_KIT[0], descricao: '' };

function calcTotal(itens: KitItem[], produtos: ProdutoModelo[]): number {
  return itens.reduce((acc, item) => {
    const p = produtos.find((x) => x.id === item.produtoId);
    return acc + (p ? p.precoUnitario * item.quantidade : 0);
  }, 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function KitsModelosAdminPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [kits, setKits] = useState<KitModelo[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  // view: 'list' | 'form'
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kitForm, setKitForm] = useState(EMPTY_KIT);
  const [kitItens, setKitItens] = useState<KitItem[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // product picker state
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/dashboard');
  }, [isAdmin, loading, router]);

  useEffect(() => {
    setLoadingData(true);
    let resolvedProdutos = false;
    let resolvedKits = false;

    const checkDone = () => {
      if (resolvedProdutos && resolvedKits) setLoadingData(false);
    };

    const unsubP = onSnapshot(
      query(collection(db, 'produtos_modelos'), orderBy('nome')),
      (snap) => {
        setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoModelo)));
        setLoadError('');
        resolvedProdutos = true;
        checkDone();
      },
      () => {
        setLoadError('Não foi possível carregar produtos. Verifique permissões e regras do Firestore.');
        resolvedProdutos = true;
        checkDone();
      }
    );

    const unsubK = onSnapshot(
      query(collection(db, 'kits_modelos'), orderBy('nome')),
      (snap) => {
        setKits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KitModelo)));
        setLoadError('');
        resolvedKits = true;
        checkDone();
      },
      () => {
        setLoadError('Não foi possível carregar kits. Verifique permissões e regras do Firestore.');
        resolvedKits = true;
        checkDone();
      }
    );

    return () => { unsubP(); unsubK(); };
  }, []);

  function openNew() {
    setEditingId(null);
    setKitForm(EMPTY_KIT);
    setKitItens([]);
    setError('');
    setPickerSearch('');
    setMode('form');
  }

  function openEdit(kit: KitModelo) {
    setEditingId(kit.id);
    setKitForm({ nome: kit.nome, categoria: kit.categoria, descricao: kit.descricao });
    setKitItens(kit.itens.map((i) => ({ ...i })));
    setError('');
    setPickerSearch('');
    setMode('form');
  }

  function handleKitFormChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setKitForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function addProduto(p: ProdutoModelo) {
    setKitItens((prev) => {
      const exists = prev.find((i) => i.produtoId === p.id);
      if (exists) return prev;
      return [...prev, { produtoId: p.id, nomeProduto: p.nome, quantidade: 1 }];
    });
  }

  function removeItem(produtoId: string) {
    setKitItens((prev) => prev.filter((i) => i.produtoId !== produtoId));
  }

  function setQuantidade(produtoId: string, val: string) {
    const n = Math.max(1, parseInt(val, 10) || 1);
    setKitItens((prev) =>
      prev.map((i) => i.produtoId === produtoId ? { ...i, quantidade: n } : i)
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!kitForm.nome.trim()) { setError('Nome é obrigatório.'); return; }
    if (kitItens.length === 0) { setError('Adicione pelo menos um produto ao kit.'); return; }

    setSubmitting(true);
    try {
      const payload = {
        nome: kitForm.nome.trim(),
        categoria: kitForm.categoria,
        descricao: kitForm.descricao.trim(),
        itens: kitItens,
        atualizadoEm: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'kits_modelos', editingId), payload);
      } else {
        await addDoc(collection(db, 'kits_modelos'), {
          ...payload,
          criadoEm: serverTimestamp(),
        });
      }
      setMode('list');
    } catch {
      setError('Erro ao salvar o kit. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDoc(doc(db, 'kits_modelos', id));
      setDeleteConfirm(null);
    } catch {
      // noop
    }
  }

  if (loading || loadingData) {
    return <div className={styles.loading}>Carregando…</div>;
  }
  if (!isAdmin) return null;
  if (loadError) {
    return <div className={styles.errorMsg}>{loadError}</div>;
  }

  const filteredProdutos = produtos.filter((p) =>
    p.nome.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  const totalAtual = calcTotal(kitItens, produtos);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'list' ? styles.tabActive : ''}`}
            onClick={() => setMode('list')}
          >
            Lista de Kits
          </button>
        </div>
        {mode === 'list' && (
          <button type="button" className={styles.btnPrimary} onClick={openNew}>
            + Novo Kit
          </button>
        )}
      </div>

      {/* LIST */}
      {mode === 'list' && (
        <div className={styles.card}>
          {kits.length === 0 ? (
            <div className={styles.empty}>Nenhum kit cadastrado. Clique em "Novo Kit".</div>
          ) : (
            <div className={styles.kitList}>
              {kits.map((kit) => {
                const total = calcTotal(kit.itens, produtos);
                return (
                  <div key={kit.id} className={styles.kitCard}>
                    <div className={styles.kitCardHeader}>
                      <div>
                        <h3 className={styles.kitName}>{kit.nome}</h3>
                        <span className={styles.kitCategory}>{kit.categoria}</span>
                      </div>
                      <span className={styles.kitTotal}>{formatCurrency(total)}</span>
                    </div>
                    {kit.descricao && (
                      <p className={styles.kitDesc}>{kit.descricao}</p>
                    )}
                    <p className={styles.kitItemsCount}>{kit.itens.length} produto(s)</p>
                    <div className={styles.kitActions}>
                      <button type="button" className={styles.btnEdit} onClick={() => openEdit(kit)}>
                        Editar
                      </button>
                      {deleteConfirm === kit.id ? (
                        <span className={styles.deleteConfirm}>
                          Confirmar?{' '}
                          <button type="button" className={styles.btnDanger} onClick={() => handleDelete(kit.id)}>Sim</button>
                          {' '}
                          <button type="button" className={styles.btnCancelSmall} onClick={() => setDeleteConfirm(null)}>Não</button>
                        </span>
                      ) : (
                        <button type="button" className={styles.btnDanger} onClick={() => setDeleteConfirm(kit.id)}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FORM */}
      {mode === 'form' && (
        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.formLayout}>
            {/* Left: kit metadata + selected items */}
            <div className={styles.formMain}>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>{editingId ? 'Editar Kit' : 'Novo Kit'}</h2>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="nome">Nome do Kit *</label>
                    <input
                      id="nome"
                      name="nome"
                      type="text"
                      className={styles.input}
                      value={kitForm.nome}
                      onChange={handleKitFormChange}
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="categoria">Categoria *</label>
                    <select
                      id="categoria"
                      name="categoria"
                      className={styles.input}
                      value={kitForm.categoria}
                      onChange={handleKitFormChange}
                    >
                      {CATEGORIAS_KIT.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label className={styles.label} htmlFor="descricao">Descrição</label>
                    <textarea
                      id="descricao"
                      name="descricao"
                      className={styles.textarea}
                      value={kitForm.descricao}
                      onChange={handleKitFormChange}
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Selected items */}
              <div className={styles.card} style={{ marginTop: '1rem' }}>
                <div className={styles.selectedHeader}>
                  <h3 className={styles.cardTitle} style={{ margin: 0 }}>Produtos do Kit</h3>
                  <span className={styles.kitTotalBadge}>{formatCurrency(totalAtual)}</span>
                </div>

                {kitItens.length === 0 ? (
                  <p className={styles.emptyItems}>Selecione produtos na lista à direita.</p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Produto</th>
                          <th className={styles.th}>Preço Unit.</th>
                          <th className={styles.th}>Qtd</th>
                          <th className={styles.th}>Subtotal</th>
                          <th className={styles.th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {kitItens.map((item) => {
                          const prod = produtos.find((p) => p.id === item.produtoId);
                          const sub = prod ? prod.precoUnitario * item.quantidade : 0;
                          return (
                            <tr key={item.produtoId} className={styles.tr}>
                              <td className={styles.td}>
                                <div className={styles.itemName}>
                                  {prod?.fotoUrl && (
                                    <img
                                      src={prod.fotoUrl}
                                      alt={prod.nome}
                                      className={styles.thumbSmall}
                                      loading="lazy"
                                    />
                                  )}
                                  {item.nomeProduto}
                                </div>
                              </td>
                              <td className={styles.td}>{prod ? formatCurrency(prod.precoUnitario) : '—'}</td>
                              <td className={styles.td}>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantidade}
                                  onChange={(e) => setQuantidade(item.produtoId, e.target.value)}
                                  className={styles.qtyInput}
                                  aria-label={`Quantidade de ${item.nomeProduto}`}
                                />
                              </td>
                              <td className={styles.td}>{formatCurrency(sub)}</td>
                              <td className={styles.td}>
                                <button
                                  type="button"
                                  className={styles.btnRemove}
                                  onClick={() => removeItem(item.produtoId)}
                                  aria-label={`Remover ${item.nomeProduto}`}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {error && <p className={styles.errorMsg} role="alert">{error}</p>}

                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    onClick={() => setMode('list')}
                    disabled={submitting}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                    {submitting ? 'Salvando…' : 'Salvar Kit'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: product picker */}
            <div className={styles.picker}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Adicionar Produtos</h3>
                <input
                  type="search"
                  placeholder="Buscar produto…"
                  className={styles.input}
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  aria-label="Buscar produto"
                />
                <div className={styles.pickerList}>
                  {filteredProdutos.length === 0 ? (
                    <p className={styles.emptyItems}>Nenhum produto encontrado.</p>
                  ) : (
                    filteredProdutos.map((p) => {
                      const already = kitItens.some((i) => i.produtoId === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.pickerItem} ${already ? styles.pickerItemAdded : ''}`}
                          onClick={() => addProduto(p)}
                          disabled={already}
                          title={already ? 'Já adicionado' : `Adicionar ${p.nome}`}
                        >
                          {p.fotoUrl && (
                            <img
                              src={p.fotoUrl}
                              alt={p.nome}
                              className={styles.thumbSmall}
                              loading="lazy"
                            />
                          )}
                          <div className={styles.pickerItemInfo}>
                            <span className={styles.pickerItemName}>{p.nome}</span>
                            <span className={styles.pickerItemPrice}>{formatCurrency(p.precoUnitario)}</span>
                          </div>
                          {already ? (
                            <span className={styles.addedBadge}>✓</span>
                          ) : (
                            <span className={styles.addBtn}>+</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
