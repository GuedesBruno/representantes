'use client';

import { FormEvent, useEffect, useState, MouseEvent } from 'react';
import Link from 'next/link';
import { addDoc, collection, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './atas.module.css';

interface Pasta {
  id: string;
  nome: string;
  validade: string;
  criadoPorEmail?: string;
  criadoEm?: { toDate(): Date };
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function formatDate(dateStr?: string) {
  if (!dateStr) return 'Sem validade';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export default function AtasAbertasPage() {
  const { user, isAdmin } = useAuth();
  
  // Form states
  const [nomePasta, setNomePasta] = useState('');
  const [validade, setValidade] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'atas_pastas'),
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Pasta[];
        
        docs.sort((a, b) => {
          const timeA = a.criadoEm?.toDate?.().getTime() ?? 0;
          const timeB = b.criadoEm?.toDate?.().getTime() ?? 0;
          return timeB - timeA;
        });

        setPastas(docs);
        setLoadingList(false);
      },
      () => {
        setLoadingList(false);
        setMessage('Não foi possível carregar as pastas no momento.');
      }
    );

    return unsubscribe;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!isAdmin) return;

    if (!nomePasta.trim() || !validade || !user) {
      setSubmitState('error');
      setMessage('Informe o nome e a validade da pasta.');
      return;
    }

    setSubmitState('loading');

    try {
      if (editingId) {
        await updateDoc(doc(db, 'atas_pastas', editingId), {
          nome: nomePasta.trim(),
          validade,
        });
        setMessage('Pasta atualizada com sucesso.');
      } else {
        await addDoc(collection(db, 'atas_pastas'), {
          nome: nomePasta.trim(),
          validade,
          criadoPorUid: user.uid,
          criadoPorEmail: user.email,
          criadoEm: serverTimestamp(),
        });
        setMessage('Pasta criada com sucesso.');
      }

      setSubmitState('success');
      resetForm();
    } catch {
      setSubmitState('error');
      setMessage(`Não foi possível ${editingId ? 'atualizar' : 'criar'} a pasta.`);
    }
  };

  const handleEdit = (e: MouseEvent, pasta: Pasta) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(pasta.id);
    setNomePasta(pasta.nome);
    setValidade(pasta.validade || '');
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('Tem certeza que deseja excluir esta pasta e todos os seus documentos?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'atas_pastas', id));
      setMessage('Pasta excluída com sucesso.');
      setSubmitState('success');
    } catch {
      setMessage('Erro ao excluir pasta.');
      setSubmitState('error');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setNomePasta('');
    setValidade('');
    setSubmitState('idle');
  };

  return (
    <div className={styles.page}>
      {(isAdmin || message) && (
        <section className={styles.topCard}>
          {isAdmin && (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="nomePasta" className={styles.label}>Nome da pasta</label>
                <input
                  id="nomePasta"
                  className={styles.input}
                  type="text"
                  value={nomePasta}
                  onChange={(e) => setNomePasta(e.target.value)}
                  placeholder="Ex.: Reunião Anual 2026"
                  maxLength={120}
                  disabled={submitState === 'loading'}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="validade" className={styles.label}>Validade</label>
                <input
                  id="validade"
                  className={styles.input}
                  type="date"
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                  disabled={submitState === 'loading'}
                />
              </div>

              <div className={styles.formActions}>
                <button className={styles.submitButton} type="submit" disabled={submitState === 'loading'}>
                  {submitState === 'loading' ? 'Processando...' : editingId ? 'Atualizar' : 'Criar Pasta'}
                </button>
                {editingId && (
                  <button type="button" className={styles.cancelButton} onClick={resetForm} disabled={submitState === 'loading'}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          )}

          {message && (
            <div
              className={`${styles.message} ${submitState === 'error' ? styles.messageError : styles.messageSuccess}`}
              role="status"
            >
              {message}
            </div>
          )}
        </section>
      )}

      {loadingList ? (
        <div className={styles.state}>Carregando pastas...</div>
      ) : pastas.length === 0 ? (
        <div className={styles.state}>Nenhuma pasta cadastrada ainda.</div>
      ) : (
        <section className={styles.grid} aria-label="Lista de pastas">
          {pastas.map((pasta) => (
            <Link key={pasta.id} href={`/dashboard/atas-abertas/${pasta.id}`} className={styles.folderCard}>
              <h3 className={styles.folderTitle}>{pasta.nome}</h3>
              
              <div className={styles.folderIcon} aria-hidden="true">
                <svg width="110" height="110" viewBox="0 0 24 24" fill="none">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div className={styles.folderMeta}>
                Validade: {formatDate(pasta.validade)}
              </div>

              {isAdmin && (
                <div className={styles.cardActions}>
                  <button 
                    className={`${styles.actionButton} ${styles.editButton}`} 
                    onClick={(e) => handleEdit(e, pasta)}
                    title="Editar pasta"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button 
                    className={`${styles.actionButton} ${styles.deleteButton}`} 
                    onClick={(e) => handleDelete(e, pasta.id)}
                    title="Excluir pasta"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              )}
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
