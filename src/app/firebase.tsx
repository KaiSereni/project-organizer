import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCJvEtqmfMWvDVEGxRTFhIbVX6L5nXykmc",
  authDomain: "project-organizer-kai.firebaseapp.com",
  projectId: "project-organizer-kai",
  storageBucket: "project-organizer-kai.firebasestorage.app",
  messagingSenderId: "836039101433",
  appId: "1:836039101433:web:e6eed97532cfef6d26cb28"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app);
export const firestore = getFirestore(app);

if (typeof window !== "undefined" && process.env.NODE_ENV == "development") {
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(firestore, "localhost", 8080);
}

export function getSaveUserProfileCallable() {
  return httpsCallable(functions, "save_user_profile");
}


