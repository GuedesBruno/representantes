'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './tabela-precos.module.css';

interface TabelaPrecoItem {
  id: string;
  nome: string;
  arquivoNome: string;
  arquivoUrl: string;
  storagePath: string;
  cloudinaryPublicId?: string;
  resourceType?: string;
  contentType: string;
  tamanhoBytes: number;
  criadoPorEmail?: string;
  criadoEm?: { toDate(): Date };
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeCode = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (maybeCode.includes('permission-denied')) {
      return 'Permissao negada no Firestore para a colecao tabelas_preco. Atualize as regras e publique novamente.';
    }
  }

  return fallback;
}

function formatDate(date?: Date) {
  if (!date) return 'Agora';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatSize(bytes: number) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

import TabelaPrecosVisual from './TabelaPrecosVisual';

export default function TabelaPrecosPage() {
  const { isAdmin } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string|null>(null);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setUploading(true);
    const input = (e.target as HTMLFormElement).elements.namedItem('file') as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      setMessage('Selecione um arquivo XLSX.');
      setUploading(false);
      return;
    }
    try {
      // Envia para API que converte e salva em /public
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/tabela-precos-upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Falha ao enviar arquivo.');
      setMessage('Tabela atualizada com sucesso!');
    } catch (err) {
      setMessage('Erro ao enviar arquivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      {isAdmin && (
        <section className={styles.topCard} style={{marginBottom: 32}}>
          <form className={styles.form} onSubmit={handleUpload}>
            <div className={styles.field}>
              <label htmlFor="arquivoTabelaPreco" className={styles.label}>Arquivo</label>
              <input
                id="arquivoTabelaPreco"
                className={styles.fileInput}
                type="file"
                name="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
              />
            </div>
            <button className={styles.submitButton} type="submit" disabled={uploading} style={{marginTop: 0}}>
              {uploading ? 'Enviando...' : 'Cadastrar tabela'}
            </button>
            {message && <span style={{marginLeft: 16}}>{message}</span>}
          </form>
        </section>
      )}
      <TabelaPrecosVisual />
    </div>
  );
}
