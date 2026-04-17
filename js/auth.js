import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// UI Helpers
window.toggleAuth = (type) => {
    document.getElementById('login-form').classList.toggle('hidden', type !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', type !== 'register');
};

window.showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-600 border-green-500',
        error: 'bg-red-600 border-red-500',
        info: 'bg-blue-600 border-blue-500'
    };
    toast.className = `toast-enter ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm font-medium`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.replace('toast-enter', 'toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const setLoading = (btnId, isLoading, text) => {
    const btn = document.getElementById(btnId);
    if(isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner mr-2"></div> Processing...`;
        btn.classList.add('opacity-70');
    } else {
        btn.disabled = false;
        btn.innerHTML = text;
        btn.classList.remove('opacity-70');
    }
};

// Register
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const username = document.getElementById('reg-username').value.trim();

    if(username.length < 3) return showToast('Username too short', 'error');

    setLoading('btn-register', true, '');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            username: username,
            email: email,
            availableBalance: 0,
            lockedBalance: 0,
            isBanned: false,
            isVerified: false,
            createdAt: serverTimestamp()
        });

        showToast('Account created successfully!', 'success');
        document.getElementById('register-form').reset();
    } catch (error) {
        showToast(error.message.replace('Firebase: ', ''), 'error');
    } finally {
        setLoading('btn-register', false, 'Create Account');
    }
});

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    setLoading('btn-login', true, '');
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Logged in successfully!', 'success');
        document.getElementById('login-form').reset();
    } catch (error) {
        showToast('Invalid credentials', 'error');
    } finally {
        setLoading('btn-login', false, 'Login');
    }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        showToast('Error logging out', 'error');
    }
});

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    const authSection = document.getElementById('auth-section');
    const mainApp = document.getElementById('main-app');

    if (user) {
        authSection.classList.add('hidden');
        mainApp.classList.remove('hidden');
        // Trigger app init in app.js
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { uid: user.uid } }));
    } else {
        authSection.classList.remove('hidden');
        mainApp.classList.add('hidden');
        document.getElementById('banned-overlay').classList.add('hidden');
        // Cleanup listeners in app.js
        window.dispatchEvent(new Event('userLoggedOut'));
    }
});