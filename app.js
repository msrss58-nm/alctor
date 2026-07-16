import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let allVotersGlobal = [];
let activeVoter = null;

document.getElementById("login-btn").addEventListener("click", () => {
    if (document.getElementById("pass-input").value === "1111") {
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("main-dashboard").style.display = "block";
    } else {
        document.getElementById("login-error").style.display = "block";
    }
});

onSnapshot(collection(db, "voters"), (snapshot) => {
    allVotersGlobal = [];
    snapshot.forEach(doc => { allVotersGlobal.push({ id: doc.id, ...doc.data() }); });
    renderDashboard();
});

function renderDashboard() {
    const body = document.getElementById("voters-table-body");
    body.innerHTML = "";
    allVotersGlobal.sort((a,b) => (a.masad || "").localeCompare(b.masad || "")).forEach(v => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${v.masad || '-'}</td><td>${v.name || ''}</td><td>${v.hasVoted ? '✅ הצביע' : '❌ טרם הצביע'}</td>`;
        row.onclick = () => openVoterModal(v);
        body.appendChild(row);
    });
}

function openVoterModal(voter) {
    activeVoter = voter;
    document.getElementById("voter-modal").style.display = "flex";
    document.getElementById("modal-voter-name").textContent = voter.name;
}

document.getElementById("modal-btn-toggle-vote").onclick = async () => {
    await updateDoc(doc(db, "voters", activeVoter.id), { hasVoted: !activeVoter.hasVoted });
    document.getElementById("voter-modal").style.display = "none";
};

document.getElementById("close-modal-btn").onclick = () => document.getElementById("voter-modal").style.display = "none";

document.getElementById("export-csv-btn").onclick = () => {
    const header = ["מסד", "שם מלא", "סטטוס"];
    const rows = allVotersGlobal.map(v => [v.masad || "", v.name || "", v.hasVoted ? "הצביע" : "טרם הצביע"]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "דוח_בוחרים.csv";
    link.click();
};
