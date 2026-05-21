/**
 * laven - Revenue Module
 * Handles revenue data, payments table, and statistics
 */

let allPayments = [];
let filteredPayments = [];
let revenueFilter = 'All Payments';
let currentRevenueTimeframe = 'Today';
let currentRevenuePage = 1;
const revenueRowsPerPage = 15;

async function loadRevenue() {
    try {
        const data = await window.pywebview.api.get_revenue_data(currentRevenueTimeframe);
        allPayments = data.payments || [];
        updateSummaryCards(data.summary);

        syncTimeframeSelectors(currentRevenueTimeframe);

        setupRevenueFilters();
        setupSearchBox();
        applyRevenueFilters();
    } catch (error) {
        console.error("Error loading revenue data:", error);
    }
}

function updateSummaryCards(summary) {
    if (!summary) return;

    // Total Collected
    const totalCollectedEl = document.getElementById('revTotal');
    if (totalCollectedEl) totalCollectedEl.textContent = `₱${parseFloat(summary.totalCollected || 0).toFixed(2)}`;

    // Unpaid Balances
    const unpaidBalancesEl = document.getElementById('revUnpaid');
    if (unpaidBalancesEl) unpaidBalancesEl.textContent = `₱${parseFloat(summary.unpaidBalances || 0).toFixed(2)}`;

    // Breakdown Cash vs G-Cash
    const revCash = document.getElementById('revCash');
    const revGCash = document.getElementById('revGCash');
    if (revCash) revCash.textContent = `₱${parseFloat(summary.cash || 0).toFixed(2)}`;
    if (revGCash) revGCash.textContent = `₱${parseFloat(summary.gcash || 0).toFixed(2)}`;

    const progressBar = document.getElementById('revenueProgressBar');
    if (progressBar) {
        const cash = parseFloat(summary.cash || 0);
        const gcash = parseFloat(summary.gcash || 0);
        const total = cash + gcash;

        const cashPercent = total > 0 ? (cash / total) * 100 : 50;
        const gcashPercent = total > 0 ? (gcash / total) * 100 : 50;

        const cashBar = progressBar.querySelector('.bar-cash');
        const gcashBar = progressBar.querySelector('.bar-gcash');

        if (cashBar) cashBar.style.width = `${cashPercent}%`;
        if (gcashBar) gcashBar.style.width = `${gcashPercent}%`;
    }
}

function setupRevenueFilters() {
    const tabs = document.querySelectorAll('.table-controls .filter-tab');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            revenueFilter = tab.textContent.trim();
            currentRevenuePage = 1; // Reset to page 1 on filter change
            applyRevenueFilters();
        };
    });
}

function setupSearchBox() {
    const searchInput = document.querySelector('.table-controls .search-input');
    if (searchInput) {
        searchInput.oninput = () => {
            currentRevenuePage = 1; // Reset to page 1 on search
            applyRevenueFilters();
        };
    }
}

function applyRevenueFilters() {
    const searchInput = document.querySelector('.table-controls .search-input');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    filteredPayments = allPayments.filter(payment => {
        let matchesStatus = false;

        // Match status logic based on table tabs: All Payments, Paid, Partially Paid, Unpaid
        if (revenueFilter === 'All Payments') {
            matchesStatus = true;
        } else if (revenueFilter === 'Paid') {
            matchesStatus = payment.status === 'Paid' && payment.orderProgressStatus !== 'Cancelled';
        } else if (revenueFilter === 'Partially Paid') {
            matchesStatus = payment.status === 'Partially Paid' && payment.orderProgressStatus !== 'Cancelled';
        } else if (revenueFilter === 'Unpaid') {
            matchesStatus = payment.status === 'Unpaid' && payment.orderProgressStatus !== 'Cancelled';
        } else if (revenueFilter === 'Cancelled') {
            matchesStatus = payment.orderProgressStatus === 'Cancelled';
        }

        const matchesSearch = (
            (payment.paymentID && `#PAY-${payment.paymentID}`.toLowerCase().includes(term)) ||
            (payment.orderID && `#${payment.orderID}`.toLowerCase().includes(term))
        );

        return matchesStatus && matchesSearch;
    });

    renderRevenueTable();
}

function renderRevenueTable() {
    const tableWrapper = document.querySelector('.orders-management-wrapper');
    if (!tableWrapper) return;

    const tbody = tableWrapper.querySelector('.data-table tbody');
    if (!tbody) return;

    if (filteredPayments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px;">No payments found.</td></tr>`;
        updatePaginationUI(0, 0, 0, 1);
        return;
    }

    // Pagination slicing
    const totalItems = filteredPayments.length;
    const totalPages = Math.ceil(totalItems / revenueRowsPerPage);
    if (currentRevenuePage > totalPages) currentRevenuePage = Math.max(1, totalPages);

    const start = (currentRevenuePage - 1) * revenueRowsPerPage;
    const end = Math.min(start + revenueRowsPerPage, totalItems);
    const paginatedPayments = filteredPayments.slice(start, end);

    tbody.innerHTML = paginatedPayments.map(payment => {
        const isCancelled = payment.orderProgressStatus === 'Cancelled';

        let methodBadgeClass = payment.method === 'Cash' ? 'ready' : 'claimed';
        let methodBadgeBg = isCancelled ? '#e5e7eb' : `var(--${methodBadgeClass}-bg)`;
        let methodBadgeText = isCancelled ? '#6b7280' : `var(--${methodBadgeClass}-text)`;

        let balanceHtml = '-';
        if (payment.balance > 0) {
            const balanceColor = payment.status === 'Unpaid' ? 'var(--danger)' : 'var(--progress-text)';
            balanceHtml = `<span style="color: ${isCancelled ? '#9ca3af' : balanceColor}; font-weight: 700; ${isCancelled ? 'text-decoration: line-through;' : ''}">₱${parseFloat(payment.balance).toFixed(2)}</span>`;
        } else if (isCancelled) {
            balanceHtml = `<span style="color: #9ca3af; text-decoration: line-through;">₱0.00</span>`;
        }

        const rowStyle = isCancelled ? 'background-color: #f9fafb; color: #9ca3af; opacity: 0.6;' : '';
        const idStyle = isCancelled ? 'color: #9ca3af; cursor: not-allowed; text-decoration: line-through;' : 'color: var(--primary); cursor: pointer;';
        const amountStyle = isCancelled ? 'font-weight: 700; text-decoration: line-through; color: #9ca3af;' : 'font-weight: 700;';

        const paymentIdDisplay = payment.paymentID ? `#PAY-${String(payment.paymentID).padStart(4, '0')}` : '-';

        return `
            <tr style="${rowStyle}">
                <td class="id-cell" style="${isCancelled ? 'text-decoration: line-through;' : ''}">${paymentIdDisplay}</td>
                <td class="id-cell" style="${idStyle}" ${isCancelled ? '' : `onclick="window.openViewOrderModal(${payment.orderID})"`} title="${isCancelled ? 'Cancelled Order' : 'View Order Details'}">#${String(payment.orderID).padStart(4, '0')}</td>
                <td>${payment.date}</td>
                <td><span class="status-badge" style="background: ${methodBadgeBg}; color: ${methodBadgeText}; cursor: pointer; ${isCancelled ? 'opacity: 0.7;' : ''}" onclick='window.openPaymentOverviewModal(${JSON.stringify(payment).replace(/'/g, "&apos;")})'>${payment.method}</span></td>
                <td style="${amountStyle}">₱${parseFloat(payment.amountPaid).toFixed(2)}</td>
                <td class="status-cell">
                    ${isCancelled ? `
                        <button class="modal-dropdown-trigger small" disabled style="opacity: 0.5; cursor: not-allowed; border-color: #e5e7eb; background: #f3f4f6; color: #9ca3af;">
                            <span class="selected-value">Cancelled</span>
                        </button>
                    ` : `
                        <button class="modal-dropdown-trigger small" onclick="window.openUpdateStatusModal(${payment.orderID})" data-status="${payment.status}">
                            <span class="selected-value">${payment.status}</span>
                            <i data-lucide="refresh-cw" style="width: 14px; height: 14px; margin-left: 4px; opacity: 0.6;"></i>
                        </button>
                    `}
                </td>
                <td>${balanceHtml}</td>
            </tr>
        `;
    }).join('');

    updatePaginationUI(start, end, totalItems, totalPages);
    if (window.lucide) window.lucide.createIcons();
}

function updatePaginationUI(start, end, total, totalPages) {
    const pageStart = document.getElementById('revPageStart');
    const pageEnd = document.getElementById('revPageEnd');
    const totalItems = document.getElementById('revTotalItems');

    if (pageStart) pageStart.textContent = total === 0 ? 0 : start + 1;
    if (pageEnd) pageEnd.textContent = end;
    if (totalItems) totalItems.textContent = total;

    const prevBtn = document.getElementById('revPrevBtn');
    const nextBtn = document.getElementById('revNextBtn');
    if (prevBtn) {
        prevBtn.disabled = currentRevenuePage === 1;
        prevBtn.setAttribute('data-rev-page', currentRevenuePage - 1);
    }
    if (nextBtn) {
        nextBtn.disabled = currentRevenuePage === totalPages || totalPages === 0;
        nextBtn.setAttribute('data-rev-page', currentRevenuePage + 1);
    }

    const pageNumbers = document.getElementById('revPageNumbers');
    if (pageNumbers) {
        let html = '';
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentRevenuePage - 2);
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === currentRevenuePage ? 'active' : ''}" data-rev-page="${i}">${i}</button>`;
        }
        pageNumbers.innerHTML = html;
    }
}

window.changeRevenuePage = (delta) => {
    currentRevenuePage += delta;
    renderRevenueTable();
};

window.goToRevenuePage = (page) => {
    currentRevenuePage = page;
    renderRevenueTable();
};

window.setRevenueTimeframe = async (timeframe) => {
    currentRevenueTimeframe = timeframe;
    currentRevenuePage = 1;
    await loadRevenue();
};

function syncTimeframeSelectors(timeframe) {
    document.querySelectorAll('.metric-card .selected-value').forEach(el => {
        el.textContent = timeframe;
    });
}

// Global Bindings
window.loadRevenue = loadRevenue;

window.openPaymentOverviewModal = async (payment) => {
    let modal = document.getElementById('paymentOverviewModal');
    if (!modal) {
        const loaded = await window.loadModal('payment-overview', 'payment-overview-modal-mount');
        if (!loaded) return;
        modal = document.getElementById('paymentOverviewModal');
    }

    const payId = payment.paymentID ? `#PAY-${String(payment.paymentID).padStart(4, '0')}` : 'N/A';
    document.getElementById('overviewPaymentIdText').textContent = payId;
    document.getElementById('overviewOrderId').textContent = `#${String(payment.orderID).padStart(4, '0')}`;

    const methodBadge = document.getElementById('overviewMethodBadge');
    methodBadge.textContent = payment.method;
    if (payment.method === 'Cash') {
        methodBadge.style.background = 'var(--ready-bg)';
        methodBadge.style.color = 'var(--ready-text)';
    } else {
        methodBadge.style.background = 'var(--claimed-bg)';
        methodBadge.style.color = 'var(--claimed-text)';
    }

    document.getElementById('overviewAmountPaid').textContent = `₱${parseFloat(payment.amountPaid).toFixed(2)}`;

    const timeStr = payment.time ? `<br>${payment.time}` : '';
    document.getElementById('overviewDateTime').innerHTML = `${payment.date}${timeStr}`;

    if (window.lucide) window.lucide.createIcons();
    window.openModal('paymentOverviewModal');
};
