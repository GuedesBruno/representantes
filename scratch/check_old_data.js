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

async function checkOldCollection() {
  try {
    const snapshot = await db.collection('produtos_modelos').get();
    console.log(`Total de produtos na coleção ANTIGA (produtos_modelos): ${snapshot.size}`);
    
    if (snapshot.size > 0) {
      console.log('\nExemplos de dados na coleção ANTIGA:');
      snapshot.docs.slice(0, 3).forEach(doc => {
        const data = doc.data();
        console.log(`- ${data.nome} | Desc: ${data.descricao ? 'Tem' : 'Não tem'} | Categoria: ${data.categoria || 'N/A'} | Ordem: ${data.ordemExibicao || 'N/A'}`);
      });
    }
    
    const newSnapshot = await db.collection('produtos').get();
    console.log(`\nTotal de produtos na coleção ATUAL (produtos): ${newSnapshot.size}`);
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    process.exit();
  }
}

checkOldCollection();
