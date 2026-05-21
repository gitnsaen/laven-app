/**
 * laven - Orders Module
 * Handles order listing, filtering, and status management
 */

// Global State
let allOrders = [];
let filteredOrders = [];
let currentOrderPage = 1;
const orderRowsPerPage = 15;
let orderFilter = 'All';

// Add Order Draft State
let orderDraft = {
    load: 1,
    serviceIds: [],
    addons: {},
    customerName: '',
    contactNum: '',
    employeeId: null,
    paymentMethod: 'Cash',
    amountDue: 0,
    amountPaid: 0
};

let currentFormData = { services: [], addons: [], employees: [] };

// --- ADD ORDER WIZARD --- //

window.openOrderModal = async () => {
    let modal = document.getElementById('addOrderModal');
    if (!modal) {
        const loaded = await window.loadModal('add-order', 'add-order-modal-mount');
        if (!loaded) return;
        modal = document.getElementById('addOrderModal');
    }

    currentFormData = await window.pywebview.api.get_order_form_data();

    // Services Grid
    const servicesGrid = document.querySelector('.services-grid');
    if (servicesGrid) {
        servicesGrid.innerHTML = currentFormData.services.map(s => `
            <div class="service-select-card" onclick="window.toggleService(this, ${s.serviceID}, ${s.price})">
                <i data-lucide="${getServiceIcon(s.serviceName)}" class="mx-auto"></i>
                <p class="service-name">${s.serviceName}</p>
                <p class="service-price">₱${s.price.toFixed(2)}</p>
            </div>
        `).join('');
    }

    // Addons List
    const addonsList = document.querySelector('.addons-list');
    if (addonsList) {
        addonsList.innerHTML = currentFormData.addons.map(a => `
            <div class="addon-item">
                <i data-lucide="${getAddonIcon(a.addonName)}" class="text-teal-500"></i>
                <div class="addon-info">
                    <p class="addon-name">${a.addonName}</p>
                    <p class="addon-price">₱${a.price.toFixed(2)}</p>
                </div>
                <div class="counter mini">
                    <button onclick="window.updateAddon(${a.addonID}, ${a.price}, -1)">-</button>
                    <span id="addonCount-${a.addonID}">0</span>
                    <button onclick="window.updateAddon(${a.addonID}, ${a.price}, 1)">+</button>
                </div>
            </div>
        `).join('');
    }

    // Employees Dropdown
    const empDropdownMenu = document.querySelector('#step2 .dropdown-menu');
    const empTrigger = document.querySelector('#step2 .selected-value');
    if (empDropdownMenu && currentFormData.employees.length > 0) {
        empDropdownMenu.innerHTML = currentFormData.employees.map(e => {
            const fullName = `${e.firstName} ${e.midInit ? e.midInit + ' ' : ''}${e.lastName}`;
            return `
                <div class="dropdown-item" onclick="window.selectOption(this, '${fullName}'); window.selectEmployee(${e.employeeID})">
                    ${fullName}
                </div>
            `;
        }).join('');

        if (empTrigger) empTrigger.textContent = 'Select Employee';
    }

    window.clearStep1();
    window.clearStep2();
    window.updateModalTimestamp();

    // Set anticipated order ID in banner (zero-padded)
    const banner = document.getElementById('summaryOrderBanner');
    if (banner && currentFormData.nextOrderId) {
        const padded = String(currentFormData.nextOrderId).padStart(4, '0');
        banner.textContent = `Order #${padded}`;
    }

    window.nextStep(1);
    if (window.lucide) window.lucide.createIcons();
    window.openModal('addOrderModal');
};

window.nextStep = (stepNumber) => {
    const targetId = `step${stepNumber}`;
    const targetStep = document.getElementById(targetId);
    if (!targetStep) return;

    // Scope to the parent modal to avoid clearing steps in other modals
    const modal = targetStep.closest('.modal-overlay');
    if (!modal) return;

    // Validation for Add Order Wizard
    if (modal.id === 'addOrderModal') {
        const currentStep = modal.querySelector('.modal-step.active');
        const currentStepId = currentStep ? currentStep.id : 'step1';

        // Validation for Step 1 -> Step 2
        if (currentStepId === 'step1' && stepNumber === 2) {
            if (!orderDraft.serviceIds || orderDraft.serviceIds.length === 0) {
                window.showToast("Please select at least one service.", "error");
                return;
            }
            window.calculateAmountDue();
        }

        // Validation for Step 2 -> Step 3
        if (currentStepId === 'step2' && stepNumber === 3) {
            const name = document.getElementById('custNameInput')?.value.trim();
            const contact = document.getElementById('custContactInput')?.value.trim();
            const paidInput = document.getElementById('amountPaidInput');
            const paidRaw = paidInput ? paidInput.value.trim() : "";

            const nameVal = window.validateName(name, "Customer Name");
            if (!nameVal.valid) {
                window.showToast(nameVal.reason, "error");
                return;
            }
            const phoneVal = window.validatePhone(contact, "Contact Number");
            if (!phoneVal.valid) {
                window.showToast(phoneVal.reason, "error");
                return;
            }
            if (!orderDraft.employeeId) {
                window.showToast("Please select an Employee.", "error");
                return;
            }
            const priceVal = window.validatePrice(paidRaw, "Amount Paid");
            if (!priceVal.valid) {
                window.showToast(priceVal.reason, "error");
                return;
            }

            orderDraft.customerName = name;
            orderDraft.contactNum = contact;
            window.generateOrderSummary();
        }
    }

    // Toggle steps only within the current modal
    modal.querySelectorAll('.modal-step').forEach(step => step.classList.remove('active'));
    targetStep.classList.add('active');
};

window.closeOrderModal = () => {
    window.closeModal('addOrderModal');
};

window.clearForm = () => {
    const activeStep = document.querySelector('.modal-step.active');
    const stepId = activeStep ? activeStep.id : 'step1';

    if (stepId === 'step1') {
        window.clearStep1();
    } else if (stepId === 'step2') {
        window.clearStep2();
    }
}

window.selectEmployee = (employeeId) => {
    orderDraft.employeeId = employeeId;
};

window.selectPaymentMethod = (method) => {
    orderDraft.paymentMethod = method;
};

// --- STEP 1 LOGIC --- //

window.updateLoad = (change) => {
    orderDraft.load = Math.max(1, orderDraft.load + change);
    const loadText = document.getElementById('loadText');
    if (loadText) loadText.textContent = `${orderDraft.load} kg`;
};

window.toggleService = (element, serviceId, price) => {
    element.classList.toggle('active');

    if (element.classList.contains('active')) {
        if (!orderDraft.serviceIds.includes(serviceId)) {
            orderDraft.serviceIds.push(serviceId);
        }
    } else {
        orderDraft.serviceIds = orderDraft.serviceIds.filter(id => id !== serviceId);
    }
};

window.updateAddon = (addonId, price, change) => {
    if (!orderDraft.addons[addonId]) {
        orderDraft.addons[addonId] = { quantity: 0, price: price };
    }
    orderDraft.addons[addonId].quantity = Math.max(0, orderDraft.addons[addonId].quantity + change);
    const countSpan = document.getElementById(`addonCount-${addonId}`);
    if (countSpan) countSpan.textContent = orderDraft.addons[addonId].quantity;
};

window.clearStep1 = () => {
    orderDraft.load = 1;
    orderDraft.serviceIds = [];
    orderDraft.addons = {};

    const loadText = document.getElementById('loadText');
    if (loadText) loadText.textContent = '1 kg';

    document.querySelectorAll('.service-select-card').forEach(card => card.classList.remove('active'));
    document.querySelectorAll('.addons-list .counter span').forEach(span => span.textContent = '0');
};

// --- STEP 2 LOGIC --- //

window.calculateAmountDue = () => {
    let total = 0;

    // Sum all selected services
    for (const sid of orderDraft.serviceIds) {
        const service = currentFormData.services.find(s => s.serviceID === sid);
        if (service) {
            total += service.price * orderDraft.load;
        }
    }

    for (const [id, addon] of Object.entries(orderDraft.addons)) {
        total += addon.quantity * addon.price;
    }

    orderDraft.amountDue = total;
    const dueDisplay = document.getElementById('amountDueDisplay');
    if (dueDisplay) dueDisplay.textContent = `₱${total.toFixed(2)}`;

    const paidInput = document.getElementById('amountPaidInput');
    if (paidInput) {
        // Auto-fill amount paid if it was zero or previous due
        const currentPaid = parseFloat(paidInput.value.replace(/[^0-9.]/g, '') || 0);
        if (currentPaid === 0) {
            paidInput.value = `₱${total.toFixed(2)}`;
            orderDraft.amountPaid = total;
        } else {
            orderDraft.amountPaid = currentPaid;
        }
        window.updatePaymentStatusBadge();
    }
};

window.handleAmountPaidInput = (el) => {
    let val = el.value.replace(/[^0-9.]/g, '');
    if (val === '') val = '0';

    orderDraft.amountPaid = parseFloat(val);

    if (!el.matches(':focus')) {
        el.value = `₱${orderDraft.amountPaid.toFixed(2)}`;
    }

    window.updatePaymentStatusBadge();
};

window.updatePaymentStatusBadge = () => {
    const statusBadge = document.getElementById('paymentStatusBadge');
    if (!statusBadge) return;

    if (orderDraft.amountPaid >= orderDraft.amountDue && orderDraft.amountDue > 0) {
        statusBadge.textContent = "Fully Paid";
        statusBadge.setAttribute('data-status', 'Paid');
    } else if (orderDraft.amountPaid > 0) {
        statusBadge.textContent = "Partially Paid";
        statusBadge.setAttribute('data-status', 'Partially Paid');
    } else {
        statusBadge.textContent = "Unpaid";
        statusBadge.setAttribute('data-status', 'Unpaid');
    }
};

window.clearStep2 = () => {
    const custName = document.getElementById('custNameInput');
    if (custName) custName.value = '';

    const custContact = document.getElementById('custContactInput');
    if (custContact) custContact.value = '';

    const paidInput = document.getElementById('amountPaidInput');
    if (paidInput) paidInput.value = '₱0.00';

    orderDraft.customerName = '';
    orderDraft.contactNum = '';
    orderDraft.employeeId = null;
    orderDraft.paymentMethod = 'Cash';
    orderDraft.amountPaid = 0;
};

// --- STEP 3 LOGIC --- //

window.generateOrderSummary = () => {
    const tbody = document.querySelector('.summary-table tbody');
    if (!tbody) return;

    let rowsHtml = '';
    // Services
    if (orderDraft.serviceIds && orderDraft.serviceIds.length > 0) {
        rowsHtml += `<tr class="table-group-header"><td colspan="4">Services</td></tr>`;
        for (const sid of orderDraft.serviceIds) {
            const service = currentFormData.services.find(s => s.serviceID === sid);
            if (service) {
                const cost = service.price * orderDraft.load;
                rowsHtml += `
                    <tr>
                        <td>${service.serviceName}</td>
                        <td>₱${service.price.toFixed(2)}</td>
                        <td>${orderDraft.load} kg</td>
                        <td class="text-right">₱${cost.toFixed(2)}</td>
                    </tr>
                `;
            }
        }
    }

    // Addons
    const activeAddons = Object.entries(orderDraft.addons).filter(([id, a]) => a.quantity > 0);
    if (activeAddons.length > 0) {
        rowsHtml += `<tr class="table-group-header"><td colspan="4">Add-ons</td></tr>`;
        for (const [id, data] of activeAddons) {
            const addonDef = currentFormData.addons.find(a => a.addonID == id);
            const name = addonDef ? addonDef.addonName : 'Addon';
            const cost = data.quantity * data.price;
            rowsHtml += `
                <tr>
                    <td>${name}</td>
                    <td>₱${data.price.toFixed(2)}</td>
                    <td>${data.quantity}</td>
                    <td class="text-right">₱${cost.toFixed(2)}</td>
                </tr>
            `;
        }
    }

    tbody.innerHTML = rowsHtml;

    // Totals & Display
    const summaryTotalDue = document.querySelector('.table-total td:last-child');
    if (summaryTotalDue) summaryTotalDue.textContent = `₱${orderDraft.amountDue.toFixed(2)}`;

    const balance = orderDraft.amountDue - orderDraft.amountPaid;
    const summaryBalance = document.getElementById('summaryBalance');
    const balanceRow = document.getElementById('summaryBalanceRow');

    if (summaryBalance) summaryBalance.textContent = `₱${balance.toFixed(2)}`;
    if (balanceRow) balanceRow.style.display = balance > 0 ? 'flex' : 'none';

    const summaryAmountPaid = document.getElementById('summaryAmountPaid');
    if (summaryAmountPaid) summaryAmountPaid.textContent = `₱${orderDraft.amountPaid.toFixed(2)}`;

    let statusText = "Unpaid";
    let statusClass = "unpaid";
    if (balance <= 0 && orderDraft.amountDue > 0) {
        statusText = "Fully Paid";
        statusClass = "paid";
    } else if (orderDraft.amountPaid > 0) {
        statusText = "Partially Paid";
        statusClass = "partial";
    }

    const summaryPaymentStatus = document.getElementById('summaryPaymentStatus');
    if (summaryPaymentStatus) {
        summaryPaymentStatus.textContent = statusText;
        summaryPaymentStatus.className = `info-tag status-tag ${statusClass}`;
    }

    const summaryTags = document.querySelectorAll('#step3 .info-tag');
    if (summaryTags.length >= 3) {
        summaryTags[0].textContent = orderDraft.customerName || 'N/A';
        summaryTags[1].textContent = orderDraft.contactNum || 'N/A';
        const empTrigger = document.querySelector('#step2 .selected-value');
        summaryTags[2].textContent = empTrigger ? empTrigger.textContent : 'N/A';
    }
};

window.submitOrder = async () => {
    try {
        const result = await window.pywebview.api.create_order(orderDraft);
        if (result.status === "success") {
            window.showToast("Order placed successfully!", "success");
            window.closeOrderModal();
            if (window.currentView === 'dashboard' && typeof window.loadDashboardData === 'function') {
                await window.loadDashboardData();
            } else {
                await loadOrders();
            }
        } else {
            window.showToast("Error: " + result.message, "error");
        }
    } catch (err) {
        console.error("Submit Order Failed:", err);
        window.showToast("A system error occurred while submitting.", "error");
    }
};

// --- UPDATE STATUS MODAL --- //

window.openUpdateStatusModal = async (orderId) => {
    const order = await window.pywebview.api.get_order_details(orderId);
    if (!order) return;

    let modal = document.getElementById('updateStatusModal');
    if (!modal) {
        const loaded = await window.loadModal('update-status', 'update-status-modal-mount');
        if (!loaded) return;
        modal = document.getElementById('updateStatusModal');
    }

    // Populate data
    document.getElementById('updateOrderIdText').textContent = `Order #${order.LaundryOrderID}`;
    document.getElementById('updateOrderIdText').setAttribute('data-id', order.LaundryOrderID);

    document.getElementById('updatePaymentStatusBadge').textContent = order.paymentStatus;
    document.getElementById('updatePaymentStatusBadge').setAttribute('data-status', order.paymentStatus);

    document.getElementById('updateAmountDue').textContent = `₱${order.amount.toFixed(2)}`;
    document.getElementById('updateAmountPaid').textContent = `₱${order.totalPaid.toFixed(2)}`;
    document.getElementById('updateBalance').textContent = `₱${order.balance.toFixed(2)}`;

    // Reset inputs
    const statusTrigger = document.querySelector('#updateOrderStatusTrigger');
    if (statusTrigger) {
        statusTrigger.querySelector('.selected-value').textContent = order.LaundryOrderStatus;
        statusTrigger.setAttribute('data-status', order.LaundryOrderStatus);
    }

    const paymentInput = document.getElementById('addPaymentInput');
    if (paymentInput) paymentInput.value = '';

    const progressSection = document.getElementById('updateProgressSection');
    if (progressSection) {
        if (window.currentView === 'revenue') {
            progressSection.style.display = 'none';
        } else {
            progressSection.style.display = 'block';
        }
    }

    const paymentMethodSection = document.getElementById('updatePaymentMethodSection');
    if (paymentMethodSection) {
        paymentMethodSection.style.display = 'none';
    }

    window.handleUpdatePaymentInput(paymentInput); // Initialize preview

    window.openModal('updateStatusModal');
};

// Updates the status dropdown trigger text AND color
window.selectStatusAndColor = (item, value) => {
    window.selectOption(item, value);
    const trigger = document.getElementById('updateOrderStatusTrigger');
    if (trigger) trigger.setAttribute('data-status', value);
};

window.handleUpdatePaymentInput = (el) => {
    const val = parseFloat((el && el.value) ? el.value.replace(/[^0-9.]/g, '') : 0) || 0;
    const due = parseFloat(document.getElementById('updateAmountDue').textContent.replace('₱', ''));
    const paid = parseFloat(document.getElementById('updateAmountPaid').textContent.replace('₱', ''));
    const newBalance = Math.max(0, due - paid - val);

    const newTotalPaid = paid + val;
    let previewStatus = "Unpaid";
    if (newTotalPaid >= due && due > 0) {
        previewStatus = "Fully Paid";
    } else if (newTotalPaid > 0) {
        previewStatus = "Partially Paid";
    }

    const previewEl = document.getElementById('newPaymentStatusPreview');
    if (previewEl) {
        previewEl.textContent = previewStatus;
        if (previewStatus === 'Fully Paid') {
            previewEl.style.color = 'var(--ready-text)';
        } else if (previewStatus === 'Partially Paid') {
            previewEl.style.color = 'var(--progress-text)';
        } else {
            previewEl.style.color = 'var(--pending-text)';
        }
    }

    const paymentMethodSection = document.getElementById('updatePaymentMethodSection');
    if (paymentMethodSection) {
        if (val > 0) {
            paymentMethodSection.style.display = 'block';
        } else {
            paymentMethodSection.style.display = 'none';
        }
    }
};

window.saveUpdateStatus = async () => {
    const idAttr = document.getElementById('updateOrderIdText').getAttribute('data-id');
    const orderId = parseInt(idAttr);
    const statusTrigger = document.querySelector('#updateOrderStatusTrigger .selected-value');
    const newStatus = window.currentView === 'revenue' ? null : statusTrigger.textContent;

    const paymentInput = document.getElementById('addPaymentInput');
    const paymentInputVal = paymentInput ? paymentInput.value.trim() : "";
    let additionalPayment = 0;

    if (paymentInputVal !== "") {
        const priceVal = window.validatePrice(paymentInputVal, "Record Payment Amount");
        if (!priceVal.valid) {
            window.showToast(priceVal.reason, "error");
            return;
        }
        additionalPayment = parseFloat(paymentInputVal.replace(/[₱,\s]/g, ''));
    }

    const paymentMethodTrigger = document.querySelector('#updatePaymentMethodTrigger .selected-value');
    const paymentMethod = paymentMethodTrigger ? paymentMethodTrigger.textContent : 'Cash';

    try {
        const response = await window.pywebview.api.update_order_status_and_payment(orderId, newStatus, additionalPayment, paymentMethod);
        if (response.status === "success") {
            window.showToast("Order status updated successfully!", "success");
            window.closeModal('updateStatusModal');
            if (window.currentView === 'revenue' && typeof window.loadRevenue === 'function') {
                await window.loadRevenue();
            } else if (window.currentView === 'dashboard' && typeof window.loadDashboardData === 'function') {
                await window.loadDashboardData();
            } else {
                await loadOrders();
            }
        } else {
            window.showToast("Error: " + response.message, "error");
        }
    } catch (err) {
        console.error("Update failed:", err);
        window.showToast("A system error occurred while updating.", "error");
    }
};

// --- TABLE AND LISTING LOGIC --- //

async function loadOrders() {
    try {
        allOrders = await window.pywebview.api.get_all_orders();
        window.allOrders = allOrders;
        setupOrderFilters();
        applyOrderFilters();
    } catch (error) {
        console.error("Error loading orders:", error);
    }
}

function renderOrderTable() {
    const tableWrapper = document.querySelector('.orders-management-wrapper');
    if (!tableWrapper) return;

    const tbody = tableWrapper.querySelector('.data-table tbody');
    const infoEl = tableWrapper.querySelector('.pagination-info');
    if (!tbody) return;

    const total = filteredOrders.length;
    const start = total === 0 ? 0 : (currentOrderPage - 1) * orderRowsPerPage;
    const end = Math.min(start + orderRowsPerPage, total);
    const displayList = filteredOrders.slice(start, end);

    tbody.innerHTML = displayList.map(order => {
        const isCancelled = order.status === 'Cancelled';
        const rowStyle = isCancelled ? 'background-color: #f9fafb; color: #9ca3af;' : '';
        const cellOpacity = isCancelled ? 'opacity: 0.5;' : '';
        const idStyle = isCancelled ? 'text-decoration: line-through;' : '';

        return `
        <tr style="${rowStyle}">
            <td class="id-cell" style="${cellOpacity} ${idStyle}">#${order.orderID}</td>
            <td style="${cellOpacity}">
                <div class="customer-info">
                    <span class="name" style="${isCancelled ? 'color: #9ca3af;' : ''}">${order.customerName}</span>
                    <span class="phone" style="${isCancelled ? 'color: #d1d5db;' : ''}">${order.contactNum || ''}</span>
                </div>
            </td>
            <td style="${cellOpacity}">${order.datePlaced}</td>
            <td style="${cellOpacity}">${order.dateClaimed || '-'}</td>
            <td class="summary-clickable" onclick="window.openViewOrderModal(${order.orderID})" style="cursor: pointer; opacity: 1; position: relative; z-index: 2;">
                <div class="summary-cell">
                    <span class="items" style="${isCancelled ? 'color: var(--text-main);' : ''}">${order.summary}</span>
                    <span class="price" style="${isCancelled ? 'color: var(--text-main);' : ''}">₱${parseFloat(order.amount || 0).toFixed(2)}</span>
                </div>
            </td>
            <td class="payment-cell" style="${cellOpacity}">
                <span class="status-badge" data-status="${order.paymentStatus || 'Unpaid'}">${order.paymentStatus || 'Unpaid'}</span>
            </td>
            <td class="status-cell">
                <button class="modal-dropdown-trigger small" onclick="window.openUpdateStatusModal(${order.orderID})" data-status="${order.status}" ${isCancelled ? 'disabled style="pointer-events: none; opacity: 0.5; border-color: #e5e7eb; background: #f3f4f6; color: #9ca3af;"' : ''}>
                    <span class="selected-value">${order.status}</span>
                    ${isCancelled ? '' : '<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>'}
                </button>
            </td>
            <td class="action-buttons" style="${cellOpacity}">
                ${!isCancelled ? `
                    <button class="action-btn delete" title="Cancel Order" onclick="window.handleOrderCancel(event, ${order.orderID})">
                        <i data-lucide="ban"></i>
                    </button>
                ` : `
                    <button class="action-btn" disabled style="opacity: 0.5; cursor: not-allowed;">
                        <i data-lucide="ban"></i>
                    </button>
                `}
            </td>
        </tr>
        `;
    }).join('');

    if (infoEl) {
        infoEl.textContent = `Showing ${total === 0 ? 0 : start + 1} to ${end} of ${total} entries`;
    }

    renderOrderPagination(total);
    if (window.lucide) window.lucide.createIcons();
}

function renderOrderPagination(total) {
    const container = document.querySelector('.pagination-controls');
    if (!container) return;

    const totalPages = Math.ceil(total / orderRowsPerPage);
    let html = `
        <button class="page-btn nav" ${currentOrderPage === 1 ? 'disabled' : ''} data-order-page="${currentOrderPage - 1}">Prev</button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentOrderPage ? 'active' : ''}" data-order-page="${i}">${i}</button>`;
    }

    html += `
        <button class="page-btn nav" ${currentOrderPage === totalPages || total === 0 ? 'disabled' : ''} data-order-page="${currentOrderPage + 1}">Next</button>
    `;

    container.innerHTML = html;
}

function setupOrderFilters() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            orderFilter = tab.textContent.trim();
            currentOrderPage = 1;
            applyOrderFilters();
        };
    });
}

function applyOrderFilters() {
    const searchInput = document.querySelector('.search-input');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (!window.allOrders) {
        window.allOrders = allOrders;
    }

    filteredOrders = window.allOrders.filter(order => {
        const matchesStatus = (orderFilter === 'All' || order.status === orderFilter);
        const matchesSearch = (
            (order.orderID || '').toString().includes(term) ||
            (order.customerName || '').toLowerCase().includes(term) ||
            (order.contactNum && order.contactNum.toLowerCase().includes(term))
        );

        return matchesStatus && matchesSearch;
    });

    renderOrderTable();
}

window.changeOrderPage = (page) => {
    currentOrderPage = page;
    renderOrderTable();
};

window.handleOrderCancel = async (event, id) => {
    if (event) event.stopPropagation();
    window.openDeleteConfirm({
        title: 'Cancel Order',
        message: `Are you sure you want to cancel Order #${id}? This action is irreversible and the status will be locked.`,
        confirmText: 'Yes, Cancel',
        cancelText: 'Keep it',
        processingText: 'Cancelling...',
        onConfirm: async () => {
            const response = await window.pywebview.api.update_order_status_and_payment(id, 'Cancelled', 0);
            if (response.status === "success") {
                window.showToast(`Order #${id} has been cancelled.`, "success");
                await loadOrders();
            } else {
                window.showToast("Error: " + response.message, "error");
            }
        }
    });
};

window.updateModalTimestamp = () => {
    const timestampEl = document.querySelector('.summary-timestamp');
    if (timestampEl) {
        const now = new Date();
        const options = {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            weekday: 'long',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        const formatted = now.toLocaleDateString('en-GB', options);
        const parts = formatted.split(' at ');
        timestampEl.innerHTML = `${parts[0]}<br>${parts[1] || ''}`;
    }
};

// Helper icons
function getServiceIcon(name) {
    name = name.toLowerCase();
    if (name.includes('wash') && name.includes('dry')) return 'washing-machine';
    if (name.includes('wash')) return 'washing-machine';
    if (name.includes('dry')) return 'wind';
    if (name.includes('fold')) return 'shirt';
    if (name.includes('iron')) return 'iron';
    if (name.includes('comforter')) return 'bed';
    return 'layers';
}

function getAddonIcon(name) {
    name = name.toLowerCase();
    if (name.includes('condit')) return 'droplets';
    if (name.includes('detergent')) return 'sparkles';
    if (name.includes('stain')) return 'droplet';
    if (name.includes('bleach')) return 'waves';
    return 'package';
}

// --- VIEW ORDER MODAL --- //

window.openViewOrderModal = async (orderId) => {
    try {
        console.log("Opening View Order Modal for ID:", orderId);
        const order = await window.pywebview.api.get_order_details(orderId);
        console.log("Order Data Received:", order);
        if (!order) {
            console.error("No order data returned for ID:", orderId);
            return;
        }

        let modal = document.getElementById('viewOrderModal');
        if (!modal) {
            console.log("Modal not found, loading...");
            const loaded = await window.loadModal('view-order', 'view-order-modal-mount');
            if (!loaded) {
                console.error("Failed to load view-order modal HTML");
                return;
            }
            modal = document.getElementById('viewOrderModal');
        }

        // Force reset to first step and ensure it's active
        const steps = modal.querySelectorAll('.modal-step');
        if (steps.length > 0) {
            steps.forEach(s => s.classList.remove('active'));
            steps[0].classList.add('active');
        }

        // Banner
        const padded = String(order.LaundryOrderID || orderId).padStart(4, '0');
        const bannerText = document.getElementById('viewOrderIdBannerText');
        if (bannerText) bannerText.textContent = `Order #${padded}`;

        const statusBadge = document.getElementById('viewOrderOrderStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = order.LaundryOrderStatus || 'Pending';
            statusBadge.setAttribute('data-status', order.LaundryOrderStatus || 'Pending');
        }

        // Items table
        const tbody = document.getElementById('viewOrderItems');
        if (tbody) {
            let rowsHtml = '';
            if (order.services && order.services.length > 0) {
                rowsHtml += `<tr class="table-group-header"><td colspan="4">Services</td></tr>`;
                for (const s of order.services) {
                    const price = parseFloat(s.price || 0);
                    const qty = parseFloat(s.quantity || 0);
                    const cost = price * qty;
                    rowsHtml += `<tr><td>${s.serviceName || 'Service'}</td><td>₱${price.toFixed(2)}</td><td>${qty} kg</td><td class="text-right">₱${cost.toFixed(2)}</td></tr>`;
                }
            }
            if (order.addons && order.addons.length > 0) {
                rowsHtml += `<tr class="table-group-header"><td colspan="4">Add-ons</td></tr>`;
                for (const a of order.addons) {
                    const price = parseFloat(a.price || 0);
                    const qty = parseFloat(a.quantity || 0);
                    const cost = price * qty;
                    rowsHtml += `<tr><td>${a.addonName || 'Add-on'}</td><td>₱${price.toFixed(2)}</td><td>${qty}</td><td class="text-right">₱${cost.toFixed(2)}</td></tr>`;
                }
            }
            tbody.innerHTML = rowsHtml || '<tr><td colspan="4" class="text-center">No items found</td></tr>';
        }

        // Totals & Details
        const totalEl = document.getElementById('viewOrderTotal');
        if (totalEl) totalEl.textContent = `₱${parseFloat(order.amount || 0).toFixed(2)}`;

        const customerEl = document.getElementById('viewOrderCustomer');
        if (customerEl) customerEl.textContent = order.customerName || 'N/A';

        const contactEl = document.getElementById('viewOrderContact');
        if (contactEl) contactEl.textContent = order.contactNum || 'N/A';

        const amountDueEl = document.getElementById('viewOrderAmountDue');
        if (amountDueEl) amountDueEl.textContent = `₱${parseFloat(order.amount || 0).toFixed(2)}`;

        const amountPaidEl = document.getElementById('viewOrderAmountPaid');
        if (amountPaidEl) amountPaidEl.textContent = `₱${parseFloat(order.totalPaid || 0).toFixed(2)}`;

        // Payment method with color coding
        const payMethodEl = document.getElementById('viewOrderPaymentMethod');
        const method = order.paymentMethod || 'Cash';
        if (payMethodEl) {
            payMethodEl.textContent = method;
            if (method === 'Cash') {
                payMethodEl.style.background = 'var(--ready-bg)';
                payMethodEl.style.color = 'var(--ready-text)';
            } else if (method === 'G-Cash') {
                payMethodEl.style.background = 'var(--claimed-bg)';
                payMethodEl.style.color = 'var(--claimed-text)';
            } else {
                payMethodEl.style.background = '#EEF2FF';
                payMethodEl.style.color = '#1a4d44';
            }
        }

        // Payment status
        const payStatusEl = document.getElementById('viewOrderSummaryPaymentStatus');
        if (payStatusEl) {
            const status = order.paymentStatus || 'Unpaid';
            payStatusEl.textContent = status;
            payStatusEl.setAttribute('data-status', status);
        }

        // Balance row
        const balanceRow = document.getElementById('viewOrderSummaryBalanceRow');
        const balanceEl = document.getElementById('viewOrderSummaryBalance');
        const balance = parseFloat(order.balance || 0);
        if (balance > 0) {
            if (balanceRow) balanceRow.style.display = 'flex';
            if (balanceEl) balanceEl.textContent = `₱${balance.toFixed(2)}`;
        } else {
            if (balanceRow) balanceRow.style.display = 'none';
        }

        // Timestamp
        const timestampEl = document.getElementById('viewOrderTimestamp');
        if (timestampEl) {
            const datePlaced = order.datePlaced || 'N/A';
            const dateClaimed = order.dateClaimed || '-';
            console.log("View Order Debug - Placed:", datePlaced, "Claimed:", dateClaimed);
            timestampEl.innerHTML = `Placed: ${datePlaced}<br><br>Claimed: ${dateClaimed}`;
        }

        // Wire the Update Status button
        const updateBtn = document.getElementById('viewOrderUpdateBtn') || modal.querySelector('.btn-submit');
        if (updateBtn) {
            if (order.LaundryOrderStatus === 'Cancelled') {
                updateBtn.disabled = true;
                updateBtn.style.opacity = '0.5';
                updateBtn.style.cursor = 'not-allowed';
                updateBtn.style.pointerEvents = 'none';
                updateBtn.textContent = 'Cancelled';
            } else {
                updateBtn.disabled = false;
                updateBtn.style.opacity = '1';
                updateBtn.style.cursor = 'pointer';
                updateBtn.style.pointerEvents = 'auto';
                updateBtn.textContent = 'Update Status';
                updateBtn.onclick = () => {
                    window.closeModal('viewOrderModal');
                    window.openUpdateStatusModal(order.LaundryOrderID);
                };
            }
        }

        if (window.lucide) window.lucide.createIcons();
        window.openModal('viewOrderModal');
    } catch (err) {
        console.error("View Order Modal Error:", err);
        window.showToast("Failed to load order details: " + err.message, "error");
    }
};

window.closeViewOrderModal = () => {
    window.closeModal('viewOrderModal');
};

// Global Bindings
window.loadOrders = loadOrders;
window.applyOrderFilters = applyOrderFilters;
window.handleOrderCancel = handleOrderCancel;
