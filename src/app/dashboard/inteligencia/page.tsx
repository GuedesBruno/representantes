import styles from './inteligencia.module.css';

export default function InteligenciaPage() {
  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <p className={styles.introText}>
          Este espaco de inteligencia sera atualizado com novos recursos em breve.
        </p>
      </div>

      <div className={styles.embedWrapper}>
        <div className={styles.state} role="status" aria-live="polite">
          <h2 className={styles.errorTitle}>Modulo em reformulacao</h2>
          <p className={styles.errorHint}>
            Este modulo analitico esta temporariamente indisponivel neste portal.
          </p>
        </div>
      </div>
    </div>
  );
}
