'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, writeBatch, doc, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import * as XLSX from 'xlsx';
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
      setMessage('Selecione um arquivo CSV ou XLSX.');
      setUploading(false);
      return;
    }
    
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = ev.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            setMessage('Arquivo sem aba válida.');
            setUploading(false);
            return;
          }

          const worksheet = workbook.Sheets[firstSheetName];
          // Extrai todas as linhas pulando a primeira (cabeçalho)
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[][];

          if (rawRows.length < 2) {
            setMessage('Arquivo vazio ou sem dados além do cabeçalho.');
            setUploading(false);
            return;
          }

          // 1. Apagar itens da tabela antiga para não acumular duplicatas
          const oldDocs = await getDocs(collection(db, 'itens_tabela_preco'));
          let delBatch = writeBatch(db);
          let delCount = 0;
          for (const oldDoc of oldDocs.docs) {
             delBatch.delete(oldDoc.ref);
             delCount++;
             if (delCount === 400) {
               await delBatch.commit();
               delBatch = writeBatch(db);
               delCount = 0;
             }
          }
          if (delCount > 0) await delBatch.commit();

          // 2. Inserir os novos itens do arquivo
          let batch = writeBatch(db);
          let count = 0;
          let totalImported = 0;

          for (let i = 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (row.every(c => !String(c).trim())) continue;
            
            const produto = String(row[0] || '').trim();
            const fabricante = String(row[1] || '').trim();
            const valorRaw = String(row[2] || '').trim();
            const categoria = String(row[3] || '').trim();
            
            if (!produto) continue;
            
            let valor = parseFloat(valorRaw.replace(/[^\d,.-]/g, '').replace(',', '.'));
            if (isNaN(valor)) valor = 0;

            const docRef = doc(collection(db, 'itens_tabela_preco'));
            batch.set(docRef, {
              produto,
              fabricante,
              valor,
              categoria,
              ordemExibicao: totalImported,
              criadoEm: serverTimestamp(),
              atualizadoEm: serverTimestamp(),
            });

            count++;
            totalImported++;
            if (count === 400) { // O limite de operações do writeBatch no Firebase é de 500 itens
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          
          if (count > 0) await batch.commit();

          setMessage(`Tabela atualizada com sucesso! ${totalImported} itens importados.`);
          if (input) input.value = '';
        } catch (err) {
          console.error(err);
          setMessage('Erro ao processar o arquivo. Verifique se ele não está corrompido.');
        } finally {
          setUploading(false);
        }
      };
      
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setMessage('Erro ao ler o arquivo.');
      setUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      {isAdmin && (
        <section className={styles.topCard} style={{marginBottom: 32}}>
          <form className={styles.form} onSubmit={handleUpload}>
            <div className={styles.field}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <label htmlFor="arquivoTabelaPreco" className={styles.label} style={{ marginBottom: 0 }}>Arquivo</label>
                <a href="/templates/tabela-precos-exemplo.csv" download className={styles.link} style={{ fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb', textDecoration: 'none' }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Baixar planilha de exemplo da Tabela (.csv)
                </a>
              </div>
              <input
                id="arquivoTabelaPreco"
                className={styles.fileInput}
                type="file"
                name="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
