import 'server-only';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

function getAdminDb() {
  return getFirestore(getAdminApp());
}

type UserRole = 'admin' | 'representante';

export async function setUserRole(targetUid: string, role: UserRole) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const now = new Date();
  const isAdmin = role === 'admin';

  await auth.setCustomUserClaims(targetUid, { admin: isAdmin });
  await auth.revokeRefreshTokens(targetUid);

  await db.collection('users').doc(targetUid).set(
    {
      role,
      isAdmin,
      audit: {
        updatedAt: now,
        roleUpdatedAt: now,
      },
    },
    { merge: true }
  );
}

export async function patchUserProfile(
  targetUid: string,
  patch: {
    displayName?: string | null;
    profile?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
    business?: Record<string, unknown>;
  }
) {
  const db = getAdminDb();
  const now = new Date();

  const payload: Record<string, unknown> = {
    audit: {
      updatedAt: now,
    },
  };

  if (patch.displayName !== undefined) {
    payload.displayName = patch.displayName;
  }

  if (patch.profile) {
    payload.profile = patch.profile;
  }

  if (patch.preferences) {
    payload.preferences = patch.preferences;
  }

  if (patch.business) {
    payload.business = patch.business;
  }

  await db.collection('users').doc(targetUid).set(payload, { merge: true });
}

export async function verifyIdToken(idToken: string) {
  return getAdminAuth().verifyIdToken(idToken);
}

export async function upsertUserProfile(input: {
  uid: string;
  email: string;
  displayName?: string | null;
  isAdmin: boolean;
}) {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(input.uid);
  const existing = await userRef.get();
  const now = new Date();

  const profileDefaults = {
    nomeComercial: null,
    telefone: null,
    regiao: null,
    avatarUrl: null,
  };

  const preferencesDefaults = {
    idioma: 'pt-BR',
    moeda: 'BRL',
    tema: 'light',
    notificacoesEmail: true,
    notificacoesPush: false,
  };

  const businessDefaults = {
    timeId: null,
    carteiraIds: [],
    metas: {
      mensal: null,
      trimestral: null,
      anual: null,
    },
  };

  const auditBase = {
    updatedAt: now,
    lastLoginAt: now,
  };

  const baseData = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName ?? null,
    role: input.isAdmin ? 'admin' : 'representante',
    isAdmin: input.isAdmin,
    profile: profileDefaults,
    preferences: preferencesDefaults,
    business: businessDefaults,
    audit: auditBase,
  };

  if (!existing.exists) {
    await userRef.set({
      ...baseData,
      createdAt: now,
      audit: {
        ...auditBase,
        createdAt: now,
      },
    });
    return;
  }

  await userRef.set(
    {
      email: input.email,
      displayName: input.displayName ?? null,
      role: input.isAdmin ? 'admin' : 'representante',
      isAdmin: input.isAdmin,
      audit: auditBase,
      profile: profileDefaults,
      preferences: preferencesDefaults,
      business: businessDefaults,
    },
    { merge: true }
  );
}

export async function verifyAdminIdToken(idToken: string) {
  const decodedToken = await getAdminAuth().verifyIdToken(idToken);

  if (!decodedToken.admin) {
    throw new Error('Usuário sem permissão de administrador.');
  }

  return decodedToken;
}