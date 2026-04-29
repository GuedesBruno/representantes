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

async function fullMirror() {
  try {
    console.log('Iniciando Espelhamento Total de produtos_modelos -> produtos...');
    
    // 1. Pega tudo da antiga
    const oldSnap = await db.collection('produtos_modelos').get();
    console.log(`Lendo ${oldSnap.size} produtos da coleção antiga...`);

    // 2. Limpa a nova (opcional, mas garante que fiquem idênticas)
    const newSnap = await db.collection('produtos').get();
    console.log(`Limpando ${newSnap.size} produtos da coleção nova para evitar duplicatas...`);
    
    const batch = db.batch();
    newSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // 3. Copia tudo com os mesmos IDs
    let copiedCount = 0;
    const copyBatch = db.batch();
    
    oldSnap.docs.forEach(doc => {
      const data = doc.data();
      const newRef = db.collection('produtos').doc(doc.id);
      copyBatch.set(newRef, data);
      copiedCount++;
    });

    await copyBatch.commit();
    console.log(`\nSucesso! ${copiedCount} produtos foram espelhados com sucesso.`);
    console.log('Agora a coleção "produtos" é uma cópia idêntica da "produtos_modelos".');
  } catch (error) {
    console.error('Erro no espelhamento:', error);
  } finally {
    process.exit();
  }
}

fullMirror();
