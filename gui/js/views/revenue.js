/**
 * laven - Revenue Module
 * Handles revenue data, payments table, and statistics
 */

(() => {
let allPayments = [];
let filteredRevenueOrders = [];
let expandedOrders = new Set();
let revenueFilter = 'All Payments';
let currentRevenueTimeframe = 'Today';
let currentRevenuePage = 1;
const revenueRowsPerPage = 15;
let revenueSortKey = 'orderID';
let revenueSortDirection = 'desc';

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

function parseCustomDate(dateStr) {
    if (!dateStr) return new Date(0);
    let tryStr = dateStr;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateStr)) {
        tryStr = dateStr.replace(' ', 'T');
    }
    const d = new Date(tryStr);
    if (!isNaN(d.getTime())) {
        return d;
    }
    try {
        const months = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const cleaned = dateStr.replace(/,/g, '').replace(/\s+/g, ' ').trim();
        const parts = cleaned.split(' ');
        if (parts.length >= 3) {
            const monthStr = parts[0].toLowerCase().substring(0, 3);
            const month = months[monthStr] !== undefined ? months[monthStr] : 0;
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            let hours = 0;
            let minutes = 0;
            if (parts.length >= 4) {
                const timeParts = parts[3].split(':');
                hours = parseInt(timeParts[0], 10);
                minutes = parseInt(timeParts[1], 10);
                if (parts.length >= 5) {
                    const ampm = parts[4].toLowerCase();
                    if (ampm === 'pm' && hours < 12) {
                        hours += 12;
                    } else if (ampm === 'am' && hours === 12) {
                        hours = 0;
                    }
                }
            }
            return new Date(year, month, day, hours, minutes);
        }
    } catch (e) {
        console.error("Failed to parse custom date:", dateStr, e);
    }
    return new Date(0);
}

function groupPaymentsByOrder(payments) {
    const grouped = {};
    payments.forEach(payment => {
        const orderID = payment.orderID;
        if (!grouped[orderID]) {
            grouped[orderID] = {
                orderID: orderID,
                status: payment.status,
                orderProgressStatus: payment.orderProgressStatus,
                orderTotal: payment.orderTotal,
                orderTotalPaid: payment.orderTotalPaid,
                balance: payment.balance,
                date: payment.date, // Represents the latest transaction/activity date
                payments: []
            };
        } else {
            // Keep the latest transaction date
            const currentDate = parseCustomDate(grouped[orderID].date);
            const newDate = parseCustomDate(payment.date);
            if (newDate > currentDate) {
                grouped[orderID].date = payment.date;
            }
        }
        if (payment.paymentID !== null) {
            grouped[orderID].payments.push({
                paymentID: payment.paymentID,
                date: payment.date,
                method: payment.method,
                amountPaid: payment.amountPaid,
                paymentStatus: payment.paymentStatus
            });
        }
    });

    const groupedArray = Object.values(grouped);

    // Sort sub-payments within each order descending by date (latest first)
    groupedArray.forEach(order => {
        order.payments.sort((a, b) => parseCustomDate(b.date) - parseCustomDate(a.date));
    });

    // Sort orders descending by latest transaction date (latest first)
    groupedArray.sort((a, b) => parseCustomDate(b.date) - parseCustomDate(a.date));

    return groupedArray;
}

function applyRevenueFilters() {
    const searchInput = document.querySelector('.table-controls .search-input');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const orders = groupPaymentsByOrder(allPayments);

    filteredRevenueOrders = orders.filter(order => {
        let matchesStatus = false;

        if (revenueFilter === 'All Payments') {
            matchesStatus = true;
        } else if (revenueFilter === 'Paid') {
            matchesStatus = (order.status === 'Paid' || order.status === 'Fully Paid') && order.orderProgressStatus !== 'Cancelled';
        } else if (revenueFilter === 'Partially Paid') {
            matchesStatus = order.status === 'Partially Paid' && order.orderProgressStatus !== 'Cancelled';
        } else if (revenueFilter === 'Unpaid') {
            matchesStatus = order.status === 'Unpaid' && order.orderProgressStatus !== 'Cancelled';
        } else if (revenueFilter === 'Cancelled') {
            matchesStatus = order.orderProgressStatus === 'Cancelled';
        }

        const matchesSearch = (
            String(order.orderID).includes(term) ||
            order.payments.some(p => p.paymentID && `#PAY-${p.paymentID}`.toLowerCase().includes(term))
        );

        return matchesStatus && matchesSearch;
    });

    // Sort the filtered revenue orders
    filteredRevenueOrders.sort((a, b) => {
        let valA, valB;
        if (revenueSortKey === 'orderID') {
            valA = parseInt(a.orderID) || 0;
            valB = parseInt(b.orderID) || 0;
        } else if (revenueSortKey === 'paymentDate') {
            valA = parseCustomDate(a.date);
            valB = parseCustomDate(b.date);
        } else if (revenueSortKey === 'amountDue') {
            valA = parseFloat(a.orderTotal) || 0;
            valB = parseFloat(b.orderTotal) || 0;
        } else if (revenueSortKey === 'amountPaid') {
            valA = parseFloat(a.orderTotalPaid) || 0;
            valB = parseFloat(b.orderTotalPaid) || 0;
        } else if (revenueSortKey === 'remainingBalance') {
            valA = parseFloat(a.balance) || 0;
            valB = parseFloat(b.balance) || 0;
        }

        if (valA < valB) return revenueSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return revenueSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderRevenueTable();
}

window.handleRevenueSort = (key) => {
    if (revenueSortKey === key) {
        revenueSortDirection = revenueSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        revenueSortKey = key;
        revenueSortDirection = 'asc';
    }
    applyRevenueFilters();
};

function renderRevenueTable() {
    const tableWrapper = document.querySelector('.orders-management-wrapper');
    if (!tableWrapper) return;

    const tbody = tableWrapper.querySelector('.data-table tbody');
    if (!tbody) return;

    // Update sort icons in DOM
    const sortIcons = tableWrapper.querySelectorAll('.sort-icon');
    sortIcons.forEach(icon => {
        icon.textContent = '';
    });
    const activeIcon = tableWrapper.querySelector(`#sort-icon-${revenueSortKey}`);
    if (activeIcon) {
        activeIcon.textContent = revenueSortDirection === 'asc' ? ' ▲' : ' ▼';
    }

    if (filteredRevenueOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 40px; color: var(--text-muted); text-align: center;">
                    No orders found.
                </td>
            </tr>
        `;
        updatePaginationUI(0, 0, 0, 1);
        return;
    }

    // Pagination slicing
    const totalItems = filteredRevenueOrders.length;
    const totalPages = Math.ceil(totalItems / revenueRowsPerPage);
    if (currentRevenuePage > totalPages) currentRevenuePage = Math.max(1, totalPages);

    const start = (currentRevenuePage - 1) * revenueRowsPerPage;
    const end = Math.min(start + revenueRowsPerPage, totalItems);
    const paginatedOrders = filteredRevenueOrders.slice(start, end);

    let html = '';
    paginatedOrders.forEach(order => {
        const isCancelled = order.orderProgressStatus === 'Cancelled';
        const isExpanded = expandedOrders.has(order.orderID);

        let balanceHtml = '-';
        if (order.balance > 0) {
            const balanceColor = order.status === 'Unpaid' ? 'var(--danger)' : 'var(--progress-text)';
            balanceHtml = `<span style="color: ${isCancelled ? '#9ca3af' : balanceColor}; font-weight: 700; ${isCancelled ? 'text-decoration: line-through;' : ''}">₱${parseFloat(order.balance).toFixed(2)}</span>`;
        } else if (isCancelled) {
            balanceHtml = `<span style="color: #9ca3af; text-decoration: line-through;">₱0.00</span>`;
        }

        const rowStyle = isCancelled ? 'background-color: #f9fafb; color: #9ca3af; opacity: 0.6;' : '';
        const idStyle = isCancelled ? 'color: #9ca3af; cursor: not-allowed; text-decoration: line-through;' : 'color: var(--primary); cursor: pointer;';
        const amountStyle = isCancelled ? 'font-weight: 700; text-decoration: line-through; color: #9ca3af;' : 'font-weight: 700;';

        // Render main order row
        html += `
            <tr style="${rowStyle}" onclick="window.toggleOrderDetails(${order.orderID}, event)">
                <td class="id-cell" style="${idStyle}" onclick="event.stopPropagation(); window.openViewOrderModal(${order.orderID})" title="${isCancelled ? 'Cancelled Order' : 'View Order Details'}">#${String(order.orderID).padStart(4, '0')}</td>
                <td>${order.date}</td>
                <td style="${amountStyle}">₱${parseFloat(order.orderTotal).toFixed(2)}</td>
                <td style="font-weight: 700; color: var(--success);">₱${parseFloat(order.orderTotalPaid).toFixed(2)}</td>
                <td class="status-cell" onclick="event.stopPropagation();">
                    ${isCancelled ? `
                        <button class="modal-dropdown-trigger small" disabled style="opacity: 0.5; cursor: not-allowed; border-color: #e5e7eb; background: #f3f4f6; color: #9ca3af;">
                            <span class="selected-value">Cancelled</span>
                        </button>
                    ` : (order.status === 'Paid' || order.status === 'Fully Paid' ? `
                        <button class="modal-dropdown-trigger small" disabled style="cursor: not-allowed; border: 1px solid var(--payment-paid-border) !important; background: var(--payment-paid-bg) !important; color: var(--payment-paid-text) !important; border-radius: 6px !important;" data-status="${order.status}">
                            <span class="selected-value">${order.status}</span>
                        </button>
                    ` : `
                        <button class="modal-dropdown-trigger small" onclick="window.openUpdateStatusModal(${order.orderID})" data-status="${order.status}">
                            <span class="selected-value">${order.status}</span>
                            <i data-lucide="refresh-cw" style="width: 14px; height: 14px; margin-left: 4px; opacity: 0.6;"></i>
                        </button>
                    `)}
                </td>
                <td>${balanceHtml}</td>
                <td style="text-align: right; padding-right: 32px; font-weight: 700; color: var(--text-muted);">
                    <div style="display: inline-flex; align-items: center; gap: 8px;">
                        <span>${order.payments.length} ${order.payments.length === 1 ? 'payment' : 'payments'}</span>
                        <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width: 16px; height: 16px;"></i>
                    </div>
                </td>
            </tr>
        `;

        // Render expandable details row
        const detailsDisplay = isExpanded ? 'table-row' : 'none';

        let paymentsListHtml = '';
        if (order.payments.length === 0) {
            paymentsListHtml = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px;">No payment transactions recorded for this order.</div>`;
        } else {
            paymentsListHtml = `
                <div class="expanded-payments-list">
                    ${order.payments.map(p => {
                const paymentRef = `#PAY-${String(p.paymentID).padStart(4, '0')}`;
                const isPayCancelled = p.paymentStatus === 'Cancelled';
                const methodBadgeClass = p.method === 'Cash' ? 'ready' : 'claimed';
                let methodBadgeBg = isCancelled ? '#e5e7eb' : `var(--${methodBadgeClass}-bg)`;
                let methodBadgeText = isCancelled ? '#6b7280' : `var(--${methodBadgeClass}-text)`;

                if (isPayCancelled) {
                    methodBadgeBg = '#f3f4f6';
                    methodBadgeText = '#9ca3af';
                }

                const amountStyle = isPayCancelled ? 'text-decoration: line-through; color: #9ca3af;' : 'color: var(--text-heading);';
                const refStyle = isPayCancelled ? 'text-decoration: line-through; color: #9ca3af;' : 'color: var(--text-heading);';
                const dateStyle = isPayCancelled ? 'color: #d1d5db;' : 'color: var(--text-muted);';

                return `
                            <div class="expanded-payment-item" style="${isPayCancelled ? 'background-color: #fafafa; border-color: #e5e7eb; opacity: 0.85;' : ''}">
                                <div class="expanded-payment-left">
                                    <span class="expanded-payment-ref" style="${refStyle}">${paymentRef}</span>
                                    <span class="status-badge" style="background: ${methodBadgeBg}; color: ${methodBadgeText}; font-size: 10px; padding: 2px 8px; cursor: pointer;" onclick='event.stopPropagation(); window.openPaymentOverviewModal(${JSON.stringify({ paymentID: p.paymentID, orderID: order.orderID, method: p.method, amountPaid: p.amountPaid, date: p.date, status: p.paymentStatus }).replace(/'/g, "&apos;")})'>${p.method}</span>
                                    ${isPayCancelled ? `<span class="status-badge" style="background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; font-size: 10px; padding: 2px 8px; cursor: default;">Cancelled</span>` : ''}
                                    <span class="expanded-payment-date" style="${dateStyle}">${p.date}</span>
                                </div>
                                <div class="expanded-payment-right">
                                    <span class="expanded-payment-amount" style="${amountStyle}">₱${parseFloat(p.amountPaid).toFixed(2)}</span>
                                    ${isPayCancelled ? `
                                        <button class="action-btn" disabled style="opacity: 0.4; cursor: not-allowed; background: #f3f4f6;" title="Payment has been cancelled">
                                            <i data-lucide="ban"></i>
                                        </button>
                                    ` : `
                                        <button class="action-btn delete" 
                                                ${isCancelled ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} 
                                                onclick="event.stopPropagation(); window.cancelPayment(${p.paymentID}, ${p.amountPaid}, ${order.orderID})" 
                                                title="${isCancelled ? 'Cannot cancel payment for a cancelled order' : 'Cancel/Undo Payment'}">
                                            <i data-lucide="ban"></i>
                                        </button>
                                    `}
                                </div>
                            </div>
                        `;
            }).join('')}
                </div>
            `;
        }

        html += `
            <tr class="payment-details-row" id="details-order-${order.orderID}" style="display: ${detailsDisplay};">
                <td colspan="7" style="background: #f8fafc; padding: 12px 24px;">
                    <div class="expanded-payments-wrapper">
                        <div class="expanded-payments-title">
                            <i data-lucide="history" style="width: 14px; height: 14px; color: var(--primary);"></i>
                            Payment History for Order #${String(order.orderID).padStart(4, '0')}
                        </div>
                        ${paymentsListHtml}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    updatePaginationUI(start, end, totalItems, totalPages);
    if (window.lucide) window.lucide.createIcons();
}

window.toggleOrderDetails = (orderId, event) => {
    // If the click is on an interactive element (e.g. badge, button), ignore it
    if (event.target.closest('button') || event.target.closest('.status-badge') || event.target.closest('a') || event.target.classList.contains('id-cell')) {
        return;
    }

    const detailsRow = document.getElementById(`details-order-${orderId}`);
    if (!detailsRow) return;

    const isExpanded = expandedOrders.has(orderId);
    if (isExpanded) {
        expandedOrders.delete(orderId);
        detailsRow.style.display = 'none';
    } else {
        expandedOrders.add(orderId);
        detailsRow.style.display = 'table-row';
    }

    renderRevenueTable();
};

window.cancelPayment = (paymentId, amount, orderRef) => {
    const formattedAmount = parseFloat(amount).toFixed(2);
    window.openDeleteConfirm({
        title: 'Cancel Payment',
        message: `Are you sure you want to cancel and undo the payment of ₱${formattedAmount} for Order #${String(orderRef).padStart(4, '0')}?`,
        confirmText: 'Yes, Cancel',
        cancelText: 'Keep it',
        processingText: 'Cancelling...',
        onConfirm: async () => {
            try {
                const response = await window.pywebview.api.cancel_payment(paymentId);
                if (response.status === "success") {
                    window.showToast("Payment has been cancelled and balance updated.", "success");
                    await loadRevenue();
                } else {
                    window.showToast("Error: " + response.message, "error");
                }
            } catch (err) {
                console.error("Cancellation failed:", err);
                window.showToast("A system error occurred while cancelling the payment.", "error");
            }
        }
    });
};

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

    // Set Payment Status in details overview modal
    const statusBadge = document.getElementById('overviewStatusBadge');
    if (statusBadge) {
        const payStatus = payment.status || 'Completed';
        statusBadge.textContent = payStatus;
        if (payStatus === 'Cancelled') {
            statusBadge.style.background = '#fef2f2';
            statusBadge.style.color = '#ef4444';
            statusBadge.style.border = '1px solid #fee2e2';
        } else {
            statusBadge.style.background = 'var(--ready-bg)';
            statusBadge.style.color = 'var(--ready-text)';
            statusBadge.style.border = 'none';
        }
    }

    const timeStr = payment.time ? `<br>${payment.time}` : '';
    document.getElementById('overviewDateTime').innerHTML = `${payment.date}${timeStr}`;

    if (window.lucide) window.lucide.createIcons();
    window.openModal('paymentOverviewModal');
};

})();
