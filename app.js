.import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, writeBatch, updateDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// קונפיגורציית ה-Firebase
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
let selectedVoterIds = [];

let pieChartInstance = null;
let barChartInstance = null;

// מאזיני כניסה
document.getElementById("login-btn").addEventListener("click", checkLogin);
document.getElementById("pass-input").addEventListener("keypress", (e) => { if(e.key === 'Enter') checkLogin(); });

async function checkLogin() {
    const code = document.getElementById("pass-input").value.trim();
    if (!code) {
        document.getElementById("login-error").style.display = "block";
        return;
    }
    
    if (code === "1111") {
        sessionUser = { name: "מנהל מערכת", role: "admin", token: code };
        startDashboard();
        return;
    }
    
    try {
        const usersSnapshot = await getDocs(collection(db, "managers"));
        let user = null;
        
        usersSnapshot.forEach(doc => {
            if (doc.data().password === code && !doc.data().deleted) {
                const managerData = doc.data();
                user = { 
                    id: doc.id, 
                    name: managerData.name, 
                    role: managerData.role,
                    assignedVoters: managerData.assignedVoters || [],
                    token: code 
                };
            }
        });
        
        if (user) {
            sessionUser = user;
            startDashboard();
        } else {
            document.getElementById("login-error").style.display = "block";
        }
    } catch (error) {
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
        const adminBtn = document.createElement("button");
        adminBtn.textContent = "👨‍💼 ניהול מנהלים";
        adminBtn.style.cssText = "background: #7c3aed; color: white; padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; border: none;";
        adminBtn.id = "admin-management-btn";
        document.querySelector('.admin-only').parentElement.insertBefore(adminBtn, document.querySelector('.admin-only'));
        
        document.getElementById("admin-management-btn").addEventListener("click", openUsersManagement);
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
        snapshot.forEach(doc => {
            voters.push({ id: doc.id, ...doc.data() });
        });
        allVotersGlobal = voters;
        if (sessionUser.role === "admin") {
            updateFilterDropdown(voters);
        }
        renderDashboard();

        if (activeVoter) {
            const updated = voters.find(v => v.id === activeVoter.id);
            if (updated) {
                activeVoter = updated;
                refreshModalData();
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

function getVoterAddressParts(voter) {
    const street = voter.addressStreet || "";
    const houseNumber = voter.addressHouseNumber || "";
    const city = voter.addressCity || "";

    if (street || houseNumber || city) {
        return { street, houseNumber, city };
    }

    const addressText = voter.address || "";
    const parts = addressText.split(",").map(part => part.trim()).filter(Boolean);
    return {
        street: parts[0] || "",
        houseNumber: parts[1] || "",
        city: parts[2] || ""
    };
}

function escapeCsvValue(value) {
    if (value === null || value === undefined) return "";
    const stringValue = String(value).replace(/"/g, '""');
    // אם הערך מכיל פסיק או ירידת שורה, אנו עוטפים במרכאות כפולות
    if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes("\r")) {
        return `"${stringValue}"`;
    }
    return stringValue;
}

function exportFilteredVotersToCsv() {
    const activeFilter = sessionUser.role === "admin" ? document.getElementById("manager-filter").value : null;
    const searchQuery = document.getElementById("search-bar").value.toLowerCase();

    let filteredVoters = allVotersGlobal;
    
    if (sessionUser.role === "user") {
        filteredVoters = filteredVoters.filter(v => 
            sessionUser.assignedVoters && sessionUser.assignedVoters.includes(v.id)
        );
    } else if (activeFilter && activeFilter !== "all") {
        filteredVoters = filteredVoters.filter(v => v.manager === activeFilter);
    }

    if (showUnvotedOnly) filteredVoters = filteredVoters.filter(v => !v.hasVoted);

    if (searchQuery) {
        filteredVoters = filteredVoters.filter(v => 
            (v.name && v.name.toLowerCase().includes(searchQuery)) ||
            (v.address && v.address.toLowerCase().includes(searchQuery)) ||
            (v.phone && v.phone.includes(searchQuery)) ||
            (v.masad && v.masad.includes(searchQuery))
        );
    }

    const rows = filteredVoters
        .sort((a, b) => Number(a.masad) - Number(b.masad))
        .map(v => {
            const addressParts = getVoterAddressParts(v);
            return [
                v.masad || "",
                v.name || "",
                addressParts.street || "",
                addressParts.houseNumber || "",
                addressParts.city || "",
                v.address || "",
                v.phone || "",
                v.manager || "מטה מרכזי",
                v.notes || "",
                v.hasVoted ? "הצביע" : "טרם הצביע",
                v.reminderTime && !v.hasVoted ? "כן" : "לא"
            ];
        });

    const header = ["מסד", "שם מלא", "רחוב", "מס בית", "עיר", "כתובת מלאה", "טלפון", "אחראי", "הערות", "סטטוס", "תזכורת"];
    
    // שימוש בפסיק כמפריד תקני לפורמט CSV
    const csvLines = [header.join(",")];
    rows.forEach(row => csvLines.push(row.map(escapeCsvValue).join(",")));
    
    const csvContent = csvLines.join("\n");

    // תיקון קריטי: המרת הטקסט למערך ביטים של UTF-8 אמיתי כולל ה-BOM כחלק מה-Uint8Array
    const encoder = new TextEncoder();
    const bomArray = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM
    const csvArray = encoder.encode(csvContent);
    
    // מיזוג ה-BOM והקוד הבינארי ביחד
    const mergedArray = new Uint8Array(bomArray.length + csvArray.length);
    mergedArray.set(bomArray, 0);
    mergedArray.set(csvArray, bomArray.length);

    // יצירת ה-Blob עם הקידוד המפורש והמערך הבינארי השלם
    const blob = new Blob([mergedArray], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voters_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

document.getElementById("export-csv-btn").addEventListener("click", exportFilteredVotersToCsv);

document.getElementById("csv-file-input").addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file || sessionUser.role !== "admin") return;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            const rows = results.data;
            if (rows.length === 0) {
                alert("הקובץ ריק או אינו ניתן לקריאה");
                return;
            }
            
            const batch = writeBatch(db);
            rows.forEach((row) => {
                const normalizedRow = {};
                Object.entries(row || {}).forEach(([key, value]) => {
                    normalizedRow[key ? String(key).trim() : ""] = value ? String(value).trim() : "";
                });
                
                let firstName = normalizedRow["שם פרטי"] || normalizedRow["FirstName"] || "";
                let lastName = normalizedRow["שם משפחה"] || normalizedRow["LastName"] || "";
                let masad = normalizedRow["מסד"] || normalizedRow["ID"] || "";
                let phone = normalizedRow["טלפון"] || normalizedRow["Phone"] || normalizedRow["נייד"] || "";
                let manager = normalizedRow["אחראי"] || normalizedRow["Manager"] || "";
                let street = normalizedRow["רחוב"] || normalizedRow["Street"] || "";
                let houseNum = normalizedRow["מס בית"] || normalizedRow["HouseNum"] || "";
                let city = normalizedRow["עיר"] || normalizedRow["City"] || "";
                
                if (!firstName && !lastName && !masad) {
                    const allKeys = Object.keys(normalizedRow);
                    if (allKeys.length >= 8) {
                        masad = normalizedRow[allKeys[0]] || "";
                        firstName = normalizedRow[allKeys[1]] || "";
                        lastName = normalizedRow[allKeys[2]] || "";
                        street = normalizedRow[allKeys[3]] || "";
                        houseNum = normalizedRow[allKeys[4]] || "";
                        city = normalizedRow[allKeys[5]] || "";
                        phone = normalizedRow[allKeys[6]] || "";
                        manager = normalizedRow[allKeys[7]] || "";
                    }
                }
                
                const fullName = (firstName + " " + lastName).trim();
                if (fullName) {
                    const managerName = manager ? String(manager).trim() : "מטה מרכזי";
                    const address = [street, houseNum, city].filter(Boolean).join(", ").trim();
                    const voterId = "voter_" + btoa(unescape(encodeURIComponent(fullName + "_" + masad))).replace(/[^a-zA-Z0-9]/g, "");
                    
                    batch.set(doc(db, "voters", voterId), {
                        masad: masad,
                        name: fullName,
                        address: address,
                        addressStreet: street,
                        addressHouseNumber: houseNum,
                        addressCity: city,
                        manager: managerName,
                        phone: phone.trim(),
                        secretPasscode: sessionUser.token,
                        notes: "",
                        hasVoted: false,
                        reminderTime: null
                    }, { merge: true });
                }
            });
            await batch.commit();
            alert("הקובץ נטען בהצלחה!");
        }
    });
});

function renderDashboard() {
    let filteredVoters = allVotersGlobal;
    
    if (sessionUser.role === "user") {
        filteredVoters = filteredVoters.filter(v => 
            sessionUser.assignedVoters && sessionUser.assignedVoters.includes(v.id)
        );
    } else if (sessionUser.role === "admin") {
        const activeFilter = document.getElementById("manager-filter").value;
        if (activeFilter !== "all") {
            filteredVoters = filteredVoters.filter(v => v.manager === activeFilter);
        }
    }

    const searchQuery = document.getElementById("search-bar").value.toLowerCase();
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
        
        if (v.reminderTime && !v.hasVoted) {
            row.classList.add("reminder-row");
        }

        let statusBadge = v.hasVoted ? '<span class="voted-badge">✓ הצביע</span>' : '<span class="not-voted-badge">טרם הצביע</span>';
        if (v.reminderTime && !v.hasVoted) {
            statusBadge += ' <span class="reminder-badge">⏰ תזכורת</span>';
        }

        row.innerHTML = `
            <td>${v.masad || '-'}</td>
            <td><strong>${v.name}</strong></td>
            <td>${v.addressStreet || '-'}</td>
            <td>${v.addressHouseNumber || '-'}</td>
            <td>${v.addressCity || '-'}</td>
            <td>${v.phone || ''}</td>
            ${sessionUser.role === 'admin' ? `<td>${v.manager}</td>` : ''}
            <td style="color: #555; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v.notes || '-'}</td>
            <td>${statusBadge}</td>
        `;

        row.addEventListener("click", () => openVoterModal(v));
        votersBody.appendChild(row);
    });
}

const modal = document.getElementById("voter-modal");

function openVoterModal(voter) {
    activeVoter = voter;
    modal.style.display = "flex";
    
    document.getElementById("modal-voter-name").textContent = voter.name;
    const addressParts = getVoterAddressParts(voter);
    const fullAddress = [addressParts.street, addressParts.houseNumber, addressParts.city].filter(Boolean).join(", ") || '-';
    document.getElementById("modal-voter-address").textContent = fullAddress;
    document.getElementById("modal-voter-masad").textContent = voter.masad || '-';
    document.getElementById("modal-voter-phone").textContent = voter.phone || '-';
    document.getElementById("modal-voter-manager").textContent = voter.manager || 'מטה מרכזי';
    
    const notesInput = document.getElementById("modal-notes-input");
    notesInput.value = voter.notes || '';
    document.getElementById("modal-save-status").textContent = "";

    notesInput.oninput = (e) => {
        debouncedSaveNotes(activeVoter.id, e.target.value);
    };

    refreshModalData();
}

function refreshModalData() {
    const toggleVoteBtn = document.getElementById("modal-btn-toggle-vote");
    if (activeVoter.hasVoted) {
        toggleVoteBtn.textContent = "↩️ בטל סימון הצבעה";
        toggleVoteBtn.className = "modal-btn btn-unvoted";
    } else {
        toggleVoteBtn.textContent = "👍 סימון כהצביע";
        toggleVoteBtn.className = "modal-btn btn-voted";
    }
}

async function openUsersManagement() {
    if (sessionUser.role !== "admin") return;
    document.getElementById("users-management-modal").style.display = "flex";
    await populateVotersSelector();
    await updateManagersList();
}

async function populateVotersSelector() {
    const selector = document.getElementById("voters-selector");
    selector.innerHTML = "";
    selectedVoterIds = [];
    try {
        const votersSnapshot = await getDocs(collection(db, "voters"));
        votersSnapshot.forEach(doc => {
            const voter = doc.data();
            const label = document.createElement("label");
            label.style.cssText = "display: block; padding: 8px; cursor: pointer; border-bottom: 1px solid #f0f2f5;";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = doc.id;
            checkbox.style.marginLeft = "8px";
            checkbox.addEventListener("change", (e) => {
                if (e.target.checked) {
                    if (!selectedVoterIds.includes(doc.id)) selectedVoterIds.push(doc.id);
                } else {
                    selectedVoterIds = selectedVoterIds.filter(id => id !== doc.id);
                }
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(`${voter.name} (${voter.masad})`));
            selector.appendChild(label);
        });
    } catch (error) {
        console.error("Error loading voters:", error);
    }
}

async function updateManagersList() {
    const tbody = document.getElementById("managers-list-body");
    try {
        const managersSnapshot = await getDocs(collection(db, "managers"));
        tbody.innerHTML = "";
        managersSnapshot.forEach(doc => {
            const manager = doc.data();
            if (manager.deleted) return;
            const roleDisplay = manager.role === "admin" ? "🔑 מנהל" : "👤 אחראי";
            const voterCount = manager.assignedVoters ? manager.assignedVoters.length : 0;
            const row = document.createElement("tr");
            row.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid #e4e6eb;">${manager.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e4e6eb; font-family: monospace; font-weight: bold;">${manager.password}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e4e6eb;">${roleDisplay}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e4e6eb; text-align: center;">${voterCount}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e4e6eb;">
                    <button id="del-mgr-${doc.id}" style="padding: 5px 10px; background: #f02849; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ מחק</button>
                </td>
            `;
            tbody.appendChild(row);
            
            document.getElementById(`del-mgr-${doc.id}`).addEventListener("click", () => deleteManager(doc.id));
        });
    } catch (error) {
        console.error("Error loading managers:", error);
    }
}

async function deleteManager(managerId) {
    if (!confirm("האם למחוק מנהל זה?")) return;
    try {
        await updateDoc(doc(db, "managers", managerId), { deleted: true });
        await updateManagersList();
    } catch (error) {
        alert("שגיאה במחיקה!");
    }
}

document.getElementById("new-manager-role").addEventListener("change", (e) => {
    if (e.target.value === "user") {
        document.getElementById("voters-label").style.display = "block";
        document.getElementById("voters-selector").style.display = "block";
    } else {
        document.getElementById("voters-label").style.display = "none";
        document.getElementById("voters-selector").style.display = "none";
        selectedVoterIds = [];
    }
});

document.getElementById("save-manager-btn").addEventListener("click", async () => {
    const managerName = document.getElementById("new-manager-name").value.trim();
    const managerPassword = document.getElementById("new-manager-password").value.trim();
    const managerRole = document.getElementById("new-manager-role").value;

    if (!managerName || !managerPassword) {
        alert("אנא הזן שם וסיסמה");
        return;
    }

    if (managerRole === "user" && selectedVoterIds.length === 0) {
        alert("אחראי חייב להיות אחראי על לפחות בוחר אחד");
        return;
    }

    try {
        await setDoc(doc(db, "managers", Date.now().toString()), {
            name: managerName,
            password: managerPassword,
            role: managerRole,
            assignedVoters: selectedVoterIds,
            createdAt: new Date()
        });
        document.getElementById("new-manager-name").value = "";
        document.getElementById("new-manager-password").value = "";
        document.getElementById("new-manager-role").value = "admin";
        selectedVoterIds = [];
        document.getElementById("voters-label").style.display = "none";
        document.getElementById("voters-selector").style.display = "none";
        await updateManagersList();
        alert("מנהל נוצר בהצלחה!");
    } catch (error) {
        alert("שגיאה בשמירה!");
    }
});

document.getElementById("close-users-modal").addEventListener("click", () => {
    document.getElementById("users-management-modal").style.display = "none";
});

document.getElementById("close-modal-btn").addEventListener("click", () => { modal.style.display = "none"; activeVoter = null; });
window.addEventListener("click", (e) => { if (e.target === modal) { modal.style.display = "none"; activeVoter = null; } });
window.addEventListener("click", (e) => { if (e.target === document.getElementById("users-management-modal")) { document.getElementById("users-management-modal").style.display = "none"; } });

document.getElementById("modal-btn-call").addEventListener("click", () => {
    if (activeVoter && activeVoter.phone) window.location.href = `tel:${activeVoter.phone}`;
});

document.getElementById("modal-btn-toggle-vote").addEventListener("click", async () => {
    if (!activeVoter) return;
    const nextStatus = !activeVoter.hasVoted;
    await updateDoc(doc(db, "voters", activeVoter.id), { hasVoted: nextStatus });
});

let saveTimeout = null;
function debouncedSaveNotes(voterId, text) {
    document.getElementById("modal-save-status").textContent = "📝 מקליד...";
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await updateDoc(doc(db, "voters", voterId), { notes: text });
        document.getElementById("modal-save-status").textContent = "💾 נשמר בהצלחה!";
    }, 800);
}

document.getElementById("modal-btn-remind").addEventListener("click", async () => {
    if (!activeVoter) return;
    
    const reminderOptions = `בחר זמן לתזכורת:\n[1] רבע שעה (15 דקות)\n[2] חצי שעה (30 דקות)\n[3] שעה אחת (60 דקות)`;
    const choice = prompt(reminderOptions, "1");
    if (choice === null) return;
    
    let minutesToAdd = 60;
    if (choice === "1") minutesToAdd = 15;
    else if (choice === "2") minutesToAdd = 30;
    else if (choice === "3") minutesToAdd = 60;
    else {
        alert("בחר בין 1-3");
        return;
    }
    
    const now = new Date();
    const reminderTimestamp = now.getTime() + (minutesToAdd * 60 * 1000);
    
    await updateDoc(doc(db, "voters", activeVoter.id), { 
        reminderTime: reminderTimestamp,
        reminderMinutes: minutesToAdd,
        notes: (activeVoter.notes ? activeVoter.notes + " | " : "") + `תזכורת ${minutesToAdd} דקות`
    });
    
    const timeText = minutesToAdd === 15 ? "רבע שעה" : minutesToAdd === 30 ? "חצי שעה" : "שעה";
    alert(`הוגדרה תזכורת עבור ${activeVoter.name} בעוד ${timeText}. השורה תיצבע בצהוב!`);
    modal.style.display = "none";
});

document.getElementById("modal-btn-delete-reminder").addEventListener("click", async () => {
    if (!activeVoter) return;
    if (!confirm("האם למחוק את התזכורת?")) return;
    
    let updatedNotes = activeVoter.notes || "";
    updatedNotes = updatedNotes
        .replace(/\s*\|\s*תזכורת \d+ דקות/g, "")
        .replace(/תזכורת \d+ דקות/g, "")
        .trim();
    
    await updateDoc(doc(db, "voters", activeVoter.id), { 
        reminderTime: null,
        reminderMinutes: null,
        notes: updatedNotes
    });
    
    alert("תזכורת נמחקה בהצלחה! הצבע הצהוב הוסר.");
    modal.style.display = "none";
});

document.getElementById("modal-btn-drive").addEventListener("click", () => {
    if (!activeVoter) return;
    
    const driverName = prompt("הזן את שם נהג או אחראי ההסעות (או לחץ אישור לשליחה כללית):", "אחראי הסעות");
    if (driverName === null) return;

    const textMessage = `🚗 *בקשת הסעה חדשה לבוחר* 🚗\n\n👤 *שם הבוחר:* ${activeVoter.name}\n📍 *כתובת איסוף:* ${activeVoter.address || 'לא צוינה כתובת'}\n📞 *טלפון ליצירת קשר:* ${activeVoter.phone || '-'}\n🆔 *מספר מסד/קלפי:* ${activeVoter.masad || '-'}\n\nנא לתאם איתו בדחיפות ולעדכן את החמ"ל! 🚀`;
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
