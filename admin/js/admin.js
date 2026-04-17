import { auth, db, storage } from "../../js/firebase-config.js";
import { 
    signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, getDoc, collection, query, onSnapshot, orderBy, updateDoc, 
    addDoc, serverTimestamp, runTransaction, where, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

async function uploadToImgBB(file) {
    const apiKey = "c8648d9ad9e45f40986796142cd50ca1"; 
    const formData = new FormData();
    formData.append("image", file);
    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: formData
        });
        const result = await response.json();
        return result.data.url;
    } catch (error) {
        console.error("ImgBB Error:", error);
        return null;
    }
}

// UI Helpers
window.showSection = (id) => {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`sec-${id}`).classList.remove('hidden');
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
    document.querySelector(`.sidebar-link[data-target="${id}"]`).classList.add('active');
    document.getElementById('section-title').innerText = id;
};

const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('admin-toast');
    toast.className = `absolute top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-white font-medium ${type === 'success' ? 'bg-green-600' : 'bg-red-600'} block`;
    toast.innerText = msg;
    setTimeout(() => toast.classList.add('hidden'), 3000);
};

// Auth Logic
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if admin
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (adminDoc.exists()) {
            document.getElementById('admin-login').classList.add('hidden');
            initAdmin();
        } else {
            await signOut(auth);
            alert("Unauthorized access.");
        }
    } else {
        document.getElementById('admin-login').classList.remove('hidden');
    }
});

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const eInput = document.getElementById('admin-email').value;
    const pInput = document.getElementById('admin-password').value;
    try {
        await signInWithEmailAndPassword(auth, eInput, pInput);
    } catch (err) {
        alert("Login failed: " + err.message);
    }
});

document.getElementById('btn-admin-logout').addEventListener('click', () => signOut(auth));

// Init Admin Data
function initAdmin() {
    initStats();
    initTournaments();
    initUsers();
    initDeposits();
    initWithdraws();
    initSettings();
}

// Stats
function initStats() {
    onSnapshot(collection(db, "users"), snap => {
        document.getElementById('stat-users').innerText = snap.size;
    });
    onSnapshot(query(collection(db, "deposits"), where("status", "==", "pending")), snap => {
        document.getElementById('stat-dep').innerText = snap.size;
    });
    onSnapshot(query(collection(db, "withdraws"), where("status", "==", "pending")), snap => {
        document.getElementById('stat-with').innerText = snap.size;
    });
    onSnapshot(collection(db, "tournaments"), snap => {
        document.getElementById('stat-tour').innerText = snap.size;
    });
}

// Tournaments
document.getElementById('form-create-tourney').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-create-tourney');
    btn.disabled = true;
    btn.innerText = "Creating...";

    try {
        const file = document.getElementById('ct-banner').files[0];
        const url = await uploadToImgBB(file);
        if(!url) throw new Error("Banner upload failed!");

        await addDoc(collection(db, "tournaments"), {
            title: document.getElementById('ct-title').value,
            entryFee: Number(document.getElementById('ct-fee').value),
            prizePool: Number(document.getElementById('ct-pool').value),
            perKillReward: Number(document.getElementById('ct-kill').value),
            totalSlots: Number(document.getElementById('ct-slots').value),
            dateTime: document.getElementById('ct-date').value,
            banner: url,
            joinedUsers:[],
            roomId: "",
            roomPassword: "",
            resultPublished: false,
            createdAt: serverTimestamp()
        });

        showToast("Tournament created!");
        document.getElementById('form-create-tourney').reset();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Create";
    }
});

function initTournaments() {
    onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => {
        const list = document.getElementById('admin-tourney-list');
        list.innerHTML = '';
        snap.forEach(docSnap => {
            const t = docSnap.data();
            const id = docSnap.id;
            const joined = t.joinedUsers ? t.joinedUsers.length : 0;
            
            list.innerHTML += `
                <tr class="hover:bg-slate-800/50">
                    <td class="p-4 font-bold text-white">${t.title}</td>
                    <td class="p-4">${new Date(t.dateTime).toLocaleString()}</td>
                    <td class="p-4">${joined}/${t.totalSlots}</td>
                    <td class="p-4">
                        <button onclick="openRoomModal('${id}', '${t.roomId}', '${t.roomPassword}')" class="text-blue-400 hover:text-blue-300"><i class="fas fa-edit"></i> Edit</button>
                    </td>
                    <td class="p-4">
                        ${t.resultPublished 
                            ? '<span class="text-green-500 font-bold">Result Published</span>' 
                            : `<button onclick="openResultModal('${id}', ${t.perKillReward})" class="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-bold">Submit Result</button>`}
                    </td>
                </tr>
            `;
        });
    });
}

window.openRoomModal = (id, rId, rPass) => {
    document.getElementById('room-tid').value = id;
    document.getElementById('room-id').value = rId || "";
    document.getElementById('room-pass').value = rPass || "";
    document.getElementById('modal-room').classList.remove('hidden');
    document.getElementById('modal-room').classList.add('flex');
};

window.saveRoomDetails = async () => {
    const id = document.getElementById('room-tid').value;
    const rId = document.getElementById('room-id').value;
    const rPass = document.getElementById('room-pass').value;
    await updateDoc(doc(db, "tournaments", id), { roomId: rId, roomPassword: rPass });
    document.getElementById('modal-room').classList.add('hidden');
    showToast("Room details updated");
};

// Results Logic
window.openResultModal = async (id, killReward) => {
    document.getElementById('res-tid').value = id;
    document.getElementById('res-kill-reward').value = killReward;
    
    const tDoc = await getDoc(doc(db, "tournaments", id));
    const joined = tDoc.data().joinedUsers ||[];
    
    const list = document.getElementById('res-user-list');
    list.innerHTML = '';
    
    if(joined.length === 0) {
        list.innerHTML = '<tr><td colspan="3" class="p-4 text-center">No users joined</td></tr>';
    } else {
        joined.forEach(uid => {
            list.innerHTML += `
                <tr class="res-row" data-uid="${uid}">
                    <td class="p-2 text-xs font-mono text-slate-400">${uid}</td>
                    <td class="p-2"><input type="number" min="0" value="0" class="res-kill w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"></td>
                    <td class="p-2"><input type="number" min="0" value="0" class="res-prize w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"></td>
                </tr>
            `;
        });
    }
    
    document.getElementById('modal-result').classList.remove('hidden');
    document.getElementById('modal-result').classList.add('flex');
};

window.submitResults = async () => {
    const btn = document.getElementById('btn-submit-res');
    btn.disabled = true;
    btn.innerText = "Processing...";

    const tid = document.getElementById('res-tid').value;
    const killReward = Number(document.getElementById('res-kill-reward').value);
    const rows = document.querySelectorAll('.res-row');
    
    try {
        await runTransaction(db, async (transaction) => {
            const tRef = doc(db, "tournaments", tid);
            const tDoc = await transaction.get(tRef);
            if(tDoc.data().resultPublished) throw "Result already published";

            for (let row of rows) {
                const uid = row.getAttribute('data-uid');
                const kills = Number(row.querySelector('.res-kill').value);
                const prize = Number(row.querySelector('.res-prize').value);
                
                const totalWin = (kills * killReward) + prize;
                if(totalWin > 0) {
                    const uRef = doc(db, "users", uid);
                    const uDoc = await transaction.get(uRef);
                    if(uDoc.exists()) {
                        transaction.update(uRef, {
                            availableBalance: uDoc.data().availableBalance + totalWin
                        });
                        
                        const txRef = doc(collection(db, "transactions"));
                        transaction.set(txRef, {
                            userId: uid,
                            type: 'win',
                            amount: totalWin,
                            tournamentId: tid,
                            status: 'success',
                            createdAt: serverTimestamp()
                        });
                    }
                }
            }
            transaction.update(tRef, { resultPublished: true });
        });
        
        showToast("Results published successfully!");
        document.getElementById('modal-result').classList.add('hidden');
    } catch (err) {
        showToast(err.message || err, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Process Winnings";
    }
};

// Users
function initUsers() {
    onSnapshot(collection(db, "users"), snap => {
        const list = document.getElementById('admin-user-list');
        list.innerHTML = '';
        snap.forEach(docSnap => {
            const u = docSnap.data();
            list.innerHTML += `
                <tr class="hover:bg-slate-800/50">
                    <td class="p-4">
                        <p class="font-bold text-white">${u.username} ${u.isVerified ? '<i class="fas fa-check-circle text-blue-500"></i>' : ''}</p>
                        <p class="text-xs text-slate-400">${u.email}</p>
                    </td>
                    <td class="p-4 text-green-400 font-bold">₹${u.availableBalance}</td>
                    <td class="p-4 text-orange-400 font-bold">₹${u.lockedBalance}</td>
                    <td class="p-4">${u.isBanned ? '<span class="text-red-500">Banned</span>' : '<span class="text-green-500">Active</span>'}</td>
                    <td class="p-4 flex gap-2">
                        <button onclick="openEditUser('${u.uid}', ${u.availableBalance}, ${u.lockedBalance})" class="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs"><i class="fas fa-edit"></i></button>
                        <button onclick="toggleBan('${u.uid}', ${u.isBanned})" class="${u.isBanned ? 'bg-green-600' : 'bg-red-600'} text-white px-2 py-1 rounded text-xs">${u.isBanned ? 'Unban' : 'Ban'}</button>
                        <button onclick="toggleVerify('${u.uid}', ${u.isVerified})" class="bg-purple-600 text-white px-2 py-1 rounded text-xs">${u.isVerified ? 'Unverify' : 'Verify'}</button>
                    </td>
                </tr>
            `;
        });
    });
}

window.openEditUser = (uid, avail, locked) => {
    document.getElementById('eu-uid').value = uid;
    document.getElementById('eu-avail').value = avail;
    document.getElementById('eu-locked').value = locked;
    document.getElementById('modal-edit-user').classList.remove('hidden');
    document.getElementById('modal-edit-user').classList.add('flex');
};

window.saveUserEdit = async () => {
    const uid = document.getElementById('eu-uid').value;
    const avail = Number(document.getElementById('eu-avail').value);
    const locked = Number(document.getElementById('eu-locked').value);
    await updateDoc(doc(db, "users", uid), { availableBalance: avail, lockedBalance: locked });
    document.getElementById('modal-edit-user').classList.add('hidden');
    showToast("Balances updated");
};

window.toggleBan = async (uid, currentStatus) => {
    await updateDoc(doc(db, "users", uid), { isBanned: !currentStatus });
    showToast(currentStatus ? "User unbanned" : "User banned");
};

window.toggleVerify = async (uid, currentStatus) => {
    await updateDoc(doc(db, "users", uid), { isVerified: !currentStatus });
    showToast("Verification status updated");
};

// Deposits
function initDeposits() {
    onSnapshot(query(collection(db, "deposits"), where("status", "==", "pending"), orderBy("createdAt", "desc")), snap => {
        const list = document.getElementById('admin-dep-list');
        list.innerHTML = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const id = docSnap.id;
            list.innerHTML += `
                            <tr class="hover:bg-slate-800/50">
                    <td class="p-4 text-white">${d.username || 'User'}</td>
                    <td class="p-4 font-bold text-green-400">₹${d.amount}</td>
                    <td class="p-4 font-mono text-xs">${d.utr}</td>
                    <td class="p-4">
                        <a href="${d.screenshot}" target="_blank" class="text-blue-400 underline text-xs">View Image</a>
                    </td>
                    <td class="p-4 flex gap-2">
                        <button onclick="handleDeposit('${id}', '${d.userId}', ${d.amount}, 'approved')" class="bg-green-600 px-3 py-1 rounded text-white text-xs font-bold">Approve</button>
                        <button onclick="handleDeposit('${id}', '${d.userId}', ${d.amount}, 'rejected')" class="bg-red-600 px-3 py-1 rounded text-white text-xs font-bold">Reject</button>
                    </td>
                </tr>
            `;


            `;
        });
    });
}

window.handleDeposit = async (depId, uid, amount, action) => {
    try {
        await runTransaction(db, async (transaction) => {
            const depRef = doc(db, "deposits", depId);
            const depDoc = await transaction.get(depRef);
            if(depDoc.data().status !== 'pending') throw "Already processed";

            transaction.update(depRef, { status: action });

            // Find tx
            const txQ = query(collection(db, "transactions"), where("userId", "==", uid), where("type", "==", "deposit"), where("amount", "==", amount), where("status", "==", "pending"));
            const txSnaps = await getDocs(txQ);
            if(!txSnaps.empty) {
                transaction.update(txSnaps.docs[0].ref, { status: action });
            }

            if(action === 'approved') {
                const uRef = doc(db, "users", uid);
                const uDoc = await transaction.get(uRef);
                transaction.update(uRef, { availableBalance: uDoc.data().availableBalance + amount });
            }
        });
        showToast(`Deposit ${action}`);
    } catch(err) {
        showToast(err.message || err, 'error');
    }
};

// Withdraws
function initWithdraws() {
    onSnapshot(query(collection(db, "withdraws"), where("status", "==", "pending"), orderBy("createdAt", "desc")), snap => {
        const list = document.getElementById('admin-with-list');
        list.innerHTML = '';
        snap.forEach(docSnap => {
            const w = docSnap.data();
            const id = docSnap.id;
            list.innerHTML += `
                <tr class="hover:bg-slate-800/50">
                    <td class="p-4 text-white">${w.username || 'User'}</td>
                    <td class="p-4 font-bold text-orange-400">₹${w.amount}</td>
                    <td class="p-4 font-mono text-xs">${w.upi}</td>
                    <td class="p-4 flex gap-2">
                        <button onclick="handleWithdraw('${id}', '${w.userId}', ${w.amount}, 'approved')" class="bg-green-600 px-3 py-1 rounded text-white text-xs font-bold">Approve</button>
                        <button onclick="handleWithdraw('${id}', '${w.userId}', ${w.amount}, 'rejected')" class="bg-red-600 px-3 py-1 rounded text-white text-xs font-bold">Reject</button>
                    </td>
                </tr>
            `;
        });
    });
}

window.handleWithdraw = async (withId, uid, amount, action) => {
    try {
        await runTransaction(db, async (transaction) => {
            const wRef = doc(db, "withdraws", withId);
            const wDoc = await transaction.get(wRef);
            if(wDoc.data().status !== 'pending') throw "Already processed";

            transaction.update(wRef, { status: action });

            // Find tx
            const txQ = query(collection(db, "transactions"), where("userId", "==", uid), where("type", "==", "withdraw"), where("amount", "==", amount), where("status", "==", "pending"));
            const txSnaps = await getDocs(txQ);
            if(!txSnaps.empty) {
                transaction.update(txSnaps.docs[0].ref, { status: action });
            }

            const uRef = doc(db, "users", uid);
            const uDoc = await transaction.get(uRef);
            const uData = uDoc.data();

            if(action === 'approved') {
                transaction.update(uRef, { lockedBalance: uData.lockedBalance - amount });
            } else if (action === 'rejected') {
                transaction.update(uRef, { 
                    lockedBalance: uData.lockedBalance - amount,
                    availableBalance: uData.availableBalance + amount
                });
            }
        });
        showToast(`Withdrawal ${action}`);
    } catch(err) {
        showToast(err.message || err, 'error');
    }
};

// Settings
function initSettings() {
    onSnapshot(doc(db, "settings", "global"), docSnap => {
        if(docSnap.exists()) {
            const s = docSnap.data();
            document.getElementById('set-marquee').value = s.marqueeText || "";
            document.getElementById('set-min-dep').value = s.minDeposit || 10;
            document.getElementById('set-min-with').value = s.minWithdraw || 50;
            document.getElementById('set-upi').value = s.upiId || "";
            document.getElementById('set-qr').value = s.qrImage || "";
            document.getElementById('set-maintenance').checked = s.maintenanceMode || false;
        }
    });
}

document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-settings');
    btn.disabled = true;
    btn.innerText = "Saving...";
    try {
        await updateDoc(doc(db, "settings", "global"), {
            marqueeText: document.getElementById('set-marquee').value,
            minDeposit: Number(document.getElementById('set-min-dep').value),
            minWithdraw: Number(document.getElementById('set-min-with').value),
            upiId: document.getElementById('set-upi').value,
            qrImage: document.getElementById('set-qr').value,
            maintenanceMode: document.getElementById('set-maintenance').checked
        });
        showToast("Settings saved successfully");
    } catch(err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Settings";
    }
});

// Broadcast
document.getElementById('form-broadcast').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-send-bc');
    const msg = document.getElementById('bc-message').value;
    btn.disabled = true;
    btn.innerText = "Sending...";
    try {
        await addDoc(collection(db, "broadcast"), {
            message: msg,
            createdAt: serverTimestamp()
        });
        showToast("Broadcast sent to all users!");
        document.getElementById('form-broadcast').reset();
    } catch(err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Send Broadcast";
    }
});
