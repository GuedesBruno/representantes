'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import styles from './criar-senha.module.css';

type Step = 'loading' | 'ready' | 'success' | 'error';

function mapResetError(code: string) {
  const messages: Record<string, string> = {
    'auth/invalid-action-code': 'Este link é inválido. Solicite um novo convite.',
    'auth/expired-action-code': 'Este link expirou. Solicite um novo convite.',
    'auth/user-disabled': 'Esta conta está desativada. Fale com o administrador.',
    'auth/weak-password': 'A senha é muito fraca. Use pelo menos 6 caracteres.',
  };

  return messages[code] ?? 'Não foi possível concluir a criação da senha.';
}

function CriarSenhaPageInner() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') ?? '';

  const [step, setStep] = useState<Step>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadCode() {
      if (!oobCode) {
        setError('Link inválido. Solicite um novo convite ao administrador.');
        setStep('error');
        return;
      }

      try {
        const emailFromCode = await verifyPasswordResetCode(auth, oobCode);
        setEmail(emailFromCode);
        setStep('ready');
      } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        setError(mapResetError(code));
        setStep('error');
      }
    }

    loadCode();
  }, [oobCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setSubmitting(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStep('success');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setError(mapResetError(code));
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Portal de Representantes Tecassistiva</p>

        {step === 'loading' && (
          <div className={styles.stateBox}>
            <h1 className={styles.title}>Validando seu link</h1>
            <p className={styles.text}>Aguarde enquanto preparamos a criação da sua senha.</p>
          </div>
        )}

        {step === 'ready' && (
          <>
            <h1 className={styles.title}>Crie sua senha</h1>
            <p className={styles.text}>
              Conta: <strong>{email}</strong>
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="new-password">Nova senha</label>
              <input
                id="new-password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua nova senha"
                minLength={6}
                required
                disabled={submitting}
              />

              <label className={styles.label} htmlFor="confirm-password">Confirmar senha</label>
              <input
                id="confirm-password"
                type="password"
                className={styles.input}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Digite novamente"
                minLength={6}
                required
                disabled={submitting}
              />

              {error ? <p className={styles.error}>{error}</p> : null}

              <button type="submit" className={styles.primaryButton} disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar senha'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div className={styles.stateBox}>
            <h1 className={styles.title}>Senha alterada com sucesso</h1>
            <p className={styles.text}>Você já pode entrar no portal com sua nova senha.</p>
            <Link href="/login" className={styles.primaryButtonLink}>Ir para login</Link>
          </div>
        )}

        {step === 'error' && (
          <div className={styles.stateBox}>
            <h1 className={styles.title}>Não foi possível concluir</h1>
            <p className={styles.error}>{error}</p>
            <Link href="/login" className={styles.secondaryButtonLink}>Voltar para login</Link>
          </div>
        )}
      </section>
    </main>
  );
}

export default function CriarSenhaPage() {
  return (
    <Suspense fallback={null}>
      <CriarSenhaPageInner />
    </Suspense>
  );
}
