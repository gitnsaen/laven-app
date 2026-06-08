/**
 * laven - Router Module
 * Handles SPA routing and data initialization
 */

// Global state for routing
let currentView = 'dashboard';

/**
 * Loads HTML views dynamically and manages sidebar active states
 */
async function loadView(viewName, element = null) {
    console.log(`Loading view: ${viewName}`);

    // Router Auth Guard Interceptor
    if (window.pywebview && window.pywebview.api) {
        if (typeof window.checkAuthenticationState === 'function') {
            const authenticated = await window.checkAuthenticationState();
            if (!authenticated) {
                console.log("Navigation blocked: User not authenticated.");
                return;
            }
        }
    }

    // Reset orderFilter to 'All' when explicitly navigating via sidebar click
    if (viewName === 'orders' && element) {
        window.orderFilter = 'All';
    }

    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error(`Could not load view: ${viewName}`);

        const html = await response.text();
        const appContent = document.getElementById('view-container');
        if (appContent) {
            appContent.innerHTML = html;
            window.currentView = viewName; // Correctly update the window binding
            console.log(`View ${viewName} loaded successfully. Global currentView: ${window.currentView}`);

            // Re-initialize Lucide icons for the new content
            if (window.lucide) {
                console.log("Re-initializing Lucide icons for new content...");
                window.lucide.createIcons();
            } else {
                console.warn("Lucide not available for icon initialization");
            }

            // Route-specific data loading
            await routeDataFactory(viewName);
        } else {
            console.error("View container not found!");
        }

        // Sidebar navigation update
        updateSidebarActive(viewName, element);

    } catch (error) {
        console.error('Router Error:', error);
        // Show error in the UI
        const appContent = document.getElementById('view-container');
        if (appContent) {
            appContent.innerHTML = `
                <div style="padding: 40px; text-align: center;">
                    <h3>Error Loading View</h3>
                    <p>Could not load ${viewName}: ${error.message}</p>
                </div>
            `;
        }
    }
}

function updateSidebarActive(viewName, element) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    // If an element was passed, use it. Otherwise, find by viewName
    if (element) {
        element.classList.add('active');
    } else {
        const navBtn = document.querySelector(`.nav-item[onclick*="'${viewName}'"]`);
        if (navBtn) navBtn.classList.add('active');
    }
}

/**
 * Pulls data from Python backend methods and injects into UI
 */
async function routeDataFactory(viewName) {
    // Only fetch if pywebview is ready
    if (!window.pywebview || !window.pywebview.api) return;

    switch (viewName) {
        case 'dashboard':
            if (typeof loadDashboardData === 'function') await loadDashboardData();
            break;
        case 'orders':
            if (typeof loadOrders === 'function') await loadOrders();
            break;
        case 'customers':
            if (typeof loadCustomers === 'function') await loadCustomers();
            break;
        case 'employees':
            if (typeof loadEmployees === 'function') await loadEmployees();
            break;
        case 'services':
            if (typeof loadServicesAndAddons === 'function') await loadServicesAndAddons();
            break;
        case 'revenue':
            if (typeof loadRevenue === 'function') await loadRevenue();
            break;
    }
}

// Exposed to global scope for inline onclick handlers
window.loadView = loadView;
window.currentView = currentView;

// Listener for PyWebView readiness
window.addEventListener('pywebviewready', async () => {
    console.log("PyWebView Bridge Established!");

    if (typeof window.checkAuthenticationState === 'function') {
        const authenticated = await window.checkAuthenticationState();
        if (authenticated) {
            routeDataFactory(window.currentView);
        }
    } else {
        routeDataFactory(window.currentView);
    }
});

// Initial application boot
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded - Starting application...");

    // Initialize Lucide icons for the initial page
    if (window.lucide) {
        console.log("Initializing Lucide icons...");
        window.lucide.createIcons();
    } else {
        console.error("Lucide not loaded!");
    }

    // Load default view (Dashboard)
    loadView('dashboard');
});
