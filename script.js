// Register Service Worker for PWA / Offline Use
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered!', reg))
            .catch(err => console.log('Service Worker error: ', err));
    });
}

// ----------------------------------------------------
// FIREBASE CONFIGURATION
// ----------------------------------------------------
const firebaseConfig = {
    databaseURL: "https://salarias-95627-default-rtdb.firebaseio.com"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// State Management
let employees = [];
let entries = [];
let currentUser = null; // logged-in username (used as Firebase path key)
let dbListeners = []; // keep track of active listeners so we can detach on logout

// =====================================================
// AUTH SYSTEM: Login / Register / Logout
// =====================================================
function sanitizeKey(str) {
    // Firebase keys cannot contain . # $ [ ]
    return str.replace(/[.#$\[\]]/g, '_').trim();
}

function loadUserData(username) {
    const key = sanitizeKey(username);
    currentUser = key;

    // Store logged-in user in sessionStorage so refresh keeps us logged in
    sessionStorage.setItem('aspt_user', key);

    // Show app, hide login
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('loggedInUser').textContent = `👤 ${username}`;
    document.getElementById('logoutBtn').style.display = 'inline-flex';

    // Detach any previous listeners
    dbListeners.forEach(ref => ref.off());
    dbListeners = [];

    // Listen to this user's data under /users/<username>/
    const empRef = database.ref(`users/${key}/employees`);
    const entRef = database.ref(`users/${key}/entries`);

    empRef.on('value', (snapshot) => {
        employees = snapshot.val() || [];
        renderEmployeeList();
        updateEmployeeDropdowns();
    });

    entRef.on('value', (snapshot) => {
        entries = snapshot.val() || [];
        renderRecentEntries();
    });

    dbListeners.push(empRef, entRef);
}

function saveUserData(type, data) {
    if (!currentUser) return;
    database.ref(`users/${currentUser}/${type}`).set(data);
}

// Handle Login button
document.getElementById('loginBtn').addEventListener('click', () => {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';

    if (!username || !password) {
        errEl.textContent = 'Please fill in both fields.';
        return;
    }

    const key = sanitizeKey(username);
    database.ref(`users/${key}/auth`).once('value', (snap) => {
        const authData = snap.val();
        if (!authData) {
            errEl.textContent = 'Account not found. Please register first.';
        } else if (authData.password !== password) {
            errEl.textContent = 'Incorrect password. Try again.';
        } else {
            loadUserData(username);
        }
    });
});

// Handle Register button
document.getElementById('registerBtn').addEventListener('click', () => {
    const username = document.getElementById('regUser').value.trim();
    const password = document.getElementById('regPass').value.trim();
    const confirm = document.getElementById('regPassConfirm').value.trim();
    const errEl = document.getElementById('registerError');
    errEl.textContent = '';

    if (!username || !password) {
        errEl.textContent = 'Please fill in all fields.';
        return;
    }
    if (password.length < 4) {
        errEl.textContent = 'Password must be at least 4 characters.';
        return;
    }
    if (password !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        return;
    }

    const key = sanitizeKey(username);
    database.ref(`users/${key}/auth`).once('value', (snap) => {
        if (snap.val()) {
            errEl.textContent = 'This username is already taken.';
        } else {
            database.ref(`users/${key}/auth`).set({ username, password }).then(() => {
                loadUserData(username);
            });
        }
    });
});

// Toggle between Login and Register forms
document.getElementById('goToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('loginError').textContent = '';
    document.getElementById('registerError').textContent = '';
});

document.getElementById('goToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('loginError').textContent = '';
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Logout karna chahte hain?')) {
        sessionStorage.removeItem('aspt_user');
        currentUser = null;
        employees = [];
        entries = [];
        dbListeners.forEach(ref => ref.off());
        dbListeners = [];
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('loggedInUser').textContent = '';
        document.getElementById('logoutBtn').style.display = 'none';
        // Clear UI
        document.getElementById('employeeListBody').innerHTML = '';
        document.getElementById('recentEntriesBody') && (document.getElementById('recentEntriesBody').innerHTML = '');
    }
});

// Enter key support on login
document.getElementById('loginPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('regPassConfirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('registerBtn').click();
});

// Auto-login if session is active (after page refresh)
const savedUser = sessionStorage.getItem('aspt_user');
if (savedUser) {
    loadUserData(savedUser);
}


const STANDARD_HOURS = 8; // Adjust this if needed (Standard Daily Duty Hours)

// DOM Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const toastEl = document.getElementById('toast');

// Form Elements
const addEmployeeForm = document.getElementById('addEmployeeForm');
const dailyEntryForm = document.getElementById('dailyEntryForm');
const entryEmployeeSelect = document.getElementById('entryEmployee');
const reportEmployeeSelect = document.getElementById('reportEmployee');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    updateEmployeeDropdowns();
    renderEmployeeTable();
    renderRecentEntries();

    // Set default date to today for daily entry form
    document.getElementById('entryDate').valueAsDate = new Date();
});

// Tab Navigation Logic
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked tab
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
    });
});

// Show Toast Notification
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

// ----------------- TAB: EMPLOYEES -----------------

// Add Employee
addEmployeeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('empName').value.trim();
    const phoneInput = document.getElementById('empPhone').value.trim();
    const deptInput = document.getElementById('empDept').value.trim() || 'General';
    const salaryInput = parseFloat(document.getElementById('empSalary').value) || 0;

    if (nameInput) {
        const id = Date.now().toString(); // Simple unique ID
        employees.push({
            id,
            name: nameInput,
            phone: phoneInput,
            department: deptInput,
            monthlySalary: salaryInput
        });

        // Save to Firebase (user-specific path)
        saveUserData('employees', employees);

        // Update UI
        addEmployeeForm.reset();
        updateEmployeeDropdowns();
        renderEmployeeTable();
        showToast('Employee Added Successfully!');
    }
});

// Render Employee Table
function renderEmployeeTable() {
    const tbody = document.getElementById('employeeListBody');
    tbody.innerHTML = '';

    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No employees found.</td></tr>';
        return;
    }

    employees.forEach((emp, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${emp.name}</strong></td>
            <td>${emp.department || '-'}</td>
            <td>₹${emp.monthlySalary || 0}</td>
            <td>${emp.phone || '-'}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${emp.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Delete Employee
window.deleteEmployee = function (id) {
    if (confirm('Are you sure you want to delete this employee?')) {
        employees = employees.filter(emp => emp.id !== id);
        saveUserData('employees', employees);

        // Clean up their entries as well (optional, but good for cleanup)
        entries = entries.filter(entry => entry.empId !== id);
        saveUserData('entries', entries);

        updateEmployeeDropdowns();
        renderEmployeeTable();
        renderRecentEntries();
        showToast('Employee Deleted');
    }
}

// Update Dropdowns for Forms
function updateEmployeeDropdowns() {
    // Daily Entry Form Dropdown
    entryEmployeeSelect.innerHTML = '<option value="">-- Choose Employee --</option>';
    // Report Filter Dropdown
    reportEmployeeSelect.innerHTML = '<option value="all">All Employees</option>';
    // Bulk Entry Form Dropdown
    const bulkEmployeeSelect = document.getElementById('bulkEmployee');
    if (bulkEmployeeSelect) {
        bulkEmployeeSelect.innerHTML = '<option value="">-- Choose Employee --</option>';
    }

    employees.forEach(emp => {
        const option1 = document.createElement('option');
        option1.value = emp.id;
        option1.textContent = emp.name;
        entryEmployeeSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = emp.id;
        option2.textContent = emp.name;
        reportEmployeeSelect.appendChild(option2);

        if (bulkEmployeeSelect) {
            const option3 = document.createElement('option');
            option3.value = emp.id;
            option3.textContent = emp.name;
            bulkEmployeeSelect.appendChild(option3);
        }
    });
}

// ----------------- TAB: DAILY ENTRY -----------------

// Calculate Time Difference
function calculateHours(inTime, outTime, shiftType) {
    const inDate = new Date(`2000-01-01T${inTime}`);
    let outDate = new Date(`2000-01-01T${outTime}`);

    // If outTime <= inTime, it means the shift goes into the next day (or is exactly 24 hours e.g. 08:00 to 08:00)
    if (outDate <= inDate) {
        outDate.setDate(outDate.getDate() + 1);
    }

    let diffMs = outDate - inDate;
    let diffHrs = diffMs / (1000 * 60 * 60); // Convert to decimal hours

    // Double shift rule: calculate normally then double the result
    if (shiftType === 'Double') {
        diffHrs = diffHrs * 2;
    }

    return parseFloat(diffHrs.toFixed(2));
}

// Auto-fill Duty and OT when times are changed optionally
document.getElementById('inTime').addEventListener('change', autoFillHours);
document.getElementById('outTime').addEventListener('change', autoFillHours);
document.getElementById('entryShift').addEventListener('change', autoFillHours);
document.getElementById('dutyTarget').addEventListener('change', autoFillHours);
document.getElementById('breakTime').addEventListener('change', autoFillHours);

function autoFillHours() {
    const inTime = document.getElementById('inTime').value;
    const outTime = document.getElementById('outTime').value;
    const shift = document.getElementById('entryShift').value;
    const dutyTarget = parseFloat(document.getElementById('dutyTarget').value) || 8;
    const breakMins = parseFloat(document.getElementById('breakTime').value) || 0;

    // Only calculate if both are filled manually
    if (inTime && outTime) {
        const total = calculateHours(inTime, outTime, shift);
        const breakHrs = breakMins / 60;

        let ot = total - (dutyTarget + breakHrs);

        // If OT is negative, they didn't finish their shift, so OT is 0 and Duty is whatever net time they did
        let duty = dutyTarget;
        if (ot < 0) {
            duty = total - breakHrs;
            if (duty < 0) duty = 0; // Safeguard
            ot = 0;
        }

        document.getElementById('dutyHours').value = parseFloat(duty.toFixed(2));
        document.getElementById('otHours').value = parseFloat(ot.toFixed(2));
    }
}

// Add Entry
dailyEntryForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const empId = entryEmployeeSelect.value;
    const date = document.getElementById('entryDate').value;
    const shift = document.getElementById('entryShift').value;

    // In and Out time are optional now
    const inTime = document.getElementById('inTime').value || '-';
    const outTime = document.getElementById('outTime').value || '-';

    // Explicit Inputs
    const manualDuty = parseFloat(document.getElementById('dutyHours').value) || 0;
    const manualOT = parseFloat(document.getElementById('otHours').value) || 0;

    if (!empId || !date) return;

    const newEntry = {
        id: Date.now().toString(),
        empId,
        date,
        shift,
        inTime,
        outTime,
        totalHours: manualDuty + manualOT,
        otHours: manualOT,
        standardHours: manualDuty
    };

    entries.push(newEntry);

    // Save
    saveUserData('entries', entries);

    // Update UI
    document.getElementById('inTime').value = '';
    document.getElementById('outTime').value = '';
    document.getElementById('dutyHours').value = '';
    document.getElementById('otHours').value = '';
    renderRecentEntries();
    showToast('Entry Saved Successfully!');
});


// Format date consistently (YYYY-MM-DD to DD/MM/YYYY)
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function getEmployeeName(id) {
    const emp = employees.find(e => e.id === id);
    return emp ? emp.name : 'Unknown';
}

function renderRecentEntries() {
    const tbody = document.getElementById('recentEntriesBody');
    tbody.innerHTML = '';

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No entries yet.</td></tr>';
        return;
    }

    // Sort descending by date
    const sortedEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Only show last 30 entries to keep it clean
    sortedEntries.slice(0, 30).forEach(entry => {
        const tr = document.createElement('tr');

        let shiftBadge = '';
        if (entry.shift === 'Day') shiftBadge = '<span class="badge day">Day</span>';
        else if (entry.shift === 'Night') shiftBadge = '<span class="badge night">Night</span>';
        else if (entry.shift === 'Double') shiftBadge = '<span class="badge double">Double</span>';

        let otBadge = entry.otHours > 0 ? `<span class="badge ot">${entry.otHours}h OT</span>` : '-';

        tr.innerHTML = `
            <td>${formatDate(entry.date)}</td>
            <td><strong>${getEmployeeName(entry.empId)}</strong></td>
            <td>${shiftBadge}</td>
            <td>${entry.inTime}</td>
            <td>${entry.outTime}</td>
            <td><strong>${entry.totalHours}</strong></td>
            <td>${otBadge}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteEntry('${entry.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Delete Entry
window.deleteEntry = function (id) {
    if (confirm('Delete this attendance entry?')) {
        entries = entries.filter(e => e.id !== id);
        saveUserData('entries', entries);
        renderRecentEntries();
        showToast('Entry Deleted');
    }
}

// ----------------- TAB: BULK ENTRY -----------------

// Load Bulk Dates
document.getElementById('loadBulkBtn').addEventListener('click', () => {
    const empId = document.getElementById('bulkEmployee').value;
    const monthVal = document.getElementById('bulkMonth').value;

    if (!empId || !monthVal) {
        alert("Please select both Employee and Month.");
        return;
    }

    const [year, month] = monthVal.split('-');
    const daysInMonth = new Date(year, month, 0).getDate();

    document.getElementById('bulkTitle').textContent = `Bulk Entry: ${getEmployeeName(empId)} - ${monthVal}`;
    document.getElementById('bulkTableContainer').style.display = 'block';

    const tbody = document.getElementById('bulkTableBody');
    tbody.innerHTML = '';

    // Existing entries for this employee block
    const existingEntries = entries.filter(e => {
        const d = new Date(e.date);
        return e.empId === empId && d.getFullYear() == year && (d.getMonth() + 1) == month;
    });

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${month}-${i.toString().padStart(2, '0')}`;
        const dayDate = new Date(dateStr);
        const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });

        // Match existing entry
        const matched = existingEntries.find(e => e.date === dateStr);
        const isSunday = dayDate.getDay() === 0; // 0 = Sunday

        const tr = document.createElement('tr');
        // Highlight Sundays in a warm light yellow/amber to indicate Holiday
        if (isSunday) {
            tr.style.backgroundColor = '#fffbeb';
            tr.setAttribute('data-sunday', 'true');
        }
        tr.innerHTML = `
            <td>${i.toString().padStart(2, '0')}/${month}/${year}</td>
            <td>
                ${dayName}
                ${isSunday ? '<span class="badge" style="background:#fde68a;color:#92400e;margin-left:4px;font-size:0.7rem;">HOLIDAY</span>' : ''}
            </td>
            <td>
                <select class="bulk-shift" data-date="${dateStr}" ${isSunday ? 'style="background:#fffbeb"' : ''}>
                    <option value="Day" ${matched && matched.shift === 'Day' ? 'selected' : ''}>Day</option>
                    <option value="Night" ${matched && matched.shift === 'Night' ? 'selected' : ''}>Night</option>
                    <option value="Double" ${matched && matched.shift === 'Double' ? 'selected' : ''}>Double</option>
                </select>
            </td>
            <td><input type="time" class="bulk-in" value="${matched && matched.inTime !== '-' ? matched.inTime : ''}"></td>
            <td><input type="time" class="bulk-out" value="${matched && matched.outTime !== '-' ? matched.outTime : ''}"></td>
            <td>
                <select class="bulk-break">
                    <option value="0">0m</option>
                    <option value="30">30m</option>
                    <option value="60">1h</option>
                    <option value="90">1.5h</option>
                </select>
            </td>
            <td><input type="number" step="0.5" class="bulk-duty" value="${matched ? matched.standardHours : ''}" style="width:70px" placeholder="0"></td>
            <td><input type="number" step="0.5" class="bulk-ot" value="${matched ? matched.otHours : ''}" style="width:70px" placeholder="0"></td>
        `;
        tbody.appendChild(tr);

        // Setup row auto-calc listeners
        const inEl = tr.querySelector('.bulk-in');
        const outEl = tr.querySelector('.bulk-out');
        const shiftEl = tr.querySelector('.bulk-shift');
        const breakEl = tr.querySelector('.bulk-break');
        const dutyEl = tr.querySelector('.bulk-duty');
        const otEl = tr.querySelector('.bulk-ot');

        const handleCalc = () => {
            if (inEl.value && outEl.value) {
                const total = calculateHours(inEl.value, outEl.value, shiftEl.value);
                const breakHrs = parseFloat(breakEl.value) / 60;
                const netHrs = Math.max(0, total - breakHrs);

                if (isSunday) {
                    // Sunday = Holiday. All hours worked are Pure OT, no standard duty
                    dutyEl.value = 0;
                    otEl.value = parseFloat(netHrs.toFixed(2));
                } else {
                    const defaultDutyTarget = parseFloat(document.getElementById('bulkDefaultDuty').value) || 8;
                    let ot = total - (defaultDutyTarget + breakHrs);
                    let duty = defaultDutyTarget;
                    if (ot < 0) {
                        duty = netHrs;
                        if (duty < 0) duty = 0;
                        ot = 0;
                    }
                    dutyEl.value = parseFloat(duty.toFixed(2));
                    otEl.value = parseFloat(ot.toFixed(2));
                }
            }
            calculateBulkSummary();
        };

        inEl.addEventListener('change', handleCalc);
        outEl.addEventListener('change', handleCalc);
        shiftEl.addEventListener('change', handleCalc);
        breakEl.addEventListener('change', handleCalc);

        // Also update summary if they just type into duty or ot directly
        dutyEl.addEventListener('input', calculateBulkSummary);
        otEl.addEventListener('input', calculateBulkSummary);
        // Bind master duty target change to recalculate all rows if wanted, but standard row calc is sufficient for input flows
        document.getElementById('bulkDefaultDuty').addEventListener('change', () => {
            if (inEl.value && outEl.value) handleCalc();
        });
    }

    // Initial calculation for pre-filled data
    calculateBulkSummary();
});

// Calculate Monthly Bulk Summary values
function calculateBulkSummary() {
    let totalDuty = 0;
    let totalOT = 0;
    let daysPresent = 0;

    const rows = document.querySelectorAll('#bulkTableBody tr');
    rows.forEach(row => {
        const duty = parseFloat(row.querySelector('.bulk-duty').value) || 0;
        const ot = parseFloat(row.querySelector('.bulk-ot').value) || 0;

        if (duty > 0 || ot > 0) {
            totalDuty += duty;
            totalOT += ot;
            daysPresent++;
        }
    });

    document.getElementById('bulkTotalDuty').textContent = `${totalDuty.toFixed(2)} hrs`;
    document.getElementById('bulkTotalOT').textContent = `${totalOT.toFixed(2)} hrs`;
    document.getElementById('bulkTotalDays').textContent = `${daysPresent} Days`;
}

// Save Bulk Entry
document.getElementById('bulkSaveBtn').addEventListener('click', () => {
    const empId = document.getElementById('bulkEmployee').value;
    const tbody = document.getElementById('bulkTableBody');
    const rows = tbody.querySelectorAll('tr');

    // First, remove old entries for this employee for the loaded dates so we can replace them cleanly
    const savedDates = Array.from(rows).map(row => row.querySelector('.bulk-shift').getAttribute('data-date'));
    entries = entries.filter(e => !(e.empId === empId && savedDates.includes(e.date)));

    let addedCount = 0;

    rows.forEach(row => {
        const shift = row.querySelector('.bulk-shift').value;
        const date = row.querySelector('.bulk-shift').getAttribute('data-date');
        const inTime = row.querySelector('.bulk-in').value || '-';
        const outTime = row.querySelector('.bulk-out').value || '-';
        const duty = parseFloat(row.querySelector('.bulk-duty').value) || 0;
        const ot = parseFloat(row.querySelector('.bulk-ot').value) || 0;

        // Only save if there's actual duty or ot
        if (duty > 0 || ot > 0) {
            entries.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                empId,
                date,
                shift,
                inTime,
                outTime,
                totalHours: duty + ot,
                otHours: ot,
                standardHours: duty
            });
            addedCount++;
        }
    });

    saveUserData('entries', entries);
    renderRecentEntries();
    showToast(`Saved ${addedCount} entries for the month!`);
});

// ----------------- TAB: MONTHLY REPORT -----------------

document.getElementById('generateReportBtn').addEventListener('click', () => {
    const monthVal = document.getElementById('reportMonth').value; // format: "YYYY-MM"
    const empId = document.getElementById('reportEmployee').value;

    if (!monthVal) {
        alert("Please select a month first.");
        return;
    }

    const [year, month] = monthVal.split('-');

    // Filter entries by month and year
    let filteredEntries = entries.filter(e => {
        const eDate = new Date(e.date);
        return eDate.getFullYear() == year && (eDate.getMonth() + 1) == month;
    });

    // Filter by employee if specific one selected
    if (empId !== 'all') {
        filteredEntries = filteredEntries.filter(e => e.empId === empId);
    }

    // Show container
    const container = document.getElementById('reportResultContainer');
    container.style.display = 'block';

    // Determine Report Title
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    let titleStr = `Report: ${monthName} ${year}`;
    if (empId !== 'all') {
        titleStr += ` - ${getEmployeeName(empId)}`;
    }
    document.getElementById('reportTitle').textContent = titleStr;

    // Process Data into Summary
    const daysInMonth = new Date(year, month, 0).getDate(); // Total days in that month
    const summaryMap = {}; // key: empId, value: { name, days, standard, ot, total, salary info }

    filteredEntries.forEach(entry => {
        if (!summaryMap[entry.empId]) {
            // Look up employee to get salary info
            const empData = employees.find(e => e.id === entry.empId);
            const monthlySalary = empData ? (parseFloat(empData.monthlySalary) || 0) : 0;
            const dept = empData ? (empData.department || '-') : '-';
            const defaultDutyHrs = 8; // standard duty hours per day for salary calculation
            // Hourly rate = Monthly Salary / Total Days in month / Duty Hrs per day
            const hourlyRate = daysInMonth > 0 && defaultDutyHrs > 0 ? (monthlySalary / daysInMonth / defaultDutyHrs) : 0;

            summaryMap[entry.empId] = {
                name: getEmployeeName(entry.empId),
                dept,
                days: 0,
                standard: 0,
                ot: 0,
                total: 0,
                monthlySalary,
                hourlyRate,
                dailyRate: daysInMonth > 0 ? (monthlySalary / daysInMonth) : 0
            };
        }

        summaryMap[entry.empId].days += 1;
        summaryMap[entry.empId].standard += entry.standardHours || 0;
        summaryMap[entry.empId].ot += entry.otHours || 0;
        summaryMap[entry.empId].total += entry.totalHours || 0;
    });

    // Count Sundays in the selected month (these are paid holidays for all)
    let sundayCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(year, month - 1, d).getDay() === 0) sundayCount++;
    }

    // Render Summary Table
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    const summaryList = Object.values(summaryMap);
    if (summaryList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No data found for this period.</td></tr>';
        document.getElementById('detailedReportContainer').style.display = 'none';
    } else {
        summaryList.forEach(data => {
            // Salary Calculation
            // Base Pay = standard hours * hourly rate
            const basePay = data.standard * data.hourlyRate;
            // OT Pay = OT hours * hourly rate
            const otPay = data.ot * data.hourlyRate;
            // Sunday Holiday Pay = Sunday Count * Daily Rate (all employees, worked or not)
            const sundayHolidayPay = sundayCount * data.dailyRate;
            const grossSalary = basePay + otPay + sundayHolidayPay;

            const tr = document.createElement('tr');
            tr.setAttribute('data-gross', grossSalary.toFixed(0));
            tr.innerHTML = `
                <td><strong>${data.name}</strong><br><small style="color:var(--text-muted)">${data.dept}</small></td>
                <td>${data.days}</td>
                <td>${data.standard.toFixed(2)} hrs</td>
                <td>${data.ot > 0 ? '<span class="badge ot">' + data.ot.toFixed(2) + ' hrs</span>' : '-'}</td>
                <td><strong>${data.total.toFixed(2)} hrs</strong></td>
                <td>
                    <span style="color:var(--success);font-weight:600">₹${grossSalary.toFixed(0)}</span><br>
                    <small>Base:₹${basePay.toFixed(0)} + OT:₹${otPay.toFixed(0)}</small>
                </td>
                <td>
                    <input type="number" class="advance-input" placeholder="0"
                        style="width:90px;border:1px solid var(--border-color);border-radius:5px;padding:5px;font-size:0.9rem;"
                        value="0">
                </td>
                <td class="net-payable" style="color:var(--primary-color);font-weight:700;font-size:1.05rem;">
                    ₹${grossSalary.toFixed(0)}
                </td>
            `;
            tbody.appendChild(tr);

            // Auto-recalculate Net Payable when advance changes
            const advanceInput = tr.querySelector('.advance-input');
            const netCell = tr.querySelector('.net-payable');
            advanceInput.addEventListener('input', () => {
                const advance = parseFloat(advanceInput.value) || 0;
                const net = grossSalary - advance;
                netCell.textContent = `₹${net.toFixed(0)}`;
                netCell.style.color = net < 0 ? 'var(--danger)' : 'var(--primary-color)';
            });
        });

        // Show detailed log if single employee selected
        if (empId !== 'all') {
            document.getElementById('detailedReportContainer').style.display = 'block';
            renderDetailedLog(filteredEntries);
        } else {
            document.getElementById('detailedReportContainer').style.display = 'none';
        }
    }
});

function renderDetailedLog(logEntries) {
    const tbody = document.getElementById('detailedReportBody');
    tbody.innerHTML = '';

    // Sort chronological
    logEntries.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(entry => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(entry.date)}</td>
            <td>${entry.shift}</td>
            <td>${entry.inTime}</td>
            <td>${entry.outTime}</td>
            <td>${entry.totalHours}</td>
            <td>${entry.otHours > 0 ? entry.otHours : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Print / PDF Export
document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
});

// Excel (CSV) Export
document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const title = document.getElementById('reportTitle').textContent;
    let csvContent = "data:text/csv;charset=utf-8,";

    csvContent += `"${title}"\n\n`;

    // Summary Headers
    csvContent += "Name,Department,Days,Standard Hrs,OT Hrs,Total Hrs,Gross Salary (INR),Advance (INR),Net Payable (INR)\n";

    // Summary Data
    const rows = document.querySelectorAll('#reportTableBody tr');
    rows.forEach(row => {
        if (row.cells.length > 1) { // avoid empty message cell
            const cols = Array.from(row.cells).map(cell => {
                let text = cell.innerText.replace(/"/g, '""');
                // Remove the " hrs" suffix so it imports as clean numbers in Excel
                text = text.replace(/ hrs/g, '');
                return `"${text}"`;
            });
            csvContent += cols.join(",") + "\n";
        }
    });

    // Detailed Data if visible
    if (document.getElementById('detailedReportContainer').style.display !== 'none') {
        csvContent += "\n\"Detailed Log\"\n";
        csvContent += "Date,Shift,In Time,Out Time,Hrs,OT\n";
        const dRows = document.querySelectorAll('#detailedReportBody tr');
        dRows.forEach(row => {
            const cols = Array.from(row.cells).map(cell => `"${cell.innerText.replace(/"/g, '""')}"`);
            csvContent += cols.join(",") + "\n";
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${title.replace(/ /g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
