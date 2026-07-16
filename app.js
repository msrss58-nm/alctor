import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBGnj7We6qvsY0pffKRhAMIHWW8lZu7Usc",
    authDomain: "elections-db1e5.firebaseapp.com",
    projectId: "elections-db1e5",
    storageBucket: "elections-db1e5.firebasestorage.app",
    messagingSenderId: "686747103168",
    appId: "1:686747103168:web:56e8291433f3ca0459a226"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let sessionUser = null;
let allVotersGlobal = [];
let targetTime = "22:00";
let countdownInterval = null;
let activeVoter = null;

document.getElementById("login-btn").addEventListener("click", checkLogin);

async function checkLogin() {
    const code = document.getElementById("pass-input").value.trim();
    if (code === "1111") {
        sessionUser = { name: "מנהל מערכת", role: "admin" };
        startDashboard();
    } else {
        document.getElementById("login-error").style.display = "block";
    }
}

function startDashboard() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-dashboard").style.display = "block";
    
    onSnapshot(doc(db, "settings", "timer"), (docSnap) => {
        if (docSnap.exists()) targetTime = docSnap.data().closeTime;
        startCountdown();
    });

    onSnapshot(collection(db, "voters"), (snapshot) => {
        allVotersGlobal = [];
        snapshot.forEach(doc => { allVotersGlobal.push({ id: doc.id, ...doc.data() }); });
        renderDashboard();
    });
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        document.getElementById("countdown-display").textContent = "הקלפיות נסגרו ל-" + targetTime;
    }, 1000);
}

function renderDashboard() {
    const votersBody = document.getElementById("voters-table-body");
    votersBody.innerHTML = "";
    allVotersGlobal.forEach(v => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${v.masad || '-'}</td><td>${v.name}</td><td>${v.hasVoted ? '✅' : '❌'}</td>`;
        row.addEventListener("click", () => openVoterModal(v));
        votersBody.appendChild(row);
    });
}

const modal = document.getElementById("voter-modal");
function openVoterModal(voter) {
    activeVoter = voter;
    modal.style.display = "flex";
    document.getElementById("modal-voter-name").textContent = voter.name;
}

document.getElementById("modal-btn-toggle-vote").addEventListener("click", async () => {
    if (!activeVoter) return;
    await updateDoc(doc(db, "voters", activeVoter.id), { hasVoted: !activeVoter.hasVoted });
    modal.style.display = "none";
});

document.getElementById("close-modal-btn").addEventListener("click", () => { modal.style.display = "none"; });
