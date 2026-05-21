/**
 * laven - Employees Module
 * Handles employee listing, filtering, and CRUD operations
 */

// Employee Management State
let allEmployees = [];
let filteredEmployees = [];
let currentEmpPage = 1;
const empRowsPerPage = 10;

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

    currentEmpPage = 1;
    renderEmployeeTable();
}

function renderEmployeeTable() {
    const tableBody = document.querySelector('.data-table tbody');
    const infoEl = document.querySelector('.pagination-info');
    if (!tableBody) return;

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

window.closeEmployeeModal = () => {
    const modal = document.getElementById('employeeModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.saveEmployee = async () => {
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
