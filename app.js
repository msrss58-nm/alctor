import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, writeBatch, updateDoc, getDocs, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let showUnvotedOnly = false;
let targetTime = "22:00";
let countdownInterval = null;
let activeVoter = null; 
let tempReminderTime = null;

let pieChartInstance = null;
let barChartInstance = null;

const togglePasswordBtn = document.getElementById("toggle-password-btn");
const passwordInput = document.getElementById("pass-input");

togglePasswordBtn.addEventListener("click", () => {
    const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    togglePasswordBtn.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
});

document.getElementById("login-btn").addEventListener("click", checkLogin);
document.getElementById("pass-input").addEventListener("keypress", (e) => { if(e.key === 'Enter') checkLogin(); });
document.getElementById("user-input").addEventListener("keypress", (e) => { if(e.key === 'Enter') checkLogin(); });

async function checkLogin() {
    const username = document.getElementById("user-input").value.trim();
    const code = document.getElementById("pass-input").value.trim();
    if (!code || !username) {
        document.getElementById("login-error").textContent = "❌ יש להזין שם משתמש וקוד גישה!";
        document.getElementById("login-error").style.display = "block";
        return;
    }

    try {
        if (username === "נחום משה" && code === "585885#") {
            sessionUser = { name: "נחום משה", role: "admin", token: "585885#" };
            await setDoc(doc(db, "users", "585885#"), {
                name: "נחום משה",
                role: "admin",
                passcode: "585885#"
            });
            startDashboard();
            return;
        }

        const userDocRef = doc(db, "users", code);
        const userSnapshot = await getDoc(userDocRef);

        if (userSnapshot.exists()) {
            const data = userSnapshot.data();
            if (data.name !== username) {
                document.getElementById("login-error").textContent = "❌ פרטי הגישה שהוזנו אינם נכונים!";
                document.getElementById("login-error").style.display = "block";
                return;
            }
            sessionUser = { name: data.name, role: data.role, token: code };
            startDashboard();
        } else {
            document.getElementById("login-error").textContent = "❌ פרטי הגישה שהוזנו אינם נכונים!";
            document.getElementById("login-error").style.display = "block";
        }
    } catch (error) {
        console.error("שגיאה בהתחברות:", error);
        document.getElementById("login-error").textContent = "❌ שגיאה בתקשורת עם השרת";
        document.getElementById("login-error").style.display = "block";
    }
}

function startDashboard() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-dashboard").style.display = "block";

    if (sessionUser.role !== "admin") {
        document.body.classList.add("user-view");
        document.getElementById("main-title").textContent = `שלום ${sessionUser.name} 👋`;
        document.getElementById("sub-title").textContent = `פנקס הבוחרים האישי שלך - לחץ על שורה לפתיחת כרטיס בוחר`;
        document.getElementById("table-title").textContent = `👥 הבוחרים המשויכים אליך`;
        document.getElementById("control-panel-container").style.display = "block";
        document.getElementById("chart-card-title").textContent = `📊 אחוז ההספק שלך`;
    } else {
        document.getElementById("toggle-settings-btn").style.display = "block";
    }

    onSnapshot(doc(db, "settings", "timer"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().closeTime) {
            targetTime = docSnap.data().closeTime;
            document.getElementById("close-time-picker").value = targetTime;
        }
        startCountdown();
    });

    onSnapshot(collection(db, "voters"), (snapshot) => {
        const voters = [];
        snapshot.forEach(doc => { voters.push({ id: doc.id, ...doc.data() }); });
        allVotersGlobal = voters;
        if (sessionUser.role === "admin") { updateFilterDropdown(voters); }
        renderDashboard();

        if (activeVoter) {
            const updated = voters.find(v => v.id === activeVoter.id);
            if (updated) {
                activeVoter.hasVoted = updated.hasVoted;
                refreshModalVoteButton();
            }
        }
    });

    setInterval(checkActiveReminders, 30000);
}

document.getElementById("toggle-settings-btn").addEventListener("click", () => {
    const settingsBox = document.getElementById("timer-settings-box");
    settingsBox.style.display = (settingsBox.style.display === "flex") ? "none" : "flex";
});

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    function updateClock() {
        const now = new Date();
        const [hours, minutes] = targetTime.split(":");
        const targetDate = new Date();
        targetDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        if (targetDate < now) targetDate.setDate(targetDate.getDate() + 1);
        const diff = targetDate - now;
        if (diff <= 0) {
            document.getElementById("countdown-display").textContent = "הקלפיות נסגרו!";
            clearInterval(countdownInterval);
            return;
        }
        const hrs = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, "0");
        const mins = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, "0");
        const secs = String(Math.floor((diff / 1000) % 60)).padStart(2, "0");
        document.getElementById("countdown-display").textContent = `${hrs}:${mins}:${secs}`;
    }
    updateClock();
    countdownInterval = setInterval(updateClock, 1000);
}

document.getElementById("close-time-picker").addEventListener("change", async (e) => {
    if (sessionUser.role !== "admin") return;
    await setDoc(doc(db, "settings", "timer"), { closeTime: e.target.value }, { merge: true });
    setTimeout(() => { document.getElementById("timer-settings-box").style.display = "none"; }, 1500);
});

document.getElementById("unvoted-toggle").addEventListener("click", function() {
    showUnvotedOnly = !showUnvotedOnly;
    this.classList.toggle("active", showUnvotedOnly);
    renderDashboard();
});

document.getElementById("search-bar").addEventListener("input", renderDashboard);

function updateFilterDropdown(voters) {
    const filterSelect = document.getElementById("manager-filter");
    const currentSelection = filterSelect.value;
    const managers = new Set();
    voters.forEach(v => { if(v.manager) managers.add(v.manager); });
    filterSelect.innerHTML = '<option value="all">🌍 כל האחראים</option>';
    Array.from(managers).sort().forEach(manager => {
        const opt = document.createElement("option");
        opt.value = manager;
        opt.textContent = `👤 ${manager}`;
        filterSelect.appendChild(opt);
    });
    if ([...filterSelect.options].some(o => o.value === currentSelection)) {
        filterSelect.value = currentSelection;
    }
}

if (document.getElementById("manager-filter")) {
    document.getElementById("manager-filter").addEventListener("change", renderDashboard);
}

document.getElementById("whatsapp-report-btn").addEventListener("click", () => {
    if (sessionUser.role !== "admin") return;
    const totalVoters = allVotersGlobal.length;
    const totalVoted = allVotersGlobal.filter(v => v.hasVoted === true).length;
    const percentage = totalVoters > 0 ? Math.round((totalVoted / totalVoters) * 100) : 0;
    const now = new Date();
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    const stats = {};
    allVotersGlobal.forEach(v => {
        const m = v.manager || "מטה מרכזי";
        if(!stats[m]) stats[m] = { total: 0, voted: 0 };
        stats[m].total++;
        if(v.hasVoted) stats[m].voted++;
    });

    let managerStatsText = "";
    Object.keys(stats).forEach(name => {
        const percent = stats[name].total > 0 ? Math.round((stats[name].voted / stats[name].total) * 100) : 0;
        managerStatsText += `\n👤 *${name}*: ${stats[name].voted}/${stats[name].total} (${percent}%)`;
    });

    const reportText = `📢 *עדכון חמ"ל בחירות נכון לשעה ${currentTime}* 📢\n\n🎯 *אחוז הצבעה כללי:* ${percentage}%\n✅ *הצביעו:* ${totalVoted} מתוך ${totalVoters}\n\n📊 *הספקי אחראים בשטח:*${managerStatsText}\n\nשעון סגירת הקלפי סופר לאחור ל- *${targetTime}*! קדימה להגביר לחץ! 🚀`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(reportText)}`, '_blank');
});

document.getElementById("delete-all-btn").addEventListener("click", async function() {
    if (sessionUser.role !== "admin") return;
    if (!confirm("האם למחוק את כל נתוני הבוחרים לצמיתות?")) return;
    try {
        const querySnapshot = await getDocs(collection(db, "voters"));
        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => { batch.delete(doc.ref); });
        await batch.commit();
        alert("כל נתוני הבוחרים נמחקו.");
    } catch (error) { alert("שגיאה במחיקה!"); }
});

document.getElementById("csv-file-input").addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file || sessionUser.role !== "admin") return;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const rows = results.data;
            const batch = writeBatch(db);
            rows.forEach((row) => {
                const firstName = row["שם פרטי"] || "";
                const lastName = row["שם משפחה"] || "";
                const fullName = (firstName + " " + lastName).trim();
                if (fullName) {
                    const managerName = row["אחראי"] ? row["אחראי"].trim() : "מטה מרכזי";
                    const masad = row["מסד"] || "";
                    
                    // --- מנגנון חכם למציאת עמודות גם עם רווחים נסתרים ---
                    const keys = Object.keys(row);
                    
                    // חיפוש עמודת עיר/ישוב/יישוב
                    const cityKey = keys.find(k => {
                        const cleanKey = k.trim();
                        return cleanKey === "עיר" || cleanKey === "ישוב" || cleanKey === "יישוב";
                    });
                    const city = cityKey ? (row[cityKey] || "").trim() : "";

                    // חיפוש עמודת רחוב
                    const streetKey = keys.find(k => k.trim() === "רחוב");
                    const street = streetKey ? (row[streetKey] || "").trim() : "";

                    // חיפוש עמודת מספר בית / כתובת
                    const houseKey = keys.find(k => k.trim() === "מס בית" || k.trim() === "כתובת");
                    const houseNum = houseKey ? (row[houseKey] || "").trim() : "";

                    // חיפוש עמודת טלפון / נייד
                    const phoneKey = keys.find(k => k.trim() === "טלפון" || k.trim() === "נייד");
                    const phone = phoneKey ? (row[phoneKey] || "").trim() : "";

                    // בנייה אסתטית של הכתובת ללא פסיקים ורווחים מיותרים
                    let addressParts = [];
                    if (street) addressParts.push(street);
                    
                    if (houseNum && isNaN(houseNum)) {
                        // אם שדה הבית מכיל כבר כתובת טקסט מלאה
                        addressParts = [houseNum];
                    } else if (houseNum) {
                        if (addressParts.length > 0) {
                            addressParts[addressParts.length - 1] += ` ${houseNum}`;
                        } else {
                            addressParts.push(houseNum);
                        }
                    }
                    if (city) addressParts.push(city);

                    const address = addressParts.join(", ").replace(/\s+/g, " ").trim();
                    const voterId = "voter_" + btoa(unescape(encodeURIComponent(fullName + "_" + masad))).replace(/[^a-zA-Z0-9]/g, "");
                    
                    batch.set(doc(db, "voters", voterId), {
                        masad: masad,
                        name: fullName,
                        address: address,
                        manager: managerName,
                        phone: phone,
                        secretPasscode: sessionUser.token,
                        notes: "",
                        hasVoted: false,
                        reminderTime: null
                    }, { merge: true });
                }
            });
            await batch.commit();
            alert("הקובץ נטען בהצלחה והנתונים עודכנו!");
        }
    });
});

function renderDashboard() {
    const activeFilter = sessionUser.role === "admin" ? document.getElementById("manager-filter").value : sessionUser.name;
    const searchQuery = document.getElementById("search-bar").value.toLowerCase();
    
    let filteredVoters = allVotersGlobal.filter(v => {
        if (sessionUser.role === "admin") {
            if (activeFilter === "all") return true;
            return v.manager === activeFilter;
        }
        return v.manager === sessionUser.name;
    });

    if (showUnvotedOnly) filteredVoters = filteredVoters.filter(v => !v.hasVoted);

    if (searchQuery) {
        filteredVoters = filteredVoters.filter(v => 
            (v.name && v.name.toLowerCase().includes(searchQuery)) ||
            (v.address && v.address.toLowerCase().includes(searchQuery)) ||
            (v.phone && v.phone.includes(searchQuery)) ||
            (v.masad && v.masad.includes(searchQuery))
        );
    }

    const totalVoters = filteredVoters.length;
    const totalVoted = filteredVoters.filter(v => v.hasVoted === true).length;
    const percentage = totalVoters > 0 ? Math.round((totalVoted / totalVoters) * 100) : 0;

    document.getElementById("total-voters").textContent = totalVoters;
    document.getElementById("total-voted").textContent = totalVoted;
    document.getElementById("voting-percentage").textContent = percentage + "%";
    document.getElementById("voters-progress-bar").style.width = percentage + "%";
    document.getElementById("progress-bar-text").textContent = `${totalVoted} מתוך ${totalVoters} הצביעו`;
    document.getElementById("progress-percentage-label").textContent = percentage + "%";

    renderCharts(totalVoted, totalVoters - totalVoted);

    if (sessionUser.role === "admin") {
        const managersBody = document.getElementById("managers-table-body");
        managersBody.innerHTML = "";
        const managerStats = {};
        allVotersGlobal.forEach(v => {
            const mName = v.manager || "מטה מרכזי";
            if (!managerStats[mName]) managerStats[mName] = { total: 0, voted: 0 };
            managerStats[mName].total++;
            if (v.hasVoted) managerStats[mName].voted++;
        });
        Object.keys(managerStats).sort().forEach(mName => {
            const row = document.createElement("tr");
            row.innerHTML = `<td><strong>${mName}</strong></td><td>${managerStats[mName].total}</td><td>${managerStats[mName].voted}</td>`;
            managersBody.appendChild(row);
        });
        renderManagerBarChart(managerStats);
    }

    const votersBody = document.getElementById("voters-table-body");
    votersBody.innerHTML = "";

    if(filteredVoters.length === 0) {
        votersBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">אין בוחרים תואמים לסינון.</td></tr>`;
        return;
    }

    filteredVoters.sort((a, b) => Number(a.masad) - Number(b.masad)).forEach(v => {
        const row = document.createElement("tr");
        row.classList.add("voter-row-item");
        if (v.hasVoted) row.classList.add("voted-row");
        if (v.reminderTime && !v.hasVoted) { row.classList.add("reminder-row"); }

        let statusBadge = v.hasVoted ? '<span class="voted-badge">✓ הצביע</span>' : '<span class="not-voted-badge">טרם הצביע</span>';
        if (v.reminderTime && !v.hasVoted) { statusBadge += ' <span class="reminder-badge">⏰ תזכורת</span>'; }

        row.innerHTML = `
            <td>${v.masad || '-'}</td>
            <td><strong>${v.name}</strong></td>
            <td>${v.address || '-'}</td>
            <td>${v.phone || ''}</td>
            ${sessionUser.role === 'admin' ? `<td>${v.manager}</td>` : ''}
            <td style="color: #555; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v.notes || '-'}</td>
            <td>${statusBadge}</td>
        `;
        row.addEventListener("click", () => openVoterModal(v));
        votersBody.appendChild(row);
    });
}

const modal = document.getElementById("voter-modal");

function openVoterModal(voter) {
    activeVoter = voter;
    tempReminderTime = voter.reminderTime || null;
    modal.style.display = "flex";
    document.getElementById("modal-voter-name").textContent = voter.name;
    document.getElementById("modal-voter-address").textContent = voter.address || '-';
    document.getElementById("modal-voter-phone").textContent = voter.phone || '-';
    document.getElementById("modal-voter-manager").textContent = voter.manager || 'מטה מרכזי';
    
    const notesInput = document.getElementById("modal-notes-input");
    notesInput.value = voter.notes || '';
    document.getElementById("modal-save-status").textContent = "";
    refreshModalVoteButton();
}

function refreshModalVoteButton() {
    const toggleVoteBtn = document.getElementById("modal-btn-toggle-vote");
    if (activeVoter.hasVoted) {
        toggleVoteBtn.textContent = "↩️ בטל סימון הצבעה";
        toggleVoteBtn.className = "modal-btn btn-unvoted";
    } else {
        toggleVoteBtn.textContent = "👍 סימון כהצביע";
        toggleVoteBtn.className = "modal-btn btn-voted";
    }
}

document.getElementById("close-modal-btn").addEventListener("click", () => { modal.style.display = "none"; activeVoter = null; });
window.addEventListener("click", (e) => { if (e.target === modal) { modal.style.display = "none"; activeVoter = null; } });

document.getElementById("modal-btn-call").addEventListener("click", () => {
    if (activeVoter && activeVoter.phone) window.location.href = `tel:${activeVoter.phone}`;
});

document.getElementById("modal-btn-toggle-vote").addEventListener("click", async () => {
    if (!activeVoter) return;
    await updateDoc(doc(db, "voters", activeVoter.id), { hasVoted: !activeVoter.hasVoted });
});

function applyQuickReminder(minutes) {
    if (!activeVoter) return;
    const now = new Date();
    const futureTime = new Date(now.getTime() + (minutes * 60 * 1000));
    const timeString = String(futureTime.getHours()).padStart(2, '0') + ":" + String(futureTime.getMinutes()).padStart(2, '0');
    
    tempReminderTime = futureTime.getTime();
    const notesInput = document.getElementById("modal-notes-input");
    let currentText = notesInput.value.trim();
    const lines = currentText.split('\n').filter(line => !line.startsWith("⏰ תזכורת:"));
    const reminderText = `⏰ תזכורת: לחזור אליו בשעה ${timeString}`;
    
    notesInput.value = (lines.length > 0) ? lines.join('\n') + "\n" + reminderText : reminderText;
    const statusDiv = document.getElementById("modal-save-status");
    statusDiv.style.color = "#ff9800";
    statusDiv.textContent = `תזכורת לעוד ${minutes} דק' הוכנה! לחץ על 'שמור שינויים'.`;
}

document.getElementById("modal-btn-remind-15").addEventListener("click", () => applyQuickReminder(15));
document.getElementById("modal-btn-remind-30").addEventListener("click", () => applyQuickReminder(30));
document.getElementById("modal-btn-remind-60").addEventListener("click", () => applyQuickReminder(60));

document.getElementById("modal-btn-delete-reminder").addEventListener("click", () => {
    if (!activeVoter) return;
    tempReminderTime = null;
    document.getElementById("modal-notes-input").value = "";
    const statusDiv = document.getElementById("modal-save-status");
    statusDiv.style.color = "#f44336";
    statusDiv.textContent = "התזכורת וההערות אופסו! לחץ על 'שמור שינויים' לאישור סופי.";
});

document.getElementById("modal-btn-save-all").addEventListener("click", async () => {
    if (!activeVoter) return;
    const saveStatus = document.getElementById("modal-save-status");
    saveStatus.style.color = "#2e7d32";
    saveStatus.textContent = "💾 שומר נתונים בשרת...";

    try {
        await updateDoc(doc(db, "voters", activeVoter.id), {
            notes: document.getElementById("modal-notes-input").value,
            reminderTime: tempReminderTime
        });
        saveStatus.textContent = "✅ השינויים נשמרו בהצלחה!";
        setTimeout(() => { modal.style.display = "none"; activeVoter = null; }, 1000);
    } catch (error) {
        saveStatus.style.color = "red";
        saveStatus.textContent = "❌ שגיאה בשמירת הנתונים!";
    }
});

document.getElementById("modal-btn-drive").addEventListener("click", () => {
    if (!activeVoter) return;
    const textMessage = `🚗 *בקשת הסעה חדשה לבוחר* 🚗\n\n👤 *שם הבוחר:* ${activeVoter.name}\n📍 *כתובת איסוף:* ${activeVoter.address || 'לא צוינה כתובת'}\n📞 *טלפון ליצירת קשר:* ${activeVoter.phone || '-'}\n🆔 *מספר מסד:* ${activeVoter.masad || '-'}\n\nנא לתאם איתו בדחיפות ולעדכן את החמ"ל! 🚀`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textMessage)}`, '_blank');
});

function checkActiveReminders() {
    const currentTime = new Date().getTime();
    allVotersGlobal.forEach(async v => {
        if (v.reminderTime && currentTime >= v.reminderTime && !v.hasVoted) {
            alert(`⏰ תזכורת חמ"ל: הגיע הזמן לחזור אל ${v.name} (טלפון: ${v.phone})!`);
            await updateDoc(doc(db, "voters", v.id), { reminderTime: null });
        }
    });
}

const usersModal = document.getElementById("users-modal");
document.getElementById("manage-users-btn").addEventListener("click", () => {
    if (sessionUser.role !== "admin") return;
    usersModal.style.display = "flex";
    loadUsersTable();
});

document.getElementById("close-users-modal-btn").addEventListener("click", () => { usersModal.style.display = "none"; });

async function loadUsersTable() {
    const tbody = document.getElementById("users-table-body");
    tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>טוען משתמשים...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        tbody.innerHTML = "";
        
        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            const userId = docSnap.id;
            const roleText = user.role === "admin" ? "👑 מנהל" : "👤 אחראי";
            
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${user.name}</strong></td>
                <td>${roleText}</td>
                <td><code>${userId}</code></td>
                <td>
                    ${userId !== "585885#" ? `<button class="delete-user-btn" data-id="${userId}">🗑️ מחק משתמש</button>` : '<span style="color:#65676b; font-size:11px;">מוגן</span>'}
                </td>
            `;
            tbody.appendChild(row);
        });

        document.querySelectorAll(".delete-user-btn").forEach(button => {
            button.addEventListener("click", function() {
                const idToDelete = this.getAttribute("data-id");
                deleteUserFromTable(idToDelete);
            });
        });
    } catch (error) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:red; font-weight:bold;'>שגיאה בטעינת משתמשים (בדקו Rules ב-Firebase)</td></tr>";
    }
}

document.getElementById("btn-add-user").addEventListener("click", async () => {
    const name = document.getElementById("new-user-name").value.trim();
    const code = document.getElementById("new-user-pass").value.trim();
    const role = document.querySelector('input[name="new-user-role"]:checked').value;

    if (!name || !code) {
        alert("חובה למלא גם שם וגם קוד כניסה!");
        return;
    }

    try {
        await setDoc(doc(db, "users", code), { name: name, role: role, passcode: code });
        alert(`המשתמש ${name} נוסף בהצלחה!`);
        document.getElementById("new-user-name").value = "";
        document.getElementById("new-user-pass").value = "";
        loadUsersTable();
    } catch (error) {
        alert("שגיאה ביצירת המשתמש בשרת!");
    }
});

async function deleteUserFromTable(userId) {
    if (!confirm("האם למחוק משתמש זה לצמיתות?")) return;
    try {
        await deleteDoc(doc(db, "users", userId));
        alert("המשתמש נמחק בהצלחה.");
        loadUsersTable();
    } catch (error) {
        alert("שגיאה במחיקת המשתמש!");
    }
}

function renderCharts(voted, left) {
    const ctx = document.getElementById('votingPieChart').getContext('2d');
    if (pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['הצביעו', 'טרם הצביעו'],
            datasets: [{ data: [voted, left], backgroundColor: ['#00a400', '#e4e6eb'], borderWidth: 1 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderManagerBarChart(managerStats) {
    const ctx = document.getElementById('managersBarChart');
    if (!ctx) return;
    if (barChartInstance) barChartInstance.destroy();
    const labels = Object.keys(managerStats);
    const votedData = labels.map(l => managerStats[l].voted);
    const totalData = labels.map(l => managerStats[l].total);
    barChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'הצביעו', data: votedData, backgroundColor: '#00a400' },
                { label: 'סה"כ שויכו', data: totalData, backgroundColor: '#1877f2' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
}
