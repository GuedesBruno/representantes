import { useEffect, useState, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, writeBatch, addDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './visual-table.module.css';

interface ItemTabelaPreco {
  id: string;
  produto: string;
  fabricante: string;
  valor: number;
  categoria: string;
  ordemExibicao?: number;
  criadoEm?: { toDate(): Date };
  atualizadoEm?: { toDate(): Date };
}

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  isAdmin?: boolean;
}

interface SortableCategoryProps {
  id: string;
  categoria: string;
  children: React.ReactNode;
  onEdit?: () => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (val: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
}

function SortableCategory({ id, categoria, children, onEdit, isEditing, editValue, onEditChange, onEditSave, onEditCancel }: SortableCategoryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.categoriaSection}>
      <div className={styles.categoriaHeader}>
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 9l7 7 7-7"/></svg>
        </div>
        
        {isEditing ? (
          <input
            className={styles.categoriaInput}
            value={editValue}
            onChange={(e) => onEditChange?.(e.target.value)}
            onBlur={onEditSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave?.();
              if (e.key === 'Escape') onEditCancel?.();
            }}
            autoFocus
          />
        ) : (
          <h3 className={styles.categoriaTitle} onClick={onEdit}>
            {categoria}
          </h3>
        )}
      </div>
      {children}
    </div>
  );
}

function SortableRow({ id, children, isAdmin }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr ref={setNodeRef} style={style}>
      {isAdmin && (
        <td className={styles.dragCell} {...attributes} {...listeners}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9h8M8 15h8"/></svg>
        </td>
      )}
      {children}
    </tr>
  );
}

export default function TabelaPrecosVisual() {
  const { isAdmin } = useAuth();
  const [itens, setItens] = useState<ItemTabelaPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const editingRef = useRef<{ itemId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'itens_tabela_preco'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ItemTabelaPreco));
        docs.sort((a, b) => {
          const ordemA = Number.isFinite(a.ordemExibicao) ? Number(a.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          const ordemB = Number.isFinite(b.ordemExibicao) ? Number(b.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          if (ordemA !== ordemB) return ordemA - ordemB;
          return (a.produto || '').localeCompare(b.produto || '', 'pt-BR');
        });
        setItens(docs);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const groupedItens = itens.reduce((acc, item) => {
    const categoria = item.categoria || 'Sem Categoria';
    if (!acc[categoria]) acc[categoria] = [];
    acc[categoria].push(item);
    return acc;
  }, {} as Record<string, ItemTabelaPreco[]>);

  const categoriaOrder = Object.keys(groupedItens).sort((catA, catB) => {
    const minA = Math.min(...groupedItens[catA].map(i => typeof i.ordemExibicao === 'number' ? i.ordemExibicao : Number.MAX_SAFE_INTEGER));
    const minB = Math.min(...groupedItens[catB].map(i => typeof i.ordemExibicao === 'number' ? i.ordemExibicao : Number.MAX_SAFE_INTEGER));
    
    if (minA !== minB) return minA - minB;
    return catA.localeCompare(catB, 'pt-BR');
  });

  function formatCurrency(value: number) {
    if (isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  function handleEditStart(itemId: string, field: string, currentValue: string | number) {
    if (!isAdmin) return;
    const cell = { itemId, field };
    editingRef.current = cell;
    setEditingCell(cell);
    setEditValue(String(currentValue));
  }

  async function handleEditSave() {
    if (!editingRef.current) return;
    const { itemId, field } = editingRef.current;
    editingRef.current = null;

    let value: string | number = editValue.trim();

    if (field === 'valor') {
      const parsed = parseFloat(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (isNaN(parsed)) {
        setEditingCell(null);
        setEditValue('');
        return;
      }
      value = parsed;
    }

    // Se o campo for 'categoria', precisamos atualizar todos os itens dessa categoria antiga?
    // Não, aqui estamos editando a categoria DE UM ITEM específico. 
    // Mas para editar o "Título" da categoria, precisamos de uma lógica diferente.
    if (field === 'categoria_title') {
      const oldCatName = itemId; // Passamos o nome da categoria como ID
      const newCatName = value as string;
      if (oldCatName === newCatName || !newCatName) {
        setEditingCell(null);
        return;
      }

      const batch = writeBatch(db);
      itens.filter(i => i.categoria === oldCatName).forEach(item => {
        batch.update(doc(db, 'itens_tabela_preco', item.id), {
          categoria: newCatName,
          atualizadoEm: serverTimestamp()
        });
      });
      await batch.commit();
    } else {
      await updateDoc(doc(db, 'itens_tabela_preco', itemId), {
        [field]: value,
        atualizadoEm: serverTimestamp(),
      });
    }

    setEditingCell(null);
    setEditValue('');
  }

  function handleEditCancel() {
    editingRef.current = null;
    setEditingCell(null);
    setEditValue('');
  }

  async function handleAddItem(categoria: string) {
    if (!isAdmin) return;
    const catIndex = categoriaOrder.indexOf(categoria);
    const lastItem = groupedItens[categoria]?.[groupedItens[categoria].length - 1];
    const newOrder = (catIndex * 1000) + (lastItem ? (lastItem.ordemExibicao || 0) % 1000 + 1 : 0);

    await addDoc(collection(db, 'itens_tabela_preco'), {
      produto: 'Novo Produto',
      fabricante: 'Fabricante',
      valor: 0,
      categoria: categoria,
      ordemExibicao: newOrder,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
  }

  async function handleAddCategory() {
    if (!isAdmin) return;
    const newCatName = 'Nova Categoria';
    const nextOrder = categoriaOrder.length * 1000;

    await addDoc(collection(db, 'itens_tabela_preco'), {
      produto: 'Primeiro Produto',
      fabricante: 'Fabricante',
      valor: 0,
      categoria: newCatName,
      ordemExibicao: nextOrder,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
  }

  async function handleDeleteItem(itemId: string) {
    if (!isAdmin || !confirm('Deseja realmente excluir este item?')) return;
    await deleteDoc(doc(db, 'itens_tabela_preco', itemId));
  }

  const customCollisionDetection: CollisionDetection = (args) => {
    const activeId = args.active.id as string;
    const isCategoria = categoriaOrder.includes(activeId);

    const filteredContainers = args.droppableContainers.filter(container => {
      const isContainerCategoria = categoriaOrder.includes(container.id as string);
      return isCategoria ? isContainerCategoria : !isContainerCategoria;
    });

    return closestCenter({
      ...args,
      droppableContainers: filteredContainers,
    });
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCategoria = categoriaOrder.find(cat => cat === activeId);
    const overCategoria = categoriaOrder.find(cat => cat === overId);

    if (activeCategoria && overCategoria) {
      const oldIndex = categoriaOrder.indexOf(activeCategoria);
      const newIndex = categoriaOrder.indexOf(overCategoria);
      const newOrder = arrayMove(categoriaOrder, oldIndex, newIndex);

      const executeBatch = async () => {
        let batch = writeBatch(db);
        let count = 0;
        for (let i = 0; i < newOrder.length; i++) {
          const cat = newOrder[i];
          const itensToUpdate = groupedItens[cat];
          if (!itensToUpdate) continue;
          for (let j = 0; j < itensToUpdate.length; j++) {
            const item = itensToUpdate[j];
            const newOrdem = i * 1000 + (item.ordemExibicao || 0) % 1000;
            if (item.ordemExibicao !== newOrdem) {
              batch.update(doc(db, 'itens_tabela_preco', item.id), {
                ordemExibicao: newOrdem,
                atualizadoEm: serverTimestamp(),
              });
              count++;
              if (count === 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
              }
            }
          }
        }
        if (count > 0) await batch.commit();
      };
      executeBatch().catch(console.error);
    } else {
      const activeItem = itens.find(p => p.id === activeId);
      const overItem = itens.find(p => p.id === overId);
      if (!activeItem || !overItem) return;
      if (activeItem.categoria !== overItem.categoria) return;

      const categoria = activeItem.categoria || 'Sem Categoria';
      const itensCategoria = groupedItens[categoria];
      const oldIndex = itensCategoria.findIndex(p => p.id === activeId);
      const newIndex = itensCategoria.findIndex(p => p.id === overId);

      const newItens = arrayMove(itensCategoria, oldIndex, newIndex);

      const executeBatch = async () => {
        let batch = writeBatch(db);
        let count = 0;
        const catIndex = categoriaOrder.indexOf(categoria);
        for (let i = 0; i < newItens.length; i++) {
          const item = newItens[i];
          const newOrdem = (catIndex * 1000) + i;
          if (item.ordemExibicao !== newOrdem) {
            batch.update(doc(db, 'itens_tabela_preco', item.id), {
              ordemExibicao: newOrdem,
              atualizadoEm: serverTimestamp(),
            });
            count++;
            if (count === 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
        }
        if (count > 0) await batch.commit();
      };
      executeBatch().catch(console.error);
    }
  }

  if (loading) return <div className={styles.loading}>Carregando tabela...</div>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.visualTableWrap}>
        <SortableContext items={categoriaOrder} strategy={verticalListSortingStrategy}>
        {categoriaOrder.map((categoria) => (
            <SortableCategory 
              key={categoria} 
              id={categoria} 
              categoria={categoria}
              isEditing={editingCell?.itemId === categoria && editingCell.field === 'categoria_title'}
              editValue={editValue}
              onEdit={() => handleEditStart(categoria, 'categoria_title', categoria)}
              onEditChange={setEditValue}
              onEditSave={handleEditSave}
              onEditCancel={handleEditCancel}
            >
            <SortableContext items={groupedItens[categoria].map(p => p.id)} strategy={verticalListSortingStrategy}>
              <table className={styles.visualTable}>
                <thead>
                  <tr>
                    {isAdmin && <th style={{width: 40}}></th>}
                    <th>Produto</th>
                    <th>Fabricante</th>
                    <th>Valor</th>
                    {isAdmin && <th style={{width: 60}}></th>}
                  </tr>
                </thead>
                <tbody>
                  {groupedItens[categoria].map((item) => (
                    <SortableRow key={item.id} id={item.id} isAdmin={isAdmin}>
                        <td
                          onClick={() => handleEditStart(item.id, 'produto', item.produto)}
                          style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                        >
                          {editingCell?.itemId === item.id && editingCell.field === 'produto' ? (
                            <input
                              className={styles.cellInput}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleEditSave}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave();
                                if (e.key === 'Escape') handleEditCancel();
                              }}
                              autoFocus
                            />
                          ) : (
                            item.produto
                          )}
                        </td>
                        <td
                          onClick={() => handleEditStart(item.id, 'fabricante', item.fabricante || '')}
                          style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                        >
                          {editingCell?.itemId === item.id && editingCell.field === 'fabricante' ? (
                            <input
                              className={styles.cellInput}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleEditSave}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave();
                                if (e.key === 'Escape') handleEditCancel();
                              }}
                              autoFocus
                            />
                          ) : (
                            item.fabricante || '—'
                          )}
                        </td>
                        <td
                          onClick={() => handleEditStart(item.id, 'valor', item.valor)}
                          style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                        >
                          {editingCell?.itemId === item.id && editingCell.field === 'valor' ? (
                            <input
                              className={styles.cellInput}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleEditSave}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave();
                                if (e.key === 'Escape') handleEditCancel();
                              }}
                              autoFocus
                            />
                          ) : (
                            formatCurrency(item.valor)
                          )}
                        </td>
                        {isAdmin && (
                          <td className={styles.actionCell}>
                            <button className={styles.deleteBtn} onClick={() => handleDeleteItem(item.id)} title="Excluir item">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                          </td>
                        )}
                    </SortableRow>
                  ))}
                </tbody>
              </table>
              {isAdmin && (
                <button className={styles.addItemBtn} onClick={() => handleAddItem(categoria)}>
                  + Adicionar Item em {categoria}
                </button>
              )}
            </SortableContext>
            </SortableCategory>
        ))}
        </SortableContext>

        {isAdmin && (
          <button className={styles.addCategoryBtn} onClick={handleAddCategory}>
            + Adicionar Nova Categoria
          </button>
        )}
      </div>
    </DndContext>
  );
}
