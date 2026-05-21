/**
 * laven - Services Module
 * Handles services and addons listing and management
 */

// Global State
let allServices = [];
let allAddons = [];
let currentEditItemId = null;
let currentEditItemType = null; // 'service' or 'addon'

/**
 * Task 2: Fetch and Display Logic
 */
async function loadServicesAndAddons() {
    try {
        console.log("Fetching services and addons...");

        // Fetch from Python backend
        const services = await window.pywebview.api.get_services();
        const addons = await window.pywebview.api.get_addons();

        // Store in global arrays
        allServices = services || [];
        allAddons = addons || [];

        // Render tables
        renderServicesTable();
        renderAddonsTable();

    } catch (error) {
        console.error("Error loading services/addons:", error);
    }
}

function renderServicesTable() {
    // Select the FIRST .data-table tbody in the DOM
    const tables = document.querySelectorAll('.data-table');
    if (tables.length === 0) return;

    const tbody = tables[0].querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = allServices.map(s => `
        <tr>
            <td class="id-cell">#S-${s.serviceID}</td>
            <td>${s.serviceName}</td>
            <td>₱${parseFloat(s.price).toFixed(2)}</td>
            <td class="action-buttons">
                <button class="action-btn admin-only-action" onclick="window.openServiceModal(${s.serviceID})">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="action-btn delete admin-only-action" onclick="window.handleServiceDelete(event, ${s.serviceID})">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
}

function renderAddonsTable() {
    // Select the SECOND .data-table tbody
    const tables = document.querySelectorAll('.data-table');
    if (tables.length < 2) return;

    const tbody = tables[1].querySelector('tbody');
    if (!tbody) return;

    tbody.innerHTML = allAddons.map(a => `
        <tr>
            <td class="id-cell">#A-${a.addonID}</td>
            <td>${a.addonName}</td>
            <td>₱${parseFloat(a.price).toFixed(2)}</td>
            <td class="action-buttons">
                <button class="action-btn admin-only-action" onclick="window.openAddonModal(${a.addonID})">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="action-btn delete admin-only-action" onclick="window.handleAddonDelete(event, ${a.addonID})">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
}

// Task 3: Unified Modal Logic
window.selectItemType = (item, value) => {
    // 1. Visual update
    window.selectOption(item, value);

    // 2. Contextual UI updates
    const nameLabel = document.getElementById('itemNameLabel');
    const priceLabel = document.getElementById('itemPriceLabel');
    const nameInput = document.getElementById('itemName');

    if (value === 'Laundry Service') {
        if (nameLabel) nameLabel.textContent = 'Service Name';
        if (priceLabel) priceLabel.textContent = 'Price per Unit (₱)';
        if (nameInput) nameInput.placeholder = 'e.g. Wash & Dry';
    } else {
        if (nameLabel) nameLabel.textContent = 'Add-on Name';
        if (priceLabel) priceLabel.textContent = 'Price per Unit (₱)';
        if (nameInput) nameInput.placeholder = 'e.g. Detergent';
    }
};

window.openServiceModal = async (id = null) => {
    let modal = document.getElementById('newItemModal');
    if (!modal) {
        const success = await window.loadModal('new-item', 'new-item-modal-mount');
        if (!success) return;
        modal = document.getElementById('newItemModal');
    }

    currentEditItemId = id;
    currentEditItemType = 'service';

    const titleEl = document.getElementById('newItemModalTitle');
    const typeTrigger = document.querySelector('#itemTypeTrigger .selected-value');
    const typeTriggerBtn = document.getElementById('itemTypeTrigger');
    const nameInput = document.getElementById('itemName');
    const priceInput = document.getElementById('itemPrice');

    if (typeTrigger) typeTrigger.textContent = "Laundry Service";
    if (typeTriggerBtn) typeTriggerBtn.disabled = id !== null; // Disable type change when editing

    // Trigger label updates
    window.selectItemType({ closest: () => typeTriggerBtn?.parentElement }, 'Laundry Service');

    if (id) {
        if (titleEl) titleEl.textContent = 'Edit Service';
        const item = allServices.find(s => s.serviceID == id);
        if (item) {
            if (nameInput) nameInput.value = item.serviceName;
            if (priceInput) priceInput.value = item.price;
        }
    } else {
        if (titleEl) titleEl.textContent = 'Add New Service';
        if (nameInput) nameInput.value = '';
        if (priceInput) priceInput.value = '';
    }

    if (modal) {
        const step = modal.querySelector('.modal-step');
        if (step) step.classList.add('active');
        window.openModal('newItemModal');
    }
};

window.openAddonModal = async (id = null) => {
    let modal = document.getElementById('newItemModal');
    if (!modal) {
        const success = await window.loadModal('new-item', 'new-item-modal-mount');
        if (!success) return;
        modal = document.getElementById('newItemModal');
    }

    currentEditItemId = id;
    currentEditItemType = 'addon';

    const titleEl = document.getElementById('newItemModalTitle');
    const typeTrigger = document.querySelector('#itemTypeTrigger .selected-value');
    const typeTriggerBtn = document.getElementById('itemTypeTrigger');
    const nameInput = document.getElementById('itemName');
    const priceInput = document.getElementById('itemPrice');

    if (typeTrigger) typeTrigger.textContent = "Add-on";
    if (typeTriggerBtn) typeTriggerBtn.disabled = id !== null; // Disable type change when editing

    // Trigger label updates
    window.selectItemType({ closest: () => typeTriggerBtn?.parentElement }, 'Add-on');

    if (id) {
        if (titleEl) titleEl.textContent = 'Edit Add-on';
        const item = allAddons.find(a => a.addonID == id);
        if (item) {
            if (nameInput) nameInput.value = item.addonName;
            if (priceInput) priceInput.value = item.price;
        }
    } else {
        if (titleEl) titleEl.textContent = 'Add New Add-on';
        if (nameInput) nameInput.value = '';
        if (priceInput) priceInput.value = '';
    }

    if (modal) {
        const step = modal.querySelector('.modal-step');
        if (step) step.classList.add('active');
        window.openModal('newItemModal');
    }
};

window.closeNewItemModal = () => {
    window.closeModal('newItemModal');
    const nameInput = document.getElementById('itemName');
    const priceInput = document.getElementById('itemPrice');
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    currentEditItemId = null;
    currentEditItemType = null;
};

window.saveNewItem = async () => {
    const typeTrigger = document.querySelector('#itemTypeTrigger .selected-value');
    const nameInput = document.getElementById('itemName');
    const priceInput = document.getElementById('itemPrice');

    if (!typeTrigger || !nameInput || !priceInput) return;

    const type = typeTrigger.textContent.trim();
    const name = nameInput.value.trim();
    const priceRaw = priceInput.value.trim();

    const nameVal = window.validateName(name, type === "Laundry Service" ? "Service Name" : "Add-on Name");
    if (!nameVal.valid) {
        window.showToast(nameVal.reason, "error");
        return;
    }
    const priceVal = window.validatePrice(priceRaw, "Price");
    if (!priceVal.valid) {
        window.showToast(priceVal.reason, "error");
        return;
    }

    const price = parseFloat(priceRaw);

    try {
        let response;
        const isService = (type === "Laundry Service");

        if (currentEditItemId === null) {
            // Add Mode
            if (isService) {
                response = await window.pywebview.api.add_service(name, price);
            } else {
                response = await window.pywebview.api.add_addon(name, price);
            }
        } else {
            // Edit Mode
            if (isService) {
                response = await window.pywebview.api.update_service(currentEditItemId, name, price);
            } else {
                response = await window.pywebview.api.update_addon(currentEditItemId, name, price);
            }
        }

        if (response && response.status === "success") {
            window.showToast(`${type} saved successfully!`, "success");
            window.closeNewItemModal();
            await loadServicesAndAddons();
        } else {
            window.showToast("Error: " + (response ? response.message : "Unknown error"), "error");
        }
    } catch (err) {
        console.error("Save Item Failed:", err);
        window.showToast("A system error occurred while saving.", "error");
    }
};

/**
 * Task 4: Deletion
 */
window.handleServiceDelete = async (event, id) => {
    if (event) event.stopPropagation();

    const service = allServices.find(s => s.serviceID == id);
    const name = service ? service.serviceName : id;

    window.openDeleteConfirm({
        title: 'Delete Service',
        message: `Are you sure you want to delete the ${name} service?`,
        confirmText: 'Yes, Delete',
        onConfirm: async () => {
            const result = await window.pywebview.api.delete_service(id);
            if (result.status === "success") {
                window.showToast("Service deleted successfully!", "success");
                await loadServicesAndAddons();
            } else {
                window.showToast("Error: " + result.message, "error");
            }
        }
    });
};

window.handleAddonDelete = async (event, id) => {
    if (event) event.stopPropagation();

    const addon = allAddons.find(a => a.addonID == id);
    const name = addon ? addon.addonName : id;

    window.openDeleteConfirm({
        title: 'Delete Addon',
        message: `Are you sure you want to delete the ${name} addon?`,
        confirmText: 'Yes, Delete',
        onConfirm: async () => {
            const result = await window.pywebview.api.delete_addon(id);
            if (result.status === "success") {
                window.showToast("Add-on deleted successfully!", "success");
                await loadServicesAndAddons();
            } else {
                window.showToast("Error: " + result.message, "error");
            }
        }
    });
};

// Global Bindings
window.loadServicesAndAddons = loadServicesAndAddons;
