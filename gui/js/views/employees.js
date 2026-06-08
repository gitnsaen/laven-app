/**
 * laven - Employees Module
 * Handles employee listing, filtering, and CRUD operations
 */

(() => {
// Employee Management State
let allEmployees = [];
let filteredEmployees = [];
let currentEmpPage = 1;
const empRowsPerPage = 10;
let empSortKey = 'employeeID';
let empSortDirection = 'desc';

async function loadEmployees() {
    try {
        allEmployees = await window.pywebview.api.get_employees();
        window.allEmployees = allEmployees; // Ensure global availability
        applyEmployeeFilters();
    } catch (error) {
        console.error("Error loading employees:", error);
    }
}

function applyEmployeeFilters() {
    console.log("Applying employee filters...");
    const searchInput = document.querySelector('.search-input');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
    console.log("Search term:", term);

    if (!window.allEmployees) {
        console.warn("allEmployees not found on window, using local state");
        window.allEmployees = allEmployees;
    }

    filteredEmployees = window.allEmployees.filter(emp => {
        const firstName = (emp.firstName || '').toLowerCase();
        const lastName = (emp.lastName || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`;
        const id = (emp.employeeID || '').toString().toLowerCase();
        const contact = (emp.contactNum || '').toLowerCase();

        return id.includes(term) ||
            fullName.includes(term) ||
            contact.includes(term);
    });

    // Sort the filtered employees
    filteredEmployees.sort((a, b) => {
        let valA = a[empSortKey];
        let valB = b[empSortKey];

        if (empSortKey === 'joinedDate') {
            valA = valA ? new Date(valA) : new Date(0);
            valB = valB ? new Date(valB) : new Date(0);
        } else if (empSortKey === 'employeeID') {
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toLowerCase();
        }

        if (valA < valB) return empSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return empSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    currentEmpPage = 1;
    renderEmployeeTable();
}

window.handleEmployeeSort = (key) => {
    if (empSortKey === key) {
        empSortDirection = empSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        empSortKey = key;
        empSortDirection = 'asc';
    }
    applyEmployeeFilters();
};

function renderEmployeeTable() {
    const tableBody = document.querySelector('.data-table tbody');
    const infoEl = document.querySelector('.pagination-info');
    if (!tableBody) return;

    // Update sort icons in DOM
    const sortIcons = document.querySelectorAll('.sort-icon');
    sortIcons.forEach(icon => {
        icon.textContent = '';
    });
    const activeIcon = document.getElementById(`sort-icon-${empSortKey}`);
    if (activeIcon) {
        activeIcon.textContent = empSortDirection === 'asc' ? ' ▲' : ' ▼';
    }

    const total = filteredEmployees.length;
    const start = total === 0 ? 0 : (currentEmpPage - 1) * empRowsPerPage;
    const end = Math.min(start + empRowsPerPage, total);
    const slice = filteredEmployees.slice(start, end);

    tableBody.innerHTML = slice.map(emp => `
        <tr>
            <td class="id-cell">#E-${emp.employeeID}</td>
            <td>${emp.firstName} ${emp.midInit ? emp.midInit + '.' : ''} ${emp.lastName}</td>
            <td>${emp.contactNum}</td>
            <td>${emp.joinedDate}</td>
            <td class="action-buttons">
                <button class="action-btn" onclick="openEmployeeModal(${emp.employeeID})">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="action-btn delete" onclick="handleEmployeeDelete(event, ${emp.employeeID})">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (infoEl) infoEl.textContent = `Showing ${total === 0 ? 0 : start + 1} to ${end} of ${total} entries`;

    renderEmpPagination(total);
    if (window.lucide) window.lucide.createIcons();
}

function renderEmpPagination(total) {
    const container = document.querySelector('.pagination-controls');
    if (!container) return;

    const totalPages = Math.ceil(total / empRowsPerPage);
    let html = `<button class="page-btn nav" ${currentEmpPage === 1 ? 'disabled' : ''} data-emp-page="${currentEmpPage - 1}">Prev</button>`;

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentEmpPage ? 'active' : ''}" data-emp-page="${i}">${i}</button>`;
    }

    html += `<button class="page-btn nav" ${currentEmpPage === totalPages || total === 0 ? 'disabled' : ''} data-emp-page="${currentEmpPage + 1}">Next</button>`;
    container.innerHTML = html;
}

// Global Bindings for Employee Module
window.loadEmployees = loadEmployees;
window.applyEmployeeFilters = applyEmployeeFilters;
window.renderEmployeeTable = renderEmployeeTable;

window.openEmployeeModal = async (id = null) => {
    let modal = document.getElementById('employeeModal');

    if (!modal) {
        const success = await window.loadModal('employee', 'employee-modal-mount');
        if (!success) return;
        modal = document.getElementById('employeeModal');
    }

    if (modal) {
        modal.classList.add('active');

        // Ensure content step is active
        const step = modal.querySelector('.modal-step');
        if (step) step.classList.add('active');

        modal.setAttribute('data-editing-id', id || '');

        const fnameInput = document.getElementById('empFirstName');
        const midInput = document.getElementById('empMidInit');
        const lnameInput = document.getElementById('empLastName');
        const contactInput = document.getElementById('empContact');
        const titleEl = document.getElementById('employeeModalTitle');

        // Clear warning states
        const nameWarning = document.getElementById('empNameWarning');
        const contactWarning = document.getElementById('empContactWarning');
        if (nameWarning) {
            nameWarning.style.display = 'none';
            nameWarning.textContent = '';
        }
        if (contactWarning) {
            contactWarning.style.display = 'none';
            contactWarning.textContent = '';
        }
        if (fnameInput) {
            fnameInput.style.borderColor = '';
            fnameInput.classList.remove('input-error');
        }
        if (lnameInput) {
            lnameInput.style.borderColor = '';
            lnameInput.classList.remove('input-error');
        }
        if (contactInput) {
            contactInput.style.borderColor = '';
            contactInput.classList.remove('input-error');
        }

        // Attach inline validation listeners with debounce
        const setupListeners = () => {
            const debouncedCheck = window.debounce(() => {
                const currentId = modal.getAttribute('data-editing-id') || null;
                checkEmployeeDuplicates(
                    fnameInput.value.trim(),
                    lnameInput.value.trim(),
                    contactInput.value.trim(),
                    currentId
                );
            }, 500);

            if (fnameInput && !fnameInput.dataset.dupCheckInitialized) {
                fnameInput.addEventListener('input', debouncedCheck);
                fnameInput.dataset.dupCheckInitialized = 'true';
            }
            if (lnameInput && !lnameInput.dataset.dupCheckInitialized) {
                lnameInput.addEventListener('input', debouncedCheck);
                lnameInput.dataset.dupCheckInitialized = 'true';
            }
            if (contactInput && !contactInput.dataset.dupCheckInitialized) {
                contactInput.addEventListener('input', debouncedCheck);
                contactInput.dataset.dupCheckInitialized = 'true';
            }
        };
        setupListeners();

        if (id) {
            if (titleEl) titleEl.textContent = 'Edit Employee';
            const employee = allEmployees.find(emp => emp.employeeID == id);
            if (employee) {
                fnameInput.value = employee.firstName || '';
                midInput.value = employee.midInit || '';
                lnameInput.value = employee.lastName || '';
                contactInput.value = employee.contactNum || '';
            }
        } else {
            if (titleEl) titleEl.textContent = 'Add New Employee';
            fnameInput.value = '';
            midInput.value = '';
            lnameInput.value = '';
            contactInput.value = '';
        }

        if (window.lucide) window.lucide.createIcons();
    }
};

async function checkEmployeeDuplicates(fname, lname, phone, ignore_id) {
    const fnameInput = document.getElementById('empFirstName');
    const lnameInput = document.getElementById('empLastName');
    const contactInput = document.getElementById('empContact');
    const nameWarning = document.getElementById('empNameWarning');
    const contactWarning = document.getElementById('empContactWarning');

    if (!nameWarning || !contactWarning) return;

    nameWarning.style.display = 'none';
    nameWarning.textContent = '';
    contactWarning.style.display = 'none';
    contactWarning.textContent = '';

    if (fnameInput) {
        fnameInput.style.borderColor = '';
        fnameInput.classList.remove('input-error');
    }
    if (lnameInput) {
        lnameInput.style.borderColor = '';
        lnameInput.classList.remove('input-error');
    }
    if (contactInput) {
        contactInput.style.borderColor = '';
        contactInput.classList.remove('input-error');
    }

    if (!fname && !lname && !phone) return;

    try {
        const check = await window.pywebview.api.check_employee_duplicate(fname, lname, phone, ignore_id || null);
        if (check && check.status === 'success') {
            if (check.name_match && fname.length > 0 && lname.length > 0) {
                nameWarning.textContent = "An employee with this name already exists.";
                nameWarning.style.display = "block";
            }
            if (check.phone_match && phone.length > 0) {
                contactWarning.textContent = "This phone number is already registered. Please use a different number or update the existing profile.";
                contactWarning.style.display = "block";
                if (contactInput) {
                    contactInput.style.borderColor = "#DC2626";
                    contactInput.classList.add('input-error');
                }
            }
        }
    } catch (e) {
        console.error("Employee duplicate check error:", e);
    }
}

window.closeEmployeeModal = () => {
    const modal = document.getElementById('employeeModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.executeSaveEmployee = async (id, fname, mid, lname, contact) => {
    try {
        let response;
        if (id) {
            response = await window.pywebview.api.update_employee(id, fname, mid, lname, contact);
        } else {
            response = await window.pywebview.api.add_employee(fname, mid, lname, contact);
        }

        if (response.status === "success") {
            window.showToast("Employee profile saved successfully!", "success");
            window.closeEmployeeModal();
            await loadEmployees();
        } else {
            window.showToast("Error: " + response.message, "error");
        }
    } catch (err) {
        console.error("Execute Save Employee Failed:", err);
        window.showToast("A system error occurred while saving.", "error");
    }
};

window.saveEmployee = async (bypassNameCheck = false) => {
    const modal = document.getElementById('employeeModal');
    if (!modal) return;

    const id = modal.getAttribute('data-editing-id');
    const fname = document.getElementById('empFirstName').value.trim();
    const mid = document.getElementById('empMidInit').value.trim();
    const lname = document.getElementById('empLastName').value.trim();
    const contact = document.getElementById('empContact').value.trim();

    const fnameVal = window.validateName(fname, "First Name");
    if (!fnameVal.valid) {
        window.showToast(fnameVal.reason, "error");
        return;
    }
    if (mid) {
        const midVal = window.validateName(mid, "Middle Initial");
        if (!midVal.valid) {
            window.showToast(midVal.reason, "error");
            return;
        }
    }
    const lnameVal = window.validateName(lname, "Last Name");
    if (!lnameVal.valid) {
        window.showToast(lnameVal.reason, "error");
        return;
    }
    const contactVal = window.validatePhone(contact, "Contact Number");
    if (!contactVal.valid) {
        window.showToast(contactVal.reason, "error");
        return;
    }

    try {
        const check = await window.pywebview.api.check_employee_duplicate(fname, lname, contact, id || null);
        if (check && check.status === "success") {
            if (check.phone_match) {
                // Block submission entirely
                const contactWarning = document.getElementById('empContactWarning');
                if (contactWarning) {
                    contactWarning.textContent = "This phone number is already registered. Please use a different number or update the existing profile.";
                    contactWarning.style.display = "block";
                }
                const contactInput = document.getElementById('empContact');
                if (contactInput) {
                    contactInput.style.borderColor = "#DC2626";
                    contactInput.classList.add('input-error');
                }
                window.showToast("This phone number is already registered.", "error");
                return;
            }
            if (check.name_match && !bypassNameCheck) {
                // Pause submission and show confirmation modal
                window.openDeleteConfirm({
                    title: 'Duplicate Profile Found',
                    message: `A profile for ${fname} ${lname} already exists in the system. Are you sure you want to create a new, separate profile?`,
                    confirmText: 'Yes, Create',
                    cancelText: 'Cancel',
                    confirmClass: 'btn-confirm-dup',
                    processingText: 'Saving...',
                    icon: 'users',
                    iconBg: 'var(--order-progress-bg)',
                    iconColor: 'var(--order-progress-text)',
                    onConfirm: async () => {
                        await window.executeSaveEmployee(id, fname, mid, lname, contact);
                    }
                });
                return;
            }
        }

        await window.executeSaveEmployee(id, fname, mid, lname, contact);
    } catch (err) {
        console.error("Save Employee Failed:", err);
        window.showToast("A system error occurred while saving.", "error");
    }
};

window.handleEmployeeDelete = async (event, id) => {
    event.stopPropagation();
    const employee = (allEmployees || []).find(emp => emp.employeeID == id);
    window.handleDeleteEmployee(id, employee ? `${employee.firstName} ${employee.lastName}` : `Employee #${id}`);
};

window.handleDeleteEmployee = (id, name) => {
    window.openDeleteConfirm({
        title: 'Delete Employee',
        message: "Are you sure you want to archive this employee? They will be removed from active lists, but their handled orders will remain intact.",
        confirmText: 'Yes, Archive',
        onConfirm: async () => {
            const result = await window.pywebview.api.delete_employee(id);
            if (result.status === 'success') {
                window.showToast("Employee archived successfully!", "success");
                await loadEmployees();
            } else {
                window.showToast("Error: " + result.message, "error");
            }
        }
    });
};

// Expose internal state to window for shared logic in ui.js
Object.defineProperty(window, 'currentEmpPage', {
    get: () => currentEmpPage,
    set: (val) => { currentEmpPage = val; }
});

})();
