import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

// Test connection as per guidelines
async function testConnection() {
  if (firebaseConfig.apiKey === "mock-api-key") {
    console.warn("Firebase is running with a mock configuration. Persistence will fallback to localStorage.");
    return;
  }
  try {
    await getDocFromServer(doc(db, 'system', 'connection-test'));
  } catch (error: any) {
    if (error?.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or internet connection.");
    }
  }
}
testConnection();

export const isFirebaseConfigured = firebaseConfig.apiKey !== "mock-api-key";

export const loginWithGoogle = async () => {
  if (!isFirebaseConfigured) {
    console.error("Firebase is not configured.");
    return;
  }
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Login failed", error);
    throw error;
  }
};

export const logout = () => auth.signOut();
