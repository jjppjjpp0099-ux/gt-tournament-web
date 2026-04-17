import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBXjXke__6BxR5plzoWI5q9YH6Cf1ZmI2I",
    authDomain: "gt-tournament-web.firebaseapp.com",
    projectId: "gt-tournament-web",
    storageBucket: "gt-tournament-web.firebasestorage.app",
    messagingSenderId: "981095623432",
    appId: "1:981095623432:web:ede3cfd2b796d124331abd"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);