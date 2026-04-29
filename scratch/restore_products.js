const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function getEnvVar(key) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith(key + '=')) {
        return line.substring(key.length + 1).trim();
      }
    }
  } catch (e) {}
  return null;
}

const serviceAccountKeyRaw = getEnvVar('FIREBASE_SERVICE_ACCOUNT_KEY');
const serviceAccount = JSON.parse(serviceAccountKeyRaw);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function restoreData() {
  try {
    console.log('Iniciando restauração de dados...');
    const oldSnap = await db.collection('produtos_modelos').get();
    const newSnap = await db.collection('produtos').get();
    
    const oldDocs = oldSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const newDocs = newSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    let updatedCount = 0;

    for (const newDoc of newDocs) {
      // Tenta achar o correspondente pelo nome (ignorando case)
      const oldMatch = oldDocs.find(o => o.nome?.toLowerCase().trim() === newDoc.nome?.toLowerCase().trim());
      
      if (oldMatch) {
        const update = {};
        if (!newDoc.descricao && oldMatch.descricao) update.descricao = oldMatch.descricao;
        if (!newDoc.categoria && oldMatch.categoria) update.categoria = oldMatch.categoria;
        if (newDoc.ordemExibicao === undefined && oldMatch.ordemExibicao !== undefined) update.ordemExibicao = oldMatch.ordemExibicao;
        if (!newDoc.nomeAbreviado && oldMatch.nomeAbreviado) update.nomeAbreviado = oldMatch.nomeAbreviado;

        if (Object.keys(update).length > 0) {
          await db.collection('produtos').doc(newDoc.id).update(update);
          console.log(`✓ Atualizado: ${newDoc.nome} | Campos: ${Object.keys(update).join(', ')}`);
          updatedCount++;
        }
      }
    }

    console.log(`\nFim do processo. ${updatedCount} produtos foram restaurados.`);
  } catch (error) {
    console.error('Erro na restauração:', error);
  } finally {
    process.exit();
  }
}

restoreData();
