import 'server-only';

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function parseServiceAccount(rawValue: string) {
  const candidates: string[] = [];
  const raw = rawValue.trim();

  candidates.push(raw);

  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    candidates.push(raw.slice(1, -1));
  }

  if (raw.startsWith('n{')) {
    candidates.push(raw.slice(1));
  }

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      candidates.push(decoded);
    }
  } catch {
    // ignore base64 parse errors
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não contém JSON válido.');
}

function getServiceAccount() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!rawServiceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não definida.');
  }

  return parseServiceAccount(rawServiceAccount);
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

export { getAdminDb };

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

export async function updateUserEmail(targetUid: string, email: string | null) {
  if (!email) return;

  const auth = getAdminAuth();
  const db = getAdminDb();
  const now = new Date();

  await auth.updateUser(targetUid, { email });

  await db.collection('users').doc(targetUid).set(
    {
      email,
      audit: {
        updatedAt: now,
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
    sales?: Record<string, unknown>;
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

  if (patch.sales) {
    payload.sales = patch.sales;
  }

  await db.collection('users').doc(targetUid).set(payload, { merge: true });
}

export async function verifyIdToken(idToken: string) {
  return getAdminAuth().verifyIdToken(idToken);
}

export async function inviteUser(input: {
  email: string;
  displayName: string | null;
  role: UserRole;
  profile?: Record<string, unknown>;
  sales?: Record<string, unknown>;
}) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const now = new Date();

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(input.email);
  } catch {
    userRecord = await auth.createUser({
      email: input.email,
      displayName: input.displayName ?? undefined,
      emailVerified: false,
      disabled: false,
    });
  }

  const isAdmin = input.role === 'admin';
  await auth.setCustomUserClaims(userRecord.uid, { admin: isAdmin });
  await auth.revokeRefreshTokens(userRecord.uid);

  const baseProfile = {
    nomeComercial: null,
    telefone: null,
    regiao: null,
    uf: null,
  };

  await db.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: input.email,
      displayName: input.displayName ?? null,
      role: input.role,
      isAdmin,
      profile: {
        ...baseProfile,
        ...(input.profile ?? {}),
      },
      sales: {
        nomeVendedor: null,
        emailVendedor: null,
        ...(input.sales ?? {}),
      },
      audit: {
        updatedAt: now,
        createdAt: now,
      },
      createdAt: now,
    },
    { merge: true }
  );

  const resetLink = await auth.generatePasswordResetLink(input.email);
  return {
    uid: userRecord.uid,
    resetLink,
  };
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