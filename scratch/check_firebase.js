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

if (!serviceAccountKeyRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY não encontrado no .env.local');
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountKeyRaw);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkProducts() {
  try {
    const snapshot = await db.collection('produtos').get();
    console.log(`Total de produtos encontrados no Firebase: ${snapshot.size}`);
    
    if (snapshot.size > 0) {
      console.log('\nÚltimos 5 produtos cadastrados:');
      const docs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }));
        
      // Sort manually
      docs.sort((a, b) => {
        const timeA = a.criadoEm?.seconds || 0;
        const timeB = b.criadoEm?.seconds || 0;
        return timeB - timeA;
      });
        
      docs.slice(0, 5).forEach(p => {
        const date = p.criadoEm ? new Date(p.criadoEm.seconds * 1000).toLocaleString() : 'N/A';
        console.log(`- ${p.nome} (ID: ${p.id}) | Criado em: ${date}`);
      });
    }
  } catch (error) {
    console.error('Erro ao acessar o Firestore:', error);
  } finally {
    process.exit();
  }
}

checkProducts();
