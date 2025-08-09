// firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBRSLjSvqOTxuhNXETV8KP-BJocUkIT9hk",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "bin-management-nc.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "bin-management-nc",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "bin-management-nc.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "478972968384",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:478972968384:web:d95016ccf35f6db109dc25",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-C9GT6VT5FY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
