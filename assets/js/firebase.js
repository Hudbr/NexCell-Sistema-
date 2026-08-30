import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// A configuração web do Firebase identifica o projeto; ela não é uma senha.
// A proteção dos dados é feita em firestore.rules e pelo Firebase Auth.
const firebaseConfig = {
  apiKey: "AIzaSyBQ9Jw5tCaff3t4wgeAkfFr051s07wdlhg",
  authDomain: "nexcell-6515.firebaseapp.com",
  projectId: "nexcell-6515",
  storageBucket: "nexcell-6515.firebasestorage.app",
  messagingSenderId: "374302980620",
  appId: "1:374302980620:web:e6fae5ca987fce851d4c29",
  measurementId: "G-3WGPE1NXX6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function getUserProfile(uid) {
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, "usuarios", uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function effectivePermissions(profile) {
  const empty = {
    dashboard: false,
    vender: false,
    estoque_ver: false,
    estoque_editar: false,
    financeiro: false,
    cancelar_venda: false,
  };

  if (!profile || profile.status === "pendente") return empty;
  if (profile.cargo === "admin") {
    return Object.fromEntries(Object.keys(empty).map((key) => [key, true]));
  }
  if (profile.permissoes) return { ...empty, ...profile.permissoes };
  if (profile.cargo === "estoque") {
    return { ...empty, estoque_ver: true, estoque_editar: true };
  }
  if (profile.cargo === "financeiro") {
    return { ...empty, estoque_ver: true, financeiro: true };
  }
  return { ...empty, vender: true, estoque_ver: true };
}

export {
  addDoc,
  app,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  effectivePermissions,
  getDoc,
  getDocs,
  getUserProfile,
  increment,
  limit,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  sendPasswordResetEmail,
  serverTimestamp,
  setDoc,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  where,
  writeBatch,
};
