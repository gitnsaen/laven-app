/**
 * laven - Customers Module
 * Handles customer listing, filtering, and CRUD operations
 */

// Customer Management State
let allCustomers = [];
let filteredCustomers = [];
let currentPage = 1;
const rowsPerPage = 15;
let customerFilter = 'All';

async function loadCustomers() {
    try {
        console.log("Fetching all customers...");
        allCustomers = await window.pywebview.api.get_customers();
        window.allCustomers = allCustomers; // Ensure global availability

        // Reset state and apply current filters/search
        applyFiltersAndSearch();
    } catch (error) {
        console.error("Error loading customers:", error);
    }
}

/**
 * Filters the master list based on both the Tab and Search Input
 */
function applyFiltersAndSearch() {
    console.log("Applying customer filters...");
    const searchInput = document.querySelector('.search-input');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
    console.log("Search term:", term);

    if (!window.allCustomers) {
        console.warn("allCustomers not found on window, using local state");
        window.allCustomers = allCustomers;
    }

    filteredCustomers = window.allCustomers.filter(c => {
        // 1. Status Filter (Tab)
        const matchesTab = (customerFilter === 'All' || c.status === customerFilter);

        // 2. Search Filter (Input)
        const name = (c.customerName || '').toLowerCase();
        const phone = (c.contactNum || '').toLowerCase();
        const id = (c.customerID || '').toString().toLowerCase();

        const matchesSearch = (
            id.includes(term) ||
            name.includes(term) ||
            phone.includes(term)
        );

        return matchesTab && matchesSearch;
    });

    currentPage = 1; // Reset to page 1 on search/filter
    renderCustomerTable();
}

/**
 * Slices the filtered array and injects HTML
 */
function renderCustomerTable() {
    const tableBody = document.querySelector('.data-table tbody');
    const infoEl = document.querySelector('.pagination-info');
    if (!tableBody) return;

    // 1. Calculation for Pagination
    const total = filteredCustomers.length;
    const start = total === 0 ? 0 : (currentPage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, total);
    const displayList = filteredCustomers.slice(start, end);

    // 2. Inject Table Rows
    tableBody.innerHTML = displayList.map(customer => `
        <tr onclick="window.handleCustomerRowClick(event, ${customer.customerID})">
            <td class="id-cell">#${customer.customerID}</td>
            <td>${customer.customerName}</td>
            <td>${customer.contactNum}</td>
            <td>${customer.joinedDate}</td>
            <td>${customer.totalOrders}</td>
            <td>
                <span class="status-badge" data-status="${customer.status}">${customer.status}</span>
            </td>
            <td class="action-buttons">
                <button class="action-btn" onclick="window.openCustomerModal(${customer.customerID})">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="action-btn delete" onclick="window.handleCustomerDelete(event, ${customer.customerID})">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // 3. Update pagination text
    if (infoEl) {
        infoEl.textContent = `Showing ${total === 0 ? 0 : start + 1} to ${end} of ${total} entries`;
    }

    renderPaginationControls(total);

    // Re-attach listeners to filter tabs
    setupCustomerFilters();

    if (window.lucide) window.lucide.createIcons();
}

/**
 * Generates dynamic Page buttons
 */
function renderPaginationControls(total) {
    const container = document.querySelector('.pagination-controls');
    if (!container) return;

    const totalPages = Math.ceil(total / rowsPerPage);
    let html = `
        <button class="page-btn nav" ${currentPage === 1 ? 'disabled' : ''} data-cust-page="${currentPage - 1}">Prev</button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-cust-page="${i}">${i}</button>`;
    }

    html += `
        <button class="page-btn nav" ${currentPage === totalPages || total === 0 ? 'disabled' : ''} data-cust-page="${currentPage + 1}">Next</button>
    `;

    container.innerHTML = html;
}

function setupCustomerFilters() {
    const tabs = document.querySelectorAll('.filter-tab');
    if (tabs.length === 0) return;

    tabs.forEach(tab => {
        // Remove existing listener to avoid duplicates
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);

        const label = newTab.textContent.trim();
        if (label === customerFilter) {
            newTab.classList.add('active');
        } else {
            newTab.classList.remove('active');
        }

        newTab.addEventListener('click', () => {
            customerFilter = label;
            applyFiltersAndSearch();
        });
    });
}

// Global Bindings for Customer Module
window.loadCustomers = loadCustomers;
window.applyFiltersAndSearch = applyFiltersAndSearch;
window.renderCustomerTable = renderCustomerTable;

window.handleCustomerRowClick = (e, id) => {
    if (e.target.closest('.action-buttons')) return;
    console.log("Viewing Customer Details for:", id);
};

window.handleCustomerDelete = async (event, id) => {
    event.stopPropagation();
    const cust = (window.allCustomers || []).find(c => c.customerID === id);
    window.handleDeleteCustomer(id, cust ? cust.customerName : `Customer #${id}`);
};

window.handleDeleteCustomer = (id, name) => {
    window.openDeleteConfirm({
        title: 'Delete Customer',
        message: "Are you sure you want to archive this customer? They will be hidden from the system, but their past orders and payments will be preserved for accounting.",
        confirmText: 'Yes, Archive',
        onConfirm: async () => {
            const result = await window.pywebview.api.delete_customer(id);
            if (result.status === 'success') {
                window.showToast("Customer archived successfully!", "success");
                await loadCustomers();
            } else {
                window.showToast("Error: " + result.message, "error");
            }
        }
    });
};

window.openCustomerModal = async (id = null) => {
    console.log("openCustomerModal triggered with ID:", id);

    let cleanId = id;
    if (typeof id === 'string' && id.includes('C-')) {
        cleanId = parseInt(id.replace('C-', ''));
    }

    // 1. Ensure modal and its content are loaded
    let modal = document.getElementById('customerModal');
    let titleEl = document.getElementById('customerModalTitle');

    if (!modal || !titleEl) {
        console.log("Modal or title element missing, forcing fresh load...");
        const success = await window.loadModal('customer', 'customer-modal-mount');
        if (!success) {
            console.error("Failed to load modal HTML");
            return;
        }
        modal = document.getElementById('customerModal');
        titleEl = document.getElementById('customerModalTitle');
    }

    if (!modal) {
        console.error("Critical: Modal element still missing after load attempt");
        return;
    }

    // 2. Immediate UI Feedback
    console.log("Displaying modal overlay...");
    modal.classList.add('active');

    // Ensure the content step is active (fixes bug where nextStep cleared it)
    const step = modal.querySelector('.modal-step');
    if (step) step.classList.add('active');

    if (window.lucide) window.lucide.createIcons();

    // 3. Clear/Prepare fields
    const nameInput = document.getElementById('custName');
    const phoneInput = document.getElementById('custPhone');
    // titleEl is already found in step 1

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    modal.setAttribute('data-editing-id', cleanId || '');

    // 4. Data Population
    if (cleanId) {
        console.log("Fetching data for edit mode, ID:", cleanId);
        if (titleEl) titleEl.textContent = 'Edit Customer';
        try {
            // This is where a potential backend hang could happen
            const customer = await window.pywebview.api.get_customer(cleanId);
            console.log("Customer data received:", customer);
            if (customer) {
                if (nameInput) nameInput.value = customer.customerName || '';
                if (phoneInput) phoneInput.value = customer.contactNum || '';
            }
        } catch (err) {
            console.error("Backend error in get_customer:", err);
        }
    } else {
        console.log("Initialized for New Customer mode");
        if (titleEl) titleEl.textContent = 'New Customer';
    }
};

window.closeCustomerModal = () => {
    const modal = document.getElementById('customerModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.saveCustomer = async () => {
    const modal = document.getElementById('customerModal');
    const id = modal.getAttribute('data-editing-id');
    const nameInput = document.getElementById('custName');
    const phoneInput = document.getElementById('custPhone');

    if (!nameInput || !phoneInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    const nameVal = window.validateName(name, "Customer Name");
    if (!nameVal.valid) {
        window.showToast(nameVal.reason, "error");
        return;
    }
    const phoneVal = window.validatePhone(phone, "Contact Number");
    if (!phoneVal.valid) {
        window.showToast(phoneVal.reason, "error");
        return;
    }

    try {
        let response;
        if (id) {
            response = await window.pywebview.api.update_customer(id, name, phone);
        } else {
            response = await window.pywebview.api.add_customer(name, phone);
        }

        if (response.status === "success") {
            window.showToast("Customer profile saved successfully!", "success");
            window.closeCustomerModal();
            await loadCustomers();
        } else {
            window.showToast("Error: " + response.message, "error");
        }
    } catch (err) {
        console.error("Save Customer Failed:", err);
        window.showToast("A system error occurred while saving.", "error");
    }
};

// Expose internal state to window for shared logic in ui.js
Object.defineProperty(window, 'currentPage', {
    get: () => currentPage,
    set: (val) => { currentPage = val; }
});
Object.defineProperty(window, 'customerFilter', {
    get: () => customerFilter,
    set: (val) => { customerFilter = val; }
});
