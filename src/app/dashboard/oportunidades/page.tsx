'use client';

import { useState, useId } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { ESTADOS_BR, STATUS_LABELS, TIPOS_SOLUCAO } from '@/lib/constants';
import styles from './oportunidades.module.css';

interface FormData {
  nome: string;
  cliente: string;
  estado: string;
  municipio: string;
  tipoSolucao: string;
  estimativaValor: string;
  status: string;
  descricao: string;
}

const INITIAL: FormData = {
  nome: '',
  cliente: '',
  estado: '',
  municipio: '',
  tipoSolucao: '',
  estimativaValor: '',
  status: 'em_prospeccao',
  descricao: '',
};

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <span id={id} className={styles.fieldError} role="alert">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="16" r="1" fill="currentColor"/>
      </svg>
      {message}
    </span>
  );
}

export default function OportunidadesPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const nomeId = useId();
  const clienteId = useId();
  const estadoId = useId();
  const municipioId = useId();
  const tipoId = useId();
  const valorId = useId();
  const statusId = useId();
  const descId = useId();

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};
    if (!form.nome.trim()) newErrors.nome = 'Nome do projeto é obrigatório.';
    if (!form.cliente.trim()) newErrors.cliente = 'Nome do cliente é obrigatório.';
    if (!form.estado) newErrors.estado = 'Selecione um estado.';
    if (!form.municipio.trim()) newErrors.municipio = 'Município é obrigatório.';
    if (!form.tipoSolucao) newErrors.tipoSolucao = 'Selecione o tipo de solução.';
    if (!form.status) newErrors.status = 'Selecione um status.';

    if (form.estimativaValor && isNaN(Number(form.estimativaValor.replace(/[^\d]/g, '')))) {
      newErrors.estimativaValor = 'Informe um valor numérico válido.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user) return;

    setSubmitState('loading');
    setErrorMsg('');

    try {
      const rawValue = form.estimativaValor.replace(/[^\d,.]/g, '').replace(',', '.');
      const estimativaValor = rawValue ? parseFloat(rawValue) : null;

      await addDoc(collection(db, 'projetos'), {
        nome: form.nome.trim(),
        cliente: form.cliente.trim(),
        estado: form.estado,
        municipio: form.municipio.trim(),
        tipoSolucao: form.tipoSolucao,
        status: form.status,
        descricao: form.descricao.trim(),
        estimativaValor,
        revendedorId: user.uid,
        revendedorEmail: user.email,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });

      setSubmitState('success');
      setForm(INITIAL);
    } catch {
      setErrorMsg('Erro ao salvar oportunidade. Verifique sua conexão e tente novamente.');
      setSubmitState('error');
    }
  };

  const handleNewOpportunity = () => {
    setSubmitState('idle');
    setErrors({});
  };

  if (submitState === 'success') {
    return (
      <div className={styles.successWrapper} role="status" aria-live="polite">
        <div className={styles.successCard}>
          <div className={styles.successIcon} aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#86efac" strokeWidth="1.5" />
              <polyline points="8 12 11 15 16 9" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className={styles.successTitle}>Oportunidade cadastrada!</h2>
          <p className={styles.successText}>
            O projeto foi salvo com sucesso e já aparece na sua lista de projetos.
          </p>
          <div className={styles.successActions}>
            <button type="button" className={styles.primaryButton} onClick={handleNewOpportunity}>
              Cadastrar outra oportunidade
            </button>
            <a href="/dashboard/projetos" className={styles.secondaryButton}>
              Ver meus projetos
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.formCard}>
        <p className={styles.formDescription}>
          Registre um novo projeto ou oportunidade de negócio. Todas as informações podem ser editadas posteriormente.
        </p>

        {submitState === 'error' && errorMsg && (
          <div className={styles.globalError} role="alert" aria-live="assertive">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="currentColor"/>
            </svg>
            {errorMsg}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Identificação do Projeto</legend>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor={nomeId} className={styles.label}>
                  Nome do Projeto <span className={styles.required} aria-hidden="true">*</span>
                </label>
                <input
                  id={nomeId}
                  type="text"
                  className={`${styles.input} ${errors.nome ? styles.inputError : ''}`}
                  value={form.nome}
                  onChange={(e) => updateField('nome', e.target.value)}
                  placeholder="Ex: Implantação CAA – APAE Campinas"
                  aria-required="true"
                  aria-invalid={!!errors.nome}
                  aria-describedby={errors.nome ? `${nomeId}-error` : undefined}
                  disabled={submitState === 'loading'}
                />
                <FieldError id={`${nomeId}-error`} message={errors.nome} />
              </div>

              <div className={styles.field}>
                <label htmlFor={clienteId} className={styles.label}>
                  Cliente / Instituição <span className={styles.required} aria-hidden="true">*</span>
                </label>
                <input
                  id={clienteId}
                  type="text"
                  className={`${styles.input} ${errors.cliente ? styles.inputError : ''}`}
                  value={form.cliente}
                  onChange={(e) => updateField('cliente', e.target.value)}
                  placeholder="Nome do cliente ou instituição"
                  aria-required="true"
                  aria-invalid={!!errors.cliente}
                  aria-describedby={errors.cliente ? `${clienteId}-error` : undefined}
                  disabled={submitState === 'loading'}
                />
                <FieldError id={`${clienteId}-error`} message={errors.cliente} />
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Localização</legend>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor={estadoId} className={styles.label}>
                  Estado <span className={styles.required} aria-hidden="true">*</span>
                </label>
                <select
                  id={estadoId}
                  className={`${styles.select} ${errors.estado ? styles.inputError : ''}`}
                  value={form.estado}
                  onChange={(e) => updateField('estado', e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.estado}
                  aria-describedby={errors.estado ? `${estadoId}-error` : undefined}
                  disabled={submitState === 'loading'}
                >
                  <option value="">Selecione o estado</option>
                  {ESTADOS_BR.map((e) => (
                    <option key={e.sigla} value={e.sigla}>{e.nome} ({e.sigla})</option>
                  ))}
                </select>
                <FieldError id={`${estadoId}-error`} message={errors.estado} />
              </div>

              <div className={styles.field}>
                <label htmlFor={municipioId} className={styles.label}>
                  Município <span className={styles.required} aria-hidden="true">*</span>
                </label>
                <input
                  id={municipioId}
                  type="text"
                  className={`${styles.input} ${errors.municipio ? styles.inputError : ''}`}
                  value={form.municipio}
                  onChange={(e) => updateField('municipio', e.target.value)}
                  placeholder="Nome do município"
                  aria-required="true"
                  aria-invalid={!!errors.municipio}
                  aria-describedby={errors.municipio ? `${municipioId}-error` : undefined}
                  disabled={submitState === 'loading'}
                />
                <FieldError id={`${municipioId}-error`} message={errors.municipio} />
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Detalhes da Oportunidade</legend>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor={tipoId} className={styles.label}>
                  Tipo de Solução <span className={styles.required} aria-hidden="true">*</span>
                </label>
                <select
                  id={tipoId}
                  className={`${styles.select} ${errors.tipoSolucao ? styles.inputError : ''}`}
                  value={form.tipoSolucao}
                  onChange={(e) => updateField('tipoSolucao', e.target.value)}
                  aria-required="true"
                  aria-invalid={!!errors.tipoSolucao}
                  aria-describedby={errors.tipoSolucao ? `${tipoId}-error` : undefined}
                  disabled={submitState === 'loading'}
                >
                  <option value="">Selecione o tipo</option>
                  {TIPOS_SOLUCAO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <FieldError id={`${tipoId}-error`} message={errors.tipoSolucao} />
              </div>

              <div className={styles.field}>
                <label htmlFor={valorId} className={styles.label}>
                  Estimativa de Valor (R$)
                </label>
                <input
                  id={valorId}
                  type="text"
                  inputMode="numeric"
                  className={`${styles.input} ${errors.estimativaValor ? styles.inputError : ''}`}
                  value={form.estimativaValor}
                  onChange={(e) => updateField('estimativaValor', e.target.value)}
                  placeholder="Ex: 25000"
                  aria-describedby={errors.estimativaValor ? `${valorId}-error` : `${valorId}-hint`}
                  disabled={submitState === 'loading'}
                />
                <span id={`${valorId}-hint`} className={styles.hint}>
                  Valor aproximado, pode ser atualizado depois.
                </span>
                <FieldError id={`${valorId}-error`} message={errors.estimativaValor} />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor={statusId} className={styles.label}>
                Status <span className={styles.required} aria-hidden="true">*</span>
              </label>
              <select
                id={statusId}
                className={`${styles.select} ${errors.status ? styles.inputError : ''}`}
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                aria-required="true"
                aria-invalid={!!errors.status}
                aria-describedby={errors.status ? `${statusId}-error` : undefined}
                disabled={submitState === 'loading'}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <FieldError id={`${statusId}-error`} message={errors.status} />
            </div>

            <div className={styles.field}>
              <label htmlFor={descId} className={styles.label}>
                Descrição / Observações
              </label>
              <textarea
                id={descId}
                className={styles.textarea}
                value={form.descricao}
                onChange={(e) => updateField('descricao', e.target.value)}
                placeholder="Contexto do projeto, necessidades específicas, próximos passos…"
                rows={4}
                disabled={submitState === 'loading'}
              />
            </div>
          </fieldset>

          <div className={styles.formActions}>
            <p className={styles.requiredNote}>
              <span aria-hidden="true">*</span> Campos obrigatórios
            </p>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={submitState === 'loading'}
              aria-busy={submitState === 'loading'}
            >
              {submitState === 'loading' ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Salvando…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17 21 17 13 7 13 7 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="7 3 7 8 15 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Cadastrar Oportunidade
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
