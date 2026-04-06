import 'server-only';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getServiceAccount() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawServiceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não definida.');
  }

  try {
    return JSON.parse(rawServiceAccount);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não contém JSON válido.');
  }
}

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert(getServiceAccount()),
  });
}

function getAdminAuth() {
  return getAuth(getAdminApp());
}

export async function verifyAdminIdToken(idToken: string) {
  const decodedToken = await getAdminAuth().verifyIdToken(idToken);

  if (!decodedToken.admin) {
    throw new Error('Usuário sem permissão de administrador.');
  }

  return decodedToken;
}