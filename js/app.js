import { auth, db, storage } from "./firebase-config.js";
import { 
    doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, 
    runTransaction, limit, where, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

let currentUserData = null;
let currentSettings = null;
let unsubUser, unsubSettings, unsubTourneys, unsubChat, unsubTx, unsubBroadcast;
let selectedTourneyId = null;

// UI State Management
window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-btn[data-target="${tabId}"]`).classList.add('active');
};

window.openModal = (id) => {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.querySelector('div').classList.remove('translate-y-full');
    }, 10);
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    modal.querySelector('div').classList.add('translate-y-full');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
};

window.closeBroadcast = () => {
    const el = document.getElementById('broadcast-content');
    el.classList.remove('scale-100', 'opacity-100');
    el.classList.add('scale-95', 'opacity-0');
    setTimeout(() => document.getElementById('broadcast-modal').classList.add('hidden'), 300);
};

// Initialization
window.addEventListener('userLoggedIn', (e) => {
    const uid = e.detail.uid;
    initUser(uid);
    initSettings();
    initTournaments();
    initChat();
    initTransactions(uid);
    initBroadcast();
});

window.addEventListener('userLoggedOut', () => {
    if(unsubUser) unsubUser();
    if(unsubSettings) unsubSettings();
    if(unsubTourneys) unsubTourneys();
    if(unsubChat) unsubChat();
    if(unsubTx) unsubTx();
    if(unsubBroadcast) unsubBroadcast();
    currentUserData = null;
});

function initUser(uid) {
    unsubUser = onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            currentUserData = docSnap.data();
            
            if (currentUserData.isBanned) {
                document.getElementById('banned-overlay').classList.remove('hidden');
                document.getElementById('main-app').classList.add('hidden');
                return;
            } else {
                document.getElementById('banned-overlay').classList.add('hidden');
            }

            // Update Header & Wallet
            document.getElementById('header-balance').innerText = `₹${currentUserData.availableBalance}`;
            document.getElementById('wallet-available').innerText = `₹${currentUserData.availableBalance}`;
            document.getElementById('wallet-locked').innerText = `₹${currentUserData.lockedBalance}`;
            
            // Update Profile
            document.getElementById('profile-username').innerText = currentUserData.username;
            document.getElementById('profile-email').innerText = currentUserData.email;
            document.getElementById('profile-avatar').innerText = currentUserData.username.charAt(0).toUpperCase();
            if(currentUserData.isVerified) {
                document.getElementById('profile-verified').classList.remove('hidden');
            }
            
            // Calculate matches & earnings from tx (handled in initTransactions)
        }
    });
}

function initSettings() {
    unsubSettings = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
        if (docSnap.exists()) {
            currentSettings = docSnap.data();
            
            if (currentSettings.maintenanceMode) {
                document.getElementById('maintenance-overlay').classList.remove('hidden');
                document.getElementById('main-app').classList.add('hidden');
            } else if (!currentUserData?.isBanned) {
                document.getElementById('maintenance-overlay').classList.add('hidden');
                document.getElementById('main-app').classList.remove('hidden');
            }

            document.getElementById('app-marquee').innerText = currentSettings.marqueeText || "Welcome!";
            document.getElementById('dep-upi').innerText = currentSettings.upiId || "Not set";
            document.getElementById('dep-qr').src = currentSettings.qrImage || "";
            document.getElementById('dep-min').innerText = currentSettings.minDeposit || 10;
            document.getElementById('with-min').innerText = currentSettings.minWithdraw || 50;
        }
    });
}

function initTournaments() {
    const q = query(collection(db, "tournaments"), orderBy("dateTime", "desc"));
    unsubTourneys = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('tournaments-list');
        list.innerHTML = '';
        
        if(snapshot.empty) {
            list.innerHTML = '<p class="text-slate-500 text-center py-8">No upcoming matches.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const t = docSnap.data();
            const id = docSnap.id;
            const joined = t.joinedUsers ? t.joinedUsers.length : 0;
            const isFull = joined >= t.totalSlots;
            const isJoined = t.joinedUsers && t.joinedUsers.includes(auth.currentUser.uid);
            
            const date = new Date(t.dateTime).toLocaleString('en-IN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            let btnHtml = `<button onclick="viewTourney('${id}')" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition">View Details</button>`;
            if (isJoined) {
                btnHtml = `<button onclick="viewTourney('${id}')" class="w-full mt-3 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition"><i class="fas fa-check-circle mr-1"></i> Joined</button>`;
            } else if (isFull) {
                btnHtml = `<button disabled class="w-full mt-3 bg-slate-700 text-slate-400 font-bold py-2 rounded-lg cursor-not-allowed">Match Full</button>`;
            }

            list.innerHTML += `
                <div class="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg">
                    <div class="h-32 bg-slate-700 relative">
                        <img src="${t.banner}" class="w-full h-full object-cover opacity-80" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
                        <div class="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs font-bold text-white border border-slate-600">
                            ${joined}/${t.totalSlots} Full
                        </div>
                    </div>
                    <div class="p-4">
                        <h3 class="text-lg font-bold text-white mb-1 truncate">${t.title}</h3>
                        <p class="text-blue-400 text-sm mb-3"><i class="far fa-clock mr-1"></i> ${date}</p>
                        
                        <div class="grid grid-cols-3 gap-2 text-center text-sm">
                            <div class="bg-slate-900 rounded py-1 border border-slate-700">
                                <span class="block text-slate-400 text-[10px]">Entry</span>
                                <span class="font-bold text-orange-400">₹${t.entryFee}</span>
                            </div>
                            <div class="bg-slate-900 rounded py-1 border border-slate-700">
                                <span class="block text-slate-400 text-[10px]">Prize</span>
                                <span class="font-bold text-green-400">₹${t.prizePool}</span>
                            </div>
                            <div class="bg-slate-900 rounded py-1 border border-slate-700">
                                <span class="block text-slate-400 text-[10px]">Per Kill</span>
                                <span class="font-bold text-blue-400">₹${t.perKillReward}</span>
                            </div>
                        </div>
                        ${btnHtml}
                    </div>
                </div>
            `;
        });
    });
}

window.viewTourney = async (id) => {
    selectedTourneyId = id;
    const docRef = doc(db, "tournaments", id);
    const snap = await getDoc(docRef); // using getDoc for modal, though onSnapshot is better for live
    if(!snap.exists()) return showToast('Tournament not found', 'error');
    
    const t = snap.data();
    const joined = t.joinedUsers ? t.joinedUsers.length : 0;
    const isJoined = t.joinedUsers && t.joinedUsers.includes(auth.currentUser.uid);
    const isFull = joined >= t.totalSlots;
    
    document.getElementById('tm-banner').src = t.banner;
    document.getElementById('tm-title').innerText = t.title;
    document.getElementById('tm-time').innerHTML = `<i class="far fa-clock mr-1"></i> ` + new Date(t.dateTime).toLocaleString();
    document.getElementById('tm-fee').innerText = `₹${t.entryFee}`;
    document.getElementById('tm-pool').innerText = `₹${t.prizePool}`;
    document.getElementById('tm-kill').innerText = `₹${t.perKillReward}`;
    document.getElementById('tm-spots-text').innerText = `${joined}/${t.totalSlots}`;
    document.getElementById('tm-progress').style.width = `${(joined/t.totalSlots)*100}%`;

    const btn = document.getElementById('btn-join-tourney');
    const roomDiv = document.getElementById('tm-room-details');

    if (isJoined) {
        btn.style.display = 'none';
        roomDiv.classList.remove('hidden');
        document.getElementById('tm-room-id').innerText = t.roomId || "Waiting...";
        document.getElementById('tm-room-pass').innerText = t.roomPassword || "Waiting...";
    } else {
        roomDiv.classList.add('hidden');
        btn.style.display = 'flex';
        btn.disabled = isFull;
        btn.className = isFull 
            ? "w-full bg-slate-700 text-slate-400 font-bold py-3 rounded-xl cursor-not-allowed" 
            : "w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition flex justify-center items-center shadow-lg shadow-blue-500/20";
        btn.innerText = isFull ? "Match Full" : "Join Match";
        btn.onclick = () => joinTournament(id, t.entryFee);
    }

    openModal('tourney-modal');
};

async function joinTournament(id, fee) {
    if(!currentUserData) return;
    if(currentUserData.availableBalance < fee) {
        showToast('Insufficient balance! Please deposit.', 'error');
        closeModal('tourney-modal');
        switchTab('wallet');
        return;
    }

    const btn = document.getElementById('btn-join-tourney');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner mr-2"></div> Joining...`;

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", auth.currentUser.uid);
            const tourneyRef = doc(db, "tournaments", id);
            
            const userDoc = await transaction.get(userRef);
            const tourneyDoc = await transaction.get(tourneyRef);

            if (!userDoc.exists() || !tourneyDoc.exists()) throw "Data not found";

            const uData = userDoc.data();
            const tData = tourneyDoc.data();
            const joined = tData.joinedUsers ||[];

            if(joined.includes(auth.currentUser.uid)) throw "Already joined!";
            if(joined.length >= tData.totalSlots) throw "Match is full!";
            if(uData.availableBalance < fee) throw "Insufficient balance!";

            // Deduct balance
            transaction.update(userRef, {
                availableBalance: uData.availableBalance - fee
            });

            // Add to tournament
            joined.push(auth.currentUser.uid);
            transaction.update(tourneyRef, {
                joinedUsers: joined
            });

            // Record Transaction
            const txRef = doc(collection(db, "transactions"));
            transaction.set(txRef, {
                userId: auth.currentUser.uid,
                type: 'join',
                amount: fee,
                tournamentId: id,
                title: tData.title,
                status: 'success',
                createdAt: serverTimestamp()
            });
        });

        showToast('Successfully joined match!', 'success');
        viewTourney(id); // refresh modal
    } catch (error) {
        showToast(error.message || error, 'error');
        btn.disabled = false;
        btn.innerText = "Join Match";
    }
}

function initChat() {
    const q = query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(50));
    unsubChat = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('chat-messages');
        const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 10;
        
        let html = '';
        const msgs =[];
        snapshot.forEach(doc => msgs.push(doc.data()));
        msgs.reverse(); // oldest first for display

        msgs.forEach(msg => {
            const isMe = msg.userId === auth.currentUser.uid;
            html += `
                <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                    <span class="text-[10px] text-slate-500 mb-0.5 px-1">${isMe ? 'You' : msg.username}</span>
                    <div class="${isMe ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'} px-3 py-2 rounded-2xl max-w-[80%] text-sm break-words">
                        ${msg.message}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        
        if (isScrolledToBottom || msgs.length > 0) {
            container.scrollTop = container.scrollHeight;
        }
    });
}

document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if(!msg || !currentUserData) return;

    input.value = '';
    try {
        await addDoc(collection(db, "chat"), {
            userId: auth.currentUser.uid,
            username: currentUserData.username,
            message: msg,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        showToast('Failed to send message', 'error');
    }
});

function initTransactions(uid) {
    const q = query(collection(db, "transactions"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(20));
    unsubTx = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('transactions-list');
        list.innerHTML = '';
        
        let totalEarnings = 0;
        let joinedCount = 0;

        if(snapshot.empty) {
            list.innerHTML = '<p class="text-slate-500 text-center py-4 text-sm">No transactions yet.</p>';
        } else {
            snapshot.forEach(docSnap => {
                const tx = docSnap.data();
                const date = tx.createdAt ? new Date(tx.createdAt.toDate()).toLocaleDateString() : 'Just now';
                
                let icon, color, sign, text;
                if(tx.type === 'deposit') { icon = 'arrow-down'; color = 'text-green-400'; sign = '+'; text = 'Deposit'; }
                else if(tx.type === 'withdraw') { icon = 'arrow-up'; color = 'text-orange-400'; sign = '-'; text = 'Withdrawal'; }
                else if(tx.type === 'win') { icon = 'trophy'; color = 'text-yellow-400'; sign = '+'; text = 'Winnings'; totalEarnings += tx.amount; }
                else if(tx.type === 'join') { icon = 'gamepad'; color = 'text-red-400'; sign = '-'; text = `Joined ${tx.title||'Match'}`; joinedCount++; }

                let statusHtml = '';
                if(tx.status === 'pending') statusHtml = '<span class="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded ml-2 border border-orange-500/30">Pending</span>';
                else if(tx.status === 'rejected') statusHtml = '<span class="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded ml-2 border border-red-500/30">Rejected</span>';

                list.innerHTML += `
                    <div class="flex justify-between items-center p-3 bg-slate-900 rounded-lg border border-slate-700/50">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                                <i class="fas fa-${icon} ${color} text-sm"></i>
                            </div>
                            <div>
                                <p class="text-sm font-bold text-white flex items-center">${text} ${statusHtml}</p>
                                <p class="text-[10px] text-slate-500">${date}</p>
                            </div>
                        </div>
                        <span class="font-bold ${color}">${sign}₹${tx.amount}</span>
                    </div>
                `;
            });
        }

        // Update profile stats
        document.getElementById('profile-earnings').innerText = `₹${totalEarnings}`;
        document.getElementById('profile-matches').innerText = joinedCount;
    });
}

// Deposit Logic
document.getElementById('deposit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('dep-amount').value);
    const utr = document.getElementById('dep-utr').value.trim();
    const file = document.getElementById('dep-screenshot').files[0];
    const min = currentSettings?.minDeposit || 10;

    if(amount < min) return showToast(`Minimum deposit is ₹${min}`, 'error');
    if(!file) return showToast('Screenshot required', 'error');

    const btn = document.getElementById('btn-submit-deposit');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner mr-2"></div> Uploading...`;

    try {
        // Upload image
        const storageRef = ref(storage, `deposits/${auth.currentUser.uid}_${Date.now()}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        // Save doc
        await addDoc(collection(db, "deposits"), {
            userId: auth.currentUser.uid,
            username: currentUserData.username,
            amount: amount,
            utr: utr,
            screenshot: url,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        // Save Tx
        await addDoc(collection(db, "transactions"), {
            userId: auth.currentUser.uid,
            type: 'deposit',
            amount: amount,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        showToast('Deposit request submitted!', 'success');
        closeModal('deposit-modal');
        document.getElementById('deposit-form').reset();
    } catch (error) {
        showToast('Failed to submit: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Submit Request";
    }
});

// Withdraw Logic
document.getElementById('withdraw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('with-amount').value);
    const upi = document.getElementById('with-upi').value.trim();
    const min = currentSettings?.minWithdraw || 50;

    if(amount < min) return showToast(`Minimum withdraw is ₹${min}`, 'error');
    if(amount > currentUserData.availableBalance) return showToast('Insufficient available balance', 'error');

    const btn = document.getElementById('btn-submit-withdraw');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner mr-2"></div> Processing...`;

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", auth.currentUser.uid);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User not found";
            
            const uData = userDoc.data();
            if(uData.availableBalance < amount) throw "Insufficient balance";

            // Move balance
            transaction.update(userRef, {
                availableBalance: uData.availableBalance - amount,
                lockedBalance: uData.lockedBalance + amount
            });

            // Create withdraw doc
            const wRef = doc(collection(db, "withdraws"));
            transaction.set(wRef, {
                userId: auth.currentUser.uid,
                username: currentUserData.username,
                amount: amount,
                upi: upi,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            // Create Tx
            const txRef = doc(collection(db, "transactions"));
            transaction.set(txRef, {
                userId: auth.currentUser.uid,
                type: 'withdraw',
                amount: amount,
                status: 'pending',
                createdAt: serverTimestamp()
            });
        });

        showToast('Withdrawal request submitted!', 'success');
        closeModal('withdraw-modal');
        document.getElementById('withdraw-form').reset();
    } catch (error) {
        showToast(error.message || error, 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = "Request Withdrawal";
    }
});

// Broadcast Listener
function initBroadcast() {
    const q = query(collection(db, "broadcast"), orderBy("createdAt", "desc"), limit(1));
    unsubBroadcast = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                // Check if old
                if(data.createdAt && (Date.now() - data.createdAt.toMillis() < 60000)) {
                    document.getElementById('broadcast-message').innerText = data.message;
                    const modal = document.getElementById('broadcast-modal');
                    modal.classList.remove('hidden');
                    modal.classList.add('flex');
                    setTimeout(() => {
                        const content = document.getElementById('broadcast-content');
                        content.classList.remove('scale-95', 'opacity-0');
                        content.classList.add('scale-100', 'opacity-100');
                    }, 10);
                }
            }
        });
    });
}
