'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './documentos.module.css';

interface DocumentoItem {
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

function getCloudinaryCloudNameFromUrl(url: string): string | null {
  const match = url.match(/res\.cloudinary\.com\/([^/]+)/i);
  return match?.[1] ?? null;
}

function getDocumentoPreviewUrl(item: DocumentoItem): string | null {
  if (!item.cloudinaryPublicId) {
    return item.contentType.startsWith('image/') ? item.arquivoUrl : null;
  }

  const cloudName = getCloudinaryCloudNameFromUrl(item.arquivoUrl);
  if (!cloudName) {
    return item.contentType.startsWith('image/') ? item.arquivoUrl : null;
  }

  if (item.contentType === 'application/pdf') {
    return `https://res.cloudinary.com/${cloudName}/image/upload/pg_1,f_auto,q_auto,w_900/${item.cloudinaryPublicId}.jpg`;
  }

  if (item.contentType.startsWith('image/')) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_900/${item.cloudinaryPublicId}`;
  }

  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeCode = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    if (maybeCode.includes('permission-denied')) {
      return 'Permissao negada no Firestore para a colecao documentos. Atualize as regras e publique novamente.';
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

export default function DocumentosPage() {
  const { user, isAdmin } = useAuth();
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [itens, setItens] = useState<DocumentoItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadToCloudinary(file: File, idToken: string) {
    const body = new FormData();
    body.append('file', file);
    body.append('folder', 'representantes/documentos');

    const response = await fetch('/api/uploads/cloudinary', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? 'Falha no upload do arquivo.');
    }

    return data as {
      url: string;
      publicId: string;
      bytes: number;
      resourceType: string;
    };
  }

  useEffect(() => {
    const q = query(collection(db, 'documentos'), orderBy('criadoEm', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItens(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as DocumentoItem[]);
        setLoadingList(false);
      },
      () => {
        setLoadingList(false);
        setMessage('Nao foi possivel carregar os documentos agora.');
      }
    );

    return unsubscribe;
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setArquivo(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!isAdmin) return;

    if (!nome.trim() || !arquivo || !user) {
      setSubmitState('error');
      setMessage('Informe o nome do documento e selecione um arquivo.');
      return;
    }

    setSubmitState('loading');

    try {
      const idToken = await user.getIdToken();
      const upload = await uploadToCloudinary(arquivo, idToken);

      await addDoc(collection(db, 'documentos'), {
        nome: nome.trim(),
        arquivoNome: arquivo.name,
        arquivoUrl: upload.url,
        storagePath: upload.publicId,
        cloudinaryPublicId: upload.publicId,
        resourceType: upload.resourceType,
        contentType: arquivo.type || 'application/octet-stream',
        tamanhoBytes: upload.bytes,
        criadoPorUid: user.uid,
        criadoPorEmail: user.email,
        criadoEm: serverTimestamp(),
      });

      setSubmitState('success');
      setMessage('Documento cadastrado com sucesso.');
      setNome('');
      setArquivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setSubmitState('error');
      setMessage(getErrorMessage(error, 'Nao foi possivel enviar o documento.'));
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.topCard}>
        <div>
          <h2 className={styles.sectionTitle}>Documentos</h2>
          <p className={styles.sectionText}>Documentos comerciais e institucionais ficam disponiveis para consulta e download.</p>
        </div>

        {isAdmin ? (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="nomeDocumento" className={styles.label}>Nome do documento</label>
              <input
                id="nomeDocumento"
                className={styles.input}
                type="text"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Apresentacao Institucional"
                maxLength={120}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="arquivoDocumento" className={styles.label}>Arquivo</label>
              <input
                id="arquivoDocumento"
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                onChange={handleFileChange}
              />
            </div>

            <button className={styles.submitButton} type="submit" disabled={submitState === 'loading'}>
              {submitState === 'loading' ? 'Enviando...' : 'Cadastrar documento'}
            </button>
          </form>
        ) : null}

        {message && (
          <div className={`${styles.message} ${submitState === 'error' ? styles.messageError : styles.messageSuccess}`} role="status">
            {message}
          </div>
        )}
      </section>

      {loadingList ? (
        <div className={styles.state}>Carregando documentos...</div>
      ) : itens.length === 0 ? (
        <div className={styles.state}>Nenhum documento cadastrado ainda.</div>
      ) : (
        <section className={styles.grid} aria-label="Lista de documentos">
          {itens.map((item) => {
            const criadoEm = item.criadoEm?.toDate?.();
            const previewUrl = getDocumentoPreviewUrl(item);
            return (
              <article key={item.id} className={styles.card}>
                <div className={styles.previewWrap}>
                  {previewUrl ? (
                    <img
                      className={styles.previewImage}
                      src={previewUrl}
                      alt={`Previa do documento ${item.nome}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.previewFallback} aria-label="Arquivo de documento">
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Documento pronto para download</span>
                    </div>
                  )}
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{item.nome}</h3>
                  <p className={styles.cardMeta}>{item.arquivoNome} · {formatSize(item.tamanhoBytes)}</p>
                  <p className={styles.cardMeta}>Publicado em {formatDate(criadoEm)}</p>

                  <a className={styles.downloadButton} href={item.arquivoUrl} download={item.arquivoNome} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
