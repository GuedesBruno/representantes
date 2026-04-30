'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './projetos.module.css';

// Interfaces
interface ProdutoModelo {
  id: string;
  nome: string;
  precoUnitario: number;
  fotoUrl?: string;
  descricaoCurta?: string;
}

interface KitItem {
  produtoId: string;
  nomeProduto: string;
  quantidade: number;
}

interface KitModelo {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  itens: KitItem[];
}

type ViewMode = 'investimento' | 'estrutura';
type FixedCategory = 'Educação' | 'Biblioteca';
type KitLevel = 'basico' | 'intermediario' | 'modelo';

interface KitOption {
  level: KitLevel;
  kit: KitModelo;
  total: number;
}

const FIXED_CATEGORIES: FixedCategory[] = ['Educação', 'Biblioteca'];
const LEVELS: KitLevel[] = ['basico', 'intermediario', 'modelo'];
const LEVEL_LABELS: Record<KitLevel, string> = {
  basico: 'Kit Inicial',
  intermediario: 'Kit Intermediário',
  modelo: 'Kit Completo',
};

const INVESTMENT_VALUES = [200000, 500000, 1000000, 3000000] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

function calcKitTotal(kit: KitModelo, produtos: ProdutoModelo[]): number {
  return kit.itens.reduce((acc, item) => {
    const p = produtos.find((x) => x.id === item.produtoId);
    return acc + (p ? p.precoUnitario * item.quantidade : 0);
  }, 0);
}

function ProjetosPageContent() {
  const { user } = useAuth();
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [kits, setKits] = useState<KitModelo[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados da Sequência Lógica
  const [mode, setMode] = useState<ViewMode | null>(null);
  const [units, setUnits] = useState<number>(0);
  const [budget, setBudget] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<FixedCategory | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<KitLevel | null>(null);

  const [activeStep, setActiveStep] = useState<number>(1);
  const [isFinished, setIsFinished] = useState(false);
  const [kitEmDetalhe, setKitEmDetalhe] = useState<KitModelo | null>(null);
  const [pointerTop, setPointerTop] = useState<number>(0);
  
  const [isEditing, setIsEditing] = useState(false);
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});

  const [requesting, setRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados do Modal de Cotação
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteOrgao, setQuoteOrgao] = useState('');
  const [quoteResponsavel, setQuoteResponsavel] = useState('');
  const [quoteCnpj, setQuoteCnpj] = useState('');

  useEffect(() => {
    let resolvedP = false;
    let resolvedK = false;
    const checkDone = () => { if (resolvedP && resolvedK) setLoading(false); };
    const unsubP = onSnapshot(query(collection(db, 'produtos'), orderBy('nome')), (snap) => {
      setProdutos(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProdutoModelo)));
      resolvedP = true;
      checkDone();
    });
    const unsubK = onSnapshot(query(collection(db, 'kits_modelos'), orderBy('nome')), (snap) => {
      setKits(snap.docs.map(d => ({ id: d.id, ...d.data() } as KitModelo)));
      resolvedK = true;
      checkDone();
    });
    return () => { unsubP(); unsubK(); };
  }, []);

  const kitsByCategory = useMemo(() => {
    const structure: Record<FixedCategory, Partial<Record<KitLevel, KitOption>>> = { Educação: {}, Biblioteca: {} };
    kits.forEach(kit => {
      const total = calcKitTotal(kit, produtos);
      if (total <= 0) return;
      const cat = getFixedCategory(kit.categoria);
      const lvl = getKitLevel(kit.nome);
      if (cat && lvl) structure[cat][lvl] = { level: lvl, kit, total };
    });
    return structure;
  }, [kits, produtos]);

  const investmentPlan = useMemo(() => {
    if (mode !== 'investimento' || !selectedCategory || !selectedLevel || !budget) return null;
    const baseOption = kitsByCategory[selectedCategory][selectedLevel];
    if (!baseOption) return null;

    const primaryUnits = Math.floor(budget / baseOption.total);
    let remaining = budget - (primaryUnits * baseOption.total);
    const extras: Array<{ option: KitOption; qty: number }> = [];

    const otherOptions = LEVELS.map(l => kitsByCategory[selectedCategory][l]).filter((o): o is KitOption => Boolean(o)).sort((a, b) => b.total - a.total);

    let guard = 0;
    while (remaining > 0 && guard < 20) {
      const next = otherOptions.find(o => o.total <= remaining);
      if (!next) break;
      const existing = extras.find(e => e.option.kit.id === next.kit.id);
      if (existing) existing.qty++; else extras.push({ option: next, qty: 1 });
      remaining -= next.total;
      guard++;
    }
    return { primaryUnits, extras, total: budget - remaining, baseOption };
  }, [mode, selectedCategory, selectedLevel, budget, kitsByCategory]);

  const consolidatedItems = useMemo(() => {
    const itemMap = new Map<string, { produtoId: string; nomeProduto: string; quantidade: number }>();
    if (mode === 'estrutura' && selectedCategory && selectedLevel) {
      const opt = kitsByCategory[selectedCategory][selectedLevel];
      if (opt) opt.kit.itens.forEach(item => { itemMap.set(item.produtoId, { ...item, quantidade: item.quantidade * units }); });
    } else if (mode === 'investimento' && investmentPlan) {
      investmentPlan.baseOption.kit.itens.forEach(item => { itemMap.set(item.produtoId, { ...item, quantidade: item.quantidade * investmentPlan.primaryUnits }); });
      investmentPlan.extras.forEach(extra => {
        extra.option.kit.itens.forEach(item => {
          const existing = itemMap.get(item.produtoId);
          if (existing) existing.quantidade += item.quantidade * extra.qty;
          else itemMap.set(item.produtoId, { ...item, quantidade: item.quantidade * extra.qty });
        });
      });
    }
    return Array.from(itemMap.values());
  }, [mode, selectedCategory, selectedLevel, units, investmentPlan, kitsByCategory]);

  const activeOption = selectedCategory && selectedLevel ? kitsByCategory[selectedCategory][selectedLevel] : null;

  // Quantidades atuais (normais ou personalizadas)
  const currentItems = useMemo(() => {
    return consolidatedItems.map(item => ({
      ...item,
      quantidade: customQuantities[item.produtoId] ?? item.quantidade
    }));
  }, [consolidatedItems, customQuantities]);

  const projectTotal = useMemo(() => {
    return currentItems.reduce((acc, item) => {
      const p = produtos.find(x => x.id === item.produtoId);
      return acc + (item.quantidade * (p?.precoUnitario || 0));
    }, 0);
  }, [currentItems, produtos]);

  const handleUpdateQty = (productId: string, delta: number) => {
    setCustomQuantities(prev => {
      const baseQty = prev[productId] ?? consolidatedItems.find(i => i.produtoId === productId)?.quantidade ?? 0;
      const newQty = Math.max(0, baseQty + delta);
      return { ...prev, [productId]: newQty };
    });
  };

  async function handleRequestQuote() {
    if (!user || currentItems.length === 0) return;

    // Se o modal não estiver aberto, abre-o
    if (!showQuoteModal) {
      setShowQuoteModal(true);
      return;
    }

    // Validação básica
    if (!quoteOrgao.trim() || !quoteResponsavel.trim() || !quoteCnpj.trim()) {
      setRequestStatus({ type: 'error', message: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    setRequesting(true);
    setRequestStatus(null);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/projects/request-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          kitId: activeOption?.kit.id || 'custom',
          kitNome: mode === 'investimento' ? `Projeto Investimento - ${selectedCategory}` : activeOption?.kit.nome,
          itens: currentItems.map(i => ({ 
            ...i, 
            precoUnitario: produtos.find(p => p.id === i.produtoId)?.precoUnitario || 0 
          })),
          totalGeral: projectTotal,
          representanteEmail: user.email,
          representanteNome: user.displayName,
          // Novos campos
          nomeOrgao: quoteOrgao.trim(),
          nomeResponsavel: quoteResponsavel.trim(),
          cnpj: quoteCnpj.trim(),
        }),
      });
      if (!response.ok) throw new Error('Erro ao enviar.');
      setRequestStatus({ type: 'success', message: 'Solicitação enviada!' });
      setShowQuoteModal(false);
      // Limpa os campos após sucesso
      setQuoteOrgao('');
      setQuoteResponsavel('');
      setQuoteCnpj('');
    } catch {
      setRequestStatus({ type: 'error', message: 'Erro ao solicitar.' });
    } finally { setRequesting(false); }
  }

  const goToStep = (step: number) => {
    setActiveStep(step);
    setIsFinished(false);
  };

  if (loading) return <div className={styles.loading}>Carregando...</div>;

  return (
    <div className={styles.page}>


      {/* COLUNA 1: PILHA DE ESCOLHAS */}
      <div className={styles.summaryColumn}>
        {/* ETAPA 1: Sempre visível */}
        <div className={`${styles.summaryCard} ${activeStep === 1 && !isFinished ? styles.summaryCardActive : ''} ${mode ? styles.summaryCardDone : ''}`} onClick={() => goToStep(1)}>
          <span className={styles.summaryStep}>Etapa 1</span>
          <span className={styles.summaryLabel}>Objetivo</span>
          {mode && <div className={styles.summaryValue}>{mode === 'investimento' ? 'Por Investimento' : 'Por Estrutura'}</div>}
        </div>

        {/* ETAPA 2 */}
        {mode && (
          <div 
            className={`${styles.summaryCard} ${activeStep === 2 && !isFinished ? styles.summaryCardActive : ''} ${(mode === 'investimento' ? budget > 0 : selectedCategory) ? styles.summaryCardDone : ''}`} 
            onClick={() => goToStep(2)}
          >
            <span className={styles.summaryStep}>Etapa 2</span>
            <span className={styles.summaryLabel}>{mode === 'investimento' ? 'Valor de Investimento' : 'Onde Aplicar'}</span>
            {mode === 'investimento' ? (
              budget > 0 && <div className={styles.summaryValue}>{formatCurrency(budget)}</div>
            ) : (
              selectedCategory && <div className={styles.summaryValue}>{selectedCategory}</div>
            )}
          </div>
        )}

        {/* ETAPA 3 */}
        {mode && (mode === 'investimento' ? budget > 0 : selectedCategory) && (
          <div 
            className={`${styles.summaryCard} ${activeStep === 3 && !isFinished ? styles.summaryCardActive : ''} ${(mode === 'investimento' ? selectedCategory : selectedLevel) ? styles.summaryCardDone : ''}`} 
            onClick={() => goToStep(3)}
          >
            <span className={styles.summaryStep}>Etapa 3</span>
            <span className={styles.summaryLabel}>{mode === 'investimento' ? 'Onde Aplicar' : 'Escolha o Kit'}</span>
            {mode === 'investimento' ? (
              selectedCategory && <div className={styles.summaryValue}>{selectedCategory}</div>
            ) : (
              selectedLevel && <div className={styles.summaryValue}>{LEVEL_LABELS[selectedLevel]}</div>
            )}
          </div>
        )}

        {/* ETAPA 4 */}
        {mode && (mode === 'investimento' ? selectedCategory : selectedLevel) && (
          <div 
            className={`${styles.summaryCard} ${activeStep === 4 && !isFinished ? styles.summaryCardActive : ''} ${(mode === 'investimento' ? selectedLevel : units > 0) ? styles.summaryCardDone : ''}`} 
            onClick={() => goToStep(4)}
          >
            <span className={styles.summaryStep}>Etapa 4</span>
            <span className={styles.summaryLabel}>{mode === 'investimento' ? 'Modelo Base' : 'Quantidade de Kits'}</span>
            {mode === 'investimento' ? (
              selectedLevel && <div className={styles.summaryValue}>{LEVEL_LABELS[selectedLevel]}</div>
            ) : (
              units > 0 && <div className={styles.summaryValue}>{units} Unidades</div>
            )}
          </div>
        )}
      </div>

      {/* COLUNA 2: OPÇÕES */}
      {!isFinished && (
        <div className={styles.optionsColumn}>
          <div className={styles.columnHeader}>
            <h2 className={styles.columnTitle}>
              {activeStep === 1 && 'Como quer montar o projeto?'}
              {activeStep === 2 && (mode === 'investimento' ? 'Qual o valor de investimento?' : 'Escolha a categoria')}
              {activeStep === 3 && (mode === 'investimento' ? 'Escolha a categoria' : 'Escolha o kit')}
              {activeStep === 4 && (mode === 'investimento' ? 'Escolha o Kit Base' : 'Quantos kits?')}
            </h2>
          </div>
          <div className={styles.columnContent}>
            {activeStep === 1 && (
              <>
                <button className={`${styles.optionCard} ${mode === 'investimento' ? styles.optionCardActive : ''}`} onClick={() => { setMode('investimento'); setActiveStep(2); }}>
                  <div className={styles.kitInfoMain}>
                    <div className={styles.optionTitle}>Por Investimento</div>
                    <div className={styles.optionDesc}>Sugerimos os kits com base no valor.</div>
                  </div>
                </button>
                <button className={`${styles.optionCard} ${mode === 'estrutura' ? styles.optionCardActive : ''}`} onClick={() => { setMode('estrutura'); setActiveStep(2); }}>
                  <div className={styles.kitInfoMain}>
                    <div className={styles.optionTitle}>Por Estrutura</div>
                    <div className={styles.optionDesc}>Você define a quantidade de kits.</div>
                  </div>
                </button>
              </>
            )}
            {activeStep === 2 && (
              mode === 'investimento' ? (
                <div className={styles.inputGroup}>
                  <input type="number" className={styles.mainInput} value={budget} onChange={(e) => setBudget(Number(e.target.value))} autoFocus />
                  <div className={styles.presetsGrid}>
                    {INVESTMENT_VALUES.map((val) => (
                      <button key={val} type="button" className={`${styles.presetBadge} ${budget === val ? styles.presetBadgeActive : ''}`} onClick={() => { setBudget(val); setActiveStep(3); }}>
                        {formatCurrency(val)}
                      </button>
                    ))}
                  </div>
                  <button className={styles.btnAction} style={{ marginTop: '1.5rem' }} onClick={() => setActiveStep(3)}>Continuar</button>
                </div>
              ) : (
                FIXED_CATEGORIES.map(cat => (
                  <button key={cat} className={`${styles.optionCard} ${selectedCategory === cat ? styles.optionCardActive : ''}`} onClick={() => { setSelectedCategory(cat); setActiveStep(3); }}>
                    <div className={styles.kitInfoMain}>
                      <div className={styles.optionTitle}>{cat}</div>
                    </div>
                  </button>
                ))
              )
            )}
            {activeStep === 3 && (
              mode === 'investimento' ? (
                FIXED_CATEGORIES.map(cat => (
                  <button key={cat} className={`${styles.optionCard} ${selectedCategory === cat ? styles.optionCardActive : ''}`} onClick={() => { setSelectedCategory(cat); setActiveStep(4); }}>
                    <div className={styles.kitInfoMain}>
                      <div className={styles.optionTitle}>{cat}</div>
                    </div>
                  </button>
                ))
              ) : (
                selectedCategory && LEVELS.map(lvl => {
                  const opt = kitsByCategory[selectedCategory][lvl];
                  if (!opt) return null;
                  return (
                    <button 
                      key={lvl} 
                      className={`${styles.optionCard} ${selectedLevel === lvl ? styles.optionCardActive : ''}`} 
                      onClick={() => { setSelectedLevel(lvl); setActiveStep(4); }}
                    >
                      <div className={styles.kitInfoMain}>
                        <div className={styles.optionTitle}>{opt.kit.nome}</div>
                        <div className={styles.kitPriceRow}>
                          <span className={styles.kitPriceValue}>{formatCurrency(opt.total)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )
            )}
            {activeStep === 4 && (
              mode === 'investimento' ? (
                selectedCategory && LEVELS.map(lvl => {
                  const opt = kitsByCategory[selectedCategory][lvl];
                  if (!opt) return null;
                  return (
                    <button 
                      key={lvl} 
                      className={`${styles.optionCard} ${selectedLevel === lvl ? styles.optionCardActive : ''}`} 
                      onClick={() => { setSelectedLevel(lvl); setIsFinished(true); }}
                    >
                      <div className={styles.optionContent}>
                        <div className={styles.optionHeaderRow}>
                          <div className={styles.optionTitle}>{opt.kit.nome}</div>
                          <div className={styles.kitPriceValue}>{formatCurrency(opt.total)}</div>
                        </div>
                        
                        {/* Preview da Composição */}
                        {(() => {
                          const primaryUnits = Math.floor(budget / opt.total);
                          let remaining = budget - (primaryUnits * opt.total);
                          const extras: Array<{ name: string; qty: number }> = [];
                          const allOptions = LEVELS.map(l => kitsByCategory[selectedCategory!][l]).filter((o): o is KitOption => Boolean(o)).sort((a, b) => b.total - a.total);
                          
                          let guard = 0;
                          while (remaining > 0 && guard < 20) {
                            const next = allOptions.find(o => o.total <= remaining);
                            if (!next) break;
                            const existing = extras.find(e => e.name === next.kit.nome);
                            if (existing) existing.qty++; else extras.push({ name: next.kit.nome, qty: 1 });
                            remaining -= next.total;
                            guard++;
                          }

                          return (
                            <div className={`${styles.previewComposition} ${extras.length > 0 ? styles.hasExtras : ''}`}>
                              {primaryUnits}x {opt.kit.nome}
                              {extras.map(e => (
                                <span key={e.name}> + {e.qty}x {e.name}</span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className={styles.inputGroup}>
                  <input 
                    type="number" 
                    min={1} 
                    className={styles.mainInput} 
                    value={units} 
                    onChange={(e) => {
                      setUnits(Number(e.target.value));
                      // Bug Fix: Reset manual customizations when units change
                      setCustomQuantities({});
                      setIsEditing(false);
                    }} 
                    autoFocus 
                  />
                  <button className={styles.btnAction} style={{ marginTop: '1.5rem' }} onClick={() => setIsFinished(true)}>Finalizar Projeto</button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* COLUNA 3: RESULTADO OU DETALHES DO KIT */}
      <div className={styles.resultColumn} style={{ '--pointer-top': `${pointerTop}px` } as any}>
        {kitEmDetalhe ? (
          <>
            <div className={styles.columnHeader}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className={styles.columnTitle}>Conteúdo do {kitEmDetalhe.nome}</h2>
                <button className={styles.btnCloseDetail} onClick={() => setKitEmDetalhe(null)}>
                  Voltar ao Resultado ×
                </button>
              </div>
            </div>
            <div className={styles.columnContent}>
              <p className={styles.kitDesc} style={{ marginBottom: '1.5rem' }}>{kitEmDetalhe.descricao}</p>
              <ul className={styles.resultList}>
                {kitEmDetalhe.itens.map(item => {
                  const p = produtos.find(x => x.id === item.produtoId);
                  return (
                    <li key={item.produtoId} className={styles.resultItem}>
                      <img src={p?.fotoUrl} alt={item.nomeProduto} className={styles.resultThumb} />
                      <div className={styles.resultInfo}>
                        <div className={styles.resultName}>{item.nomeProduto}</div>
                        <div className={styles.resultQty}>{item.quantidade} unidade(s)</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : (
          <>
            <div className={styles.columnHeader}>
              <h2 className={styles.columnTitle}>Resultado do Projeto</h2>
            </div>
            <div className={styles.columnContent}>
              {consolidatedItems.length > 0 ? (
                <>
                  {/* COMPOSIÇÃO DOS KITS */}
                  <div className={styles.compositionGrid}>
                    {mode === 'investimento' && investmentPlan ? (
                      <>
                        <div className={styles.compositionCard}>
                          <div className={styles.compositionTitle}>Kit Principal</div>
                          <div className={styles.compositionValue}>{investmentPlan.primaryUnits}x {investmentPlan.baseOption.kit.nome}</div>
                        </div>
                        {investmentPlan.extras.map(extra => (
                          <div key={extra.option.kit.id} className={styles.compositionCard} style={{ background: '#ecfdf5', borderColor: '#10b981' }}>
                            <div className={styles.compositionTitle} style={{ color: '#10b981' }}>Kit Extra (Aproveitamento)</div>
                            <div className={styles.compositionValue}>{extra.qty}x {extra.option.kit.nome}</div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className={styles.compositionCard}>
                        <div className={styles.compositionTitle}>Estrutura Solicitada</div>
                        <div className={styles.compositionValue}>{units}x {activeOption?.kit.nome}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-gray-400)', textTransform: 'uppercase', marginBottom: '1rem', paddingLeft: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Detalhamento Consolidado de Produtos</span>
                    {isEditing && <span style={{ color: 'var(--color-primary)' }}>Modo de Edição Ativo</span>}
                  </div>

                  <ul className={styles.resultList}>
                    {currentItems.map(item => {
                      const p = produtos.find(x => x.id === item.produtoId);
                      return (
                        <li key={item.produtoId} className={styles.resultItem}>
                          <img src={p?.fotoUrl} alt={item.nomeProduto} className={styles.resultThumb} />
                          <div className={styles.resultInfo}>
                            <div className={styles.resultName}>{item.nomeProduto}</div>
                            {isEditing ? (
                              <div className={styles.qtyEditor}>
                                <button className={styles.qtyBtn} onClick={() => handleUpdateQty(item.produtoId, -1)}>−</button>
                                <input 
                                  type="number" 
                                  className={styles.qtyInput} 
                                  value={item.quantidade}
                                  onChange={(e) => handleUpdateQty(item.produtoId, parseInt(e.target.value) - item.quantidade)}
                                />
                                <button className={styles.qtyBtn} onClick={() => handleUpdateQty(item.produtoId, 1)}>+</button>
                              </div>
                            ) : (
                              <div className={styles.resultQty}>{item.quantidade} unidades</div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className={styles.emptyState}>Complete as etapas para visualizar o plano detalhado.</div>
              )}
            </div>
            {consolidatedItems.length > 0 && (
              <div className={styles.resultFooter}>
                <span className={styles.totalLabel}>Investimento Total do Projeto</span>
                <span className={styles.totalValue}>
                  {formatCurrency(projectTotal)}
                </span>
                
                {requestStatus && <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center', background: requestStatus.type === 'success' ? '#d1fae5' : '#fee2e2', color: requestStatus.type === 'success' ? '#065f46' : '#991b1b' }}>{requestStatus.message}</div>}
                
                <div className={styles.footerActions}>
                  <button 
                    className={styles.btnSecondary} 
                    onClick={() => {
                      if (isEditing) setIsEditing(false);
                      else {
                        // Ao entrar no modo edição, garantimos que os customQuantities estão sincronizados
                        const initial: Record<string, number> = {};
                        consolidatedItems.forEach(i => initial[i.produtoId] = customQuantities[i.produtoId] ?? i.quantidade);
                        setCustomQuantities(initial);
                        setIsEditing(true);
                      }
                    }}
                  >
                    {isEditing ? 'Concluir Edição' : 'Personalizar Projeto'}
                  </button>
                  <button className={styles.btnAction} onClick={handleRequestQuote} disabled={requesting || isEditing}>
                    {requesting ? 'Processando...' : 'Solicitar Orçamento'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL DE SOLICITAÇÃO */}
      {showQuoteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Informações da Cotação</h3>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formField}>
                <label className={styles.modalLabel}>Nome do Órgão *</label>
                <input 
                  type="text" 
                  className={styles.modalInput} 
                  value={quoteOrgao} 
                  onChange={(e) => setQuoteOrgao(e.target.value)}
                  placeholder="Ex: Prefeitura de São Paulo"
                  required
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.modalLabel}>Nome do Responsável *</label>
                <input 
                  type="text" 
                  className={styles.modalInput} 
                  value={quoteResponsavel} 
                  onChange={(e) => setQuoteResponsavel(e.target.value)}
                  placeholder="Ex: João Silva"
                  required
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.modalLabel}>CNPJ *</label>
                <input 
                  type="text" 
                  className={styles.modalInput} 
                  value={quoteCnpj} 
                  onChange={(e) => setQuoteCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  required
                />
              </div>

              {requestStatus?.type === 'error' && (
                <div style={{ color: '#ef4444', fontSize: '0.875rem', fontWeight: 600 }}>
                  {requestStatus.message}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.btnSecondary} 
                onClick={() => {
                  setShowQuoteModal(false);
                  setRequestStatus(null);
                }}
                disabled={requesting}
              >
                Cancelar
              </button>
              <button 
                className={styles.btnAction} 
                onClick={handleRequestQuote}
                disabled={requesting}
              >
                {requesting ? 'Processando...' : 'Confirmar Solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjetosPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <ProjetosPageContent />
    </Suspense>
  );
}
