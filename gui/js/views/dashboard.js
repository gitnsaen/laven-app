/**
 * laven - Dashboard Module
 */

(() => {
let dashboardClockInterval = null;

async function loadDashboardData() {
    console.log("Loading dashboard metrics...");

    startClock();

    if (!window.pywebview || !window.pywebview.api) return;

    try {
        const data = await window.pywebview.api.get_dashboard_data();

        // 1. Update Metrics
        if (data.stats) {
            document.getElementById('revenue-value').textContent = `₱${data.stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            document.getElementById('unpaid-value').textContent = `₱${data.stats.unpaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            document.getElementById('pending-count').textContent = data.stats.pending;
            document.getElementById('progress-count').textContent = data.stats.progress;
            document.getElementById('ready-count').textContent = data.stats.ready;

            // Update Pie Chart
            const total = data.stats.newCustomers + data.stats.returningCustomers;
            const returningPct = total > 0 ? (data.stats.returningCustomers / total) * 100 : 0;

            const pie = document.getElementById('customerPieChart');
            if (pie) {
                pie.style.background = `conic-gradient(var(--primary) 0% ${returningPct}%, var(--info) ${returningPct}% 100%)`;
            }

            document.getElementById('returning-text').textContent = `${data.stats.returningCustomers} Returning customers`;
            document.getElementById('new-text').textContent = `${data.stats.newCustomers} New customers`;
        }

        // 2. Render Recent Orders
        renderRecentOrders(data.recentOrders);

        // 3. Initialize swipe/drag scroll capability on the order container
        initSwipeScroll();

    } catch (err) {
        console.error("Dashboard Load Failed:", err);
    }
}

function initSwipeScroll() {
    const container = document.getElementById('ordersScroll');
    if (!container) return;

    let isDown = false;
    let startX;
    let scrollLeft;
    let dragDetected = false;

    // Safely replace container with a clone to clear duplicate event listeners across SPA view switches
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);

    newContainer.addEventListener('mousedown', (e) => {
        isDown = true;
        newContainer.classList.add('active-drag');
        startX = e.pageX - newContainer.offsetLeft;
        scrollLeft = newContainer.scrollLeft;
        dragDetected = false;
    });

    newContainer.addEventListener('mouseleave', () => {
        isDown = false;
        newContainer.classList.remove('active-drag');
    });

    newContainer.addEventListener('mouseup', () => {
        isDown = false;
        newContainer.classList.remove('active-drag');
    });

    newContainer.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - newContainer.offsetLeft;
        const walk = (x - startX) * 1.5; // Scroll speed multiplier
        if (Math.abs(walk) > 5) {
            dragDetected = true;
        }
        newContainer.scrollLeft = scrollLeft - walk;
    });

    // Mobile / Touchscreen swipe gestures
    let touchStartX = 0;
    let touchScrollLeft = 0;

    newContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].pageX - newContainer.offsetLeft;
        touchScrollLeft = newContainer.scrollLeft;
        dragDetected = false;
    }, { passive: true });

    newContainer.addEventListener('touchmove', (e) => {
        const x = e.touches[0].pageX - newContainer.offsetLeft;
        const walk = (x - touchStartX) * 1.5;
        if (Math.abs(walk) > 5) {
            dragDetected = true;
        }
        newContainer.scrollLeft = touchScrollLeft - walk;
    }, { passive: true });

    // Intercept order-card clicks if a drag gesture was detected to prevent accidental card loading
    newContainer.addEventListener('click', (e) => {
        if (dragDetected) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true); // Capture phase click handler
}

function renderRecentOrders(orders) {
    const list = document.querySelector('.orders-list');
    if (!list) return;

    if (!orders || orders.length === 0) {
        list.innerHTML = `
            <div style="padding: 40px; color: var(--text-muted); text-align: center; width: 100%;">
                No active orders today.
            </div>
        `;
        return;
    }

    list.innerHTML = orders.map(order => `
        <div class="order-card" onclick="window.openViewOrderModal('${order.orderID}')">
            <div class="card-header">
                <span class="order-id">#${String(order.orderID).padStart(5, '0')}</span>
                <span class="status-badge ${getStatusClass(order.status)}">${order.status}</span>
            </div>
            <div class="card-body">
                <span class="order-date">${order.date}</span>
                <h4 class="customer-name">${order.customerName}</h4>
                <div class="card-footer">
                    <p class="service-details">${order.summary}</p>
                    <p class="order-price">₱${order.amount.toFixed(2)}</p>
                </div>
                <button class="update-btn"
                    onclick="event.stopPropagation(); window.openUpdateStatusModal('${order.orderID}')">Update</button>
            </div>
        </div>
    `).join('');
}

function getStatusClass(status) {
    switch (status) {
        case 'Pending': return 'pending';
        case 'On Progress': return 'progress';
        case 'Done': return 'done';
        case 'Claimed': return 'claimed';
        default: return '';
    }
}

function startClock() {
    if (dashboardClockInterval) clearInterval(dashboardClockInterval);

    const updateTime = () => {
        const now = new Date();
        const dateEl = document.getElementById('currentDate');
        const timeEl = document.getElementById('currentTime');

        if (dateEl) {
            const options = { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' };
            dateEl.textContent = now.toLocaleDateString('en-US', options);
        }

        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
    };

    updateTime();
    dashboardClockInterval = setInterval(updateTime, 1000);
}

window.scrollOrders = (direction) => {
    const container = document.getElementById('ordersScroll');
    if (container) {
        const scrollAmount = 300;
        container.scrollBy({
            left: direction * scrollAmount,
            behavior: 'smooth'
        });
    }
};

window.updateDashboardRevenue = async (timeframe) => {
    try {
        if (!window.pywebview || !window.pywebview.api) return;
        const res = await window.pywebview.api.get_dashboard_revenue(timeframe);
        if (res.status === "success") {
            const el = document.getElementById('revenue-value');
            if (el) {
                el.textContent = `₱${res.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
        }
    } catch (err) {
        console.error("Failed to update dashboard revenue:", err);
    }
};

window.updateDashboardUnpaid = async (timeframe) => {
    try {
        if (!window.pywebview || !window.pywebview.api) return;
        const res = await window.pywebview.api.get_dashboard_unpaid(timeframe);
        if (res.status === "success") {
            const el = document.getElementById('unpaid-value');
            if (el) {
                el.textContent = `₱${res.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
        }
    } catch (err) {
        console.error("Failed to update dashboard unpaid:", err);
    }
};

window.updateDashboardCustomers = async (timeframe) => {
    try {
        if (!window.pywebview || !window.pywebview.api) return;
        const res = await window.pywebview.api.get_dashboard_customers(timeframe);
        if (res.status === "success") {
            const total = res.newCustomers + res.returningCustomers;
            const returningPct = total > 0 ? (res.returningCustomers / total) * 100 : 0;

            const pie = document.getElementById('customerPieChart');
            if (pie) {
                pie.style.background = `conic-gradient(var(--primary) 0% ${returningPct}%, var(--info) ${returningPct}% 100%)`;
            }

            const retEl = document.getElementById('returning-text');
            const newEl = document.getElementById('new-text');
            if (retEl) retEl.textContent = `${res.returningCustomers} Returning customers`;
            if (newEl) newEl.textContent = `${res.newCustomers} New customers`;
        }
    } catch (err) {
        console.error("Failed to update dashboard customers:", err);
    }
};

window.loadDashboardData = loadDashboardData;

})();
