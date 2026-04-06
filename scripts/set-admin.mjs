import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const email = process.argv[2]?.trim();
const adminArg = process.argv[3]?.trim();
const makeAdmin = adminArg ? adminArg.toLowerCase() !== 'false' : true;

if (!email) {
  fail('Uso: npm run set-admin -- <email> [true|false]');
}

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawServiceAccount) {
  fail('Defina FIREBASE_SERVICE_ACCOUNT_KEY no ambiente antes de executar este script.');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(rawServiceAccount);
} catch {
  fail('FIREBASE_SERVICE_ACCOUNT_KEY não contém JSON válido.');
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: makeAdmin });
  await auth.revokeRefreshTokens(user.uid);

  console.log(`Claim admin=${makeAdmin} aplicada para ${email}.`);
  console.log('Peça para o usuário sair e entrar novamente para atualizar o token.');
} catch (error) {
  console.error('Erro ao definir custom claim:', error);
  process.exit(1);
}
