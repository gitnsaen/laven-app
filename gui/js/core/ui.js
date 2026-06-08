/**
 * laven - Shared UI Module
 * Handles modals, dropdowns, and generic UI logic
 */

// Modal Loading & Management
// Modal Loading & Management with memory caching to prevent redundant disk reads
const modalCache = {};

async function loadModal(modalName, targetId) {
    if (modalCache[modalName]) {
        const mount = document.getElementById(targetId);
        if (mount) {
            mount.innerHTML = modalCache[modalName];
            if (window.lucide) window.lucide.createIcons();
            return true;
        }
        return false;
    }

    try {
        const response = await fetch(`modals/${modalName}.html`);
        if (!response.ok) throw new Error('Modal not found');
        const html = await response.text();
        modalCache[modalName] = html; // Save modal structure in memory

        const mount = document.getElementById(targetId);
        if (mount) {
            mount.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to load modal:', err);
        return false;
    }
}

function openModal(id) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');

        // Ensure at least one step is active (fixes issues with shared step class)
        const steps = modal.querySelectorAll('.modal-step');
        if (steps.length > 0) {
            const activeStep = modal.querySelector('.modal-step.active');
            if (!activeStep) {
                steps[0].classList.add('active');
            }
        }

        if (window.lucide) window.lucide.createIcons();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

// UI Toggles & Dropdowns
function toggleDropdown(btn) {
    const container = btn.closest('.dropdown-container');
    const menu = container.querySelector('.dropdown-menu');
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menu) m.classList.remove('show');
    });
    menu.classList.toggle('show');
}

function selectOption(item, value) {
    const container = item.closest('.dropdown-container');
    const trigger = container.querySelector('.modal-dropdown-trigger') || container.querySelector('.dropdown-filter');
    const selectedText = container.querySelector('.selected-value');

    if (selectedText) selectedText.textContent = value;

    if (trigger) {
        trigger.setAttribute('data-status', value);
    }

    const menu = container.querySelector('.dropdown-menu');
    if (menu) menu.classList.remove('show');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
}

/**
 * Global Delete UI logic
 */
async function openDeleteConfirm(config) {
    const { title, message, onConfirm, confirmText, cancelText, confirmClass, icon, iconBg, iconColor } = config;
    
    // Capture the active modal ID before showing the confirmation overlay
    const activeModal = document.querySelector('.modal-overlay.active');
    const previouslyActiveModalId = activeModal ? activeModal.id : null;

    let modal = document.getElementById('deleteConfirmModal');

    // 1. Load modal if missing
    if (!modal) {
        console.log("Loading delete confirmation modal...");
        const success = await loadModal('delete-confirm', 'delete-confirm-modal-mount');
        if (!success) {
            console.error("Could not load delete-confirm modal HTML");
            return;
        }
        modal = document.getElementById('deleteConfirmModal');
    }

    // 2. Setup content
    if (modal) {
        const titleEl = document.getElementById('deleteConfirmTitle');
        const msgEl = document.getElementById('deleteConfirmMessage');
        const confirmBtn = document.getElementById('deleteConfirmBtn');
        const cancelBtn = modal.querySelector('.btn-cancel');
        const closeBtn = modal.querySelector('.modal-close');
        const iconContainer = document.getElementById('deleteConfirmIconContainer');

        if (titleEl) titleEl.textContent = title || 'Confirm Delete';
        if (msgEl) msgEl.textContent = message || 'Are you sure you want to delete this entry?';

        // Apply custom icon styles if provided, else fall back to red alert-triangle theme
        if (iconContainer) {
            iconContainer.style.background = iconBg || 'var(--pending-bg)';
            iconContainer.style.color = iconColor || 'var(--danger)';
            iconContainer.innerHTML = `<i id="deleteConfirmIcon" data-lucide="${icon || 'alert-triangle'}" style="width: 40px; height: 40px;"></i>`;
        }

        if (confirmBtn) {
            confirmBtn.textContent = confirmText || 'Yes, Delete';

            // Add custom class or default to 'delete'
            confirmBtn.className = confirmClass ? `btn-delete ${confirmClass}` : 'btn-delete';

            confirmBtn.onclick = async () => {
                confirmBtn.disabled = true;
                const originalText = confirmBtn.textContent;
                const processingText = config.processingText || 'Deleting...';
                confirmBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> ${processingText}`;
                if (window.lucide) window.lucide.createIcons();

                try {
                    await onConfirm();
                    // Reset text before closing to avoid flicker if reopened
                    confirmBtn.textContent = originalText;
                    closeModal('deleteConfirmModal');
                } catch (err) {
                    console.error("Action failed:", err);
                    window.showToast("Action failed: " + (err.message || "Unknown error"), "error");
                    confirmBtn.textContent = originalText;
                } finally {
                    confirmBtn.disabled = false;
                    if (window.lucide) window.lucide.createIcons();
                }
            };
        }

        if (cancelBtn) {
            cancelBtn.textContent = cancelText || 'Keep it';
            cancelBtn.onclick = () => {
                closeModal('deleteConfirmModal');
                if (previouslyActiveModalId) {
                    openModal(previouslyActiveModalId);
                }
            };
        }

        if (closeBtn) {
            closeBtn.onclick = () => {
                closeModal('deleteConfirmModal');
                if (previouslyActiveModalId) {
                    openModal(previouslyActiveModalId);
                }
            };
        }

        // 3. Open it
        openModal('deleteConfirmModal');
    } else {
        console.error("deleteConfirmModal element not found even after loading");
    }
}

// Global click listener to handle closing dropdowns and shared pagination
document.addEventListener('click', (e) => {
    // 1. Handle closing dropdowns when clicking outside
    const activeDropdown = document.querySelector('.dropdown-menu.show');
    if (activeDropdown) {
        const container = activeDropdown.closest('.dropdown-container');
        if (!container.contains(e.target)) {
            activeDropdown.classList.remove('show');
        }
    }

    // 2. Handle Pagination Buttons via delegation
    const pageBtn = e.target.closest('.page-btn');
    if (!pageBtn) return;

    if (pageBtn.hasAttribute('data-cust-page') && typeof renderCustomerTable === 'function') {
        const page = parseInt(pageBtn.getAttribute('data-cust-page'));
        if (!isNaN(page)) {
            window.currentPage = page;
            renderCustomerTable();
        }
    } else if (pageBtn.hasAttribute('data-emp-page') && typeof renderEmployeeTable === 'function') {
        const page = parseInt(pageBtn.getAttribute('data-emp-page'));
        if (!isNaN(page)) {
            window.currentEmpPage = page;
            renderEmployeeTable();
        }
    } else if (pageBtn.hasAttribute('data-order-page') && typeof window.changeOrderPage === 'function') {
        const page = parseInt(pageBtn.getAttribute('data-order-page'));
        if (!isNaN(page)) {
            window.changeOrderPage(page);
        }
    } else if (pageBtn.hasAttribute('data-rev-page') && typeof window.goToRevenuePage === 'function') {
        const page = parseInt(pageBtn.getAttribute('data-rev-page'));
        if (!isNaN(page)) {
            window.goToRevenuePage(page);
        }
    }
});

function toggleValueVisibility(targetId, btn) {
    const target = document.getElementById(targetId);
    if (!target) return;

    target.classList.toggle('hidden-value');

    const eyeOpen = btn.querySelector('.eye-open');
    const eyeClosed = btn.querySelector('.eye-closed');

    if (eyeOpen && eyeClosed) {
        eyeOpen.classList.toggle('hidden');
        eyeClosed.classList.toggle('hidden');
    }
}

// Bindings to window for inline onclick handlers
window.loadModal = loadModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleDropdown = toggleDropdown;
window.selectOption = selectOption;
window.toggleSidebar = toggleSidebar;
window.openDeleteConfirm = openDeleteConfirm;
window.toggleValueVisibility = toggleValueVisibility;

// --- Premium Input Validation and Toast System ---
window.showToast = (message, type = 'error') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-alert ${type}`;
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : '#f43f5e'};
        color: white;
        padding: 14px 20px;
        border-radius: 12px;
        font-weight: 500;
        box-shadow: 0 8px 16px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 280px;
        max-width: 400px;
        font-family: inherit;
        animation: slideIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
        pointer-events: auto;
    `;

    const icon = document.createElement('i');
    icon.style.cssText = 'width: 18px; height: 18px; flex-shrink: 0;';
    icon.setAttribute('data-lucide', type === 'success' ? 'check-circle' : 'alert-circle');

    const text = document.createElement('span');
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    if (window.lucide) {
        window.lucide.createIcons();
    }

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
};

window.validateName = (name, fieldName = "Name") => {
    if (!name || name.trim().length === 0) {
        return { valid: false, reason: `${fieldName} cannot be empty.` };
    }
    if (/[0-9]/.test(name)) {
        return { valid: false, reason: `${fieldName} should not contain numbers.` };
    }
    return { valid: true };
};

window.validatePhone = (phone, fieldName = "Contact number") => {
    const clean = phone.replace(/[\s-]/g, '');
    if (!clean) {
        return { valid: false, reason: `${fieldName} cannot be empty.` };
    }
    if (!/^09\d{9}$/.test(clean)) {
        return { valid: false, reason: `${fieldName} must follow the format 09xxxxxxxx (11 digits).` };
    }
    return { valid: true };
};

window.validatePrice = (price, fieldName = "Price") => {
    if (price === undefined || price === null || String(price).trim() === '') {
        return { valid: false, reason: `${fieldName} cannot be empty.` };
    }
    const clean = String(price).replace(/[₱,\s]/g, '');
    const num = parseFloat(clean);
    if (isNaN(num) || num < 0) {
        return { valid: false, reason: `${fieldName} must be a valid, positive number.` };
    }
    return { valid: true };
};

// --- Premium Authentication & Access Control Engine ---
window.currentUser = null;

window.checkAuthenticationState = async () => {
    if (!window.pywebview || !window.pywebview.api) {
        return false;
    }

    try {
        const user = await window.pywebview.api.get_current_user();
        const loginOverlay = document.getElementById('login-overlay');
        const appContainer = document.querySelector('.app-container');

        if (!user) {
            window.currentUser = null;
            if (loginOverlay) loginOverlay.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
            if (window.lucide) window.lucide.createIcons();
            return false;
        }

        window.currentUser = user;
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';

        // Update user avatar & display name in header
        const headerAvatar = document.getElementById('headerAvatar');
        const headerUsername = document.getElementById('headerUsername');
        const dropdownRoleText = document.getElementById('dropdownRoleText');

        if (headerAvatar) {
            const initial = (user.username || 'U').charAt(0).toUpperCase();
            headerAvatar.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%2300A38D"/><text x="50" y="58" font-family="sans-serif" font-size="44" font-weight="700" fill="%23ffffff" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`;
        }
        if (headerUsername) {
            headerUsername.textContent = user.username.charAt(0).toUpperCase() + user.username.slice(1);
        }
        if (dropdownRoleText) {
            if (user.role === 'Developer') {
                dropdownRoleText.textContent = 'Developer Mode';
            } else {
                dropdownRoleText.textContent = user.role === 'Admin' ? 'Owner (Admin)' : 'Operations Staff';
            }
        }

        applyRoleAccessRules(user.role);
        return true;
    } catch (e) {
        console.error("Auth state check failed:", e);
        return false;
    }
};

function applyRoleAccessRules(role) {
    const isAdmin = (role === 'Admin' || role === 'Developer');
    const isDeveloper = (role === 'Developer');

    // 1. Sidebar tab visibility
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const clickAttr = item.getAttribute('onclick') || '';

        // Hide Services and Employees tabs from Staff
        if (clickAttr.includes("'services'") || clickAttr.includes("'employees'")) {
            item.style.display = isAdmin ? 'flex' : 'none';
        }
    });

    // 2. Sidebar footer reset button visibility
    const resetBtn = document.getElementById('sidebarResetBtn');
    if (resetBtn) {
        resetBtn.style.display = isDeveloper ? 'flex' : 'none';
    }

    // 3. Class injection to control nested page controls (like edit/delete employee buttons)
    if (!isAdmin) {
        document.body.classList.add('role-staff');
    } else {
        document.body.classList.remove('role-staff');
    }

    // If staff is currently viewing a restricted view, redirect them back to dashboard
    if (!isAdmin && ['employees', 'services'].includes(window.currentView)) {
        window.loadView('dashboard');
    }
}

window.submitAppLogin = async () => {
    const userEl = document.getElementById('loginUsername');
    const passEl = document.getElementById('loginPassword');
    if (!userEl || !passEl) return;

    const username = userEl.value.trim();
    const password = passEl.value;

    if (!username || !password) {
        window.showToast("Username and password are required.", "error");
        return;
    }

    try {
        const response = await window.pywebview.api.login(username, password);
        if (response.status === 'success') {
            userEl.value = '';
            passEl.value = '';

            window.showToast(response.message, "success");
            await window.checkAuthenticationState();

            if (typeof window.loadView === 'function') {
                window.loadView('dashboard');
            }
        } else {
            passEl.value = '';
            window.showToast(response.message, "error");
        }
    } catch (err) {
        console.error("Login call failed:", err);
        window.showToast("Connection to backend server lost.", "error");
    }
};

window.handleLoginEnter = (event) => {
    if (event.key === 'Enter') {
        window.submitAppLogin();
    }
};

window.triggerAppLogout = async (event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    try {
        await window.pywebview.api.logout();
        window.showToast("Logged out successfully!", "success");

        const dropdown = document.getElementById('profileDropdown');
        if (dropdown) dropdown.style.display = 'none';

        await window.checkAuthenticationState();
    } catch (err) {
        console.error("Logout failed:", err);
    }
};

window.toggleProfileDropdown = (event) => {
    if (event) {
        event.stopPropagation();
    }
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none';
        dropdown.style.display = isHidden ? 'block' : 'none';
    }
};

window.addEventListener('click', () => {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown && dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    }
});

async function triggerDatabaseReset() {
    window.openDeleteConfirm({
        title: 'Reset Database?',
        message: 'This will copy a backup of the current database and delete all transactions, customers, services, employees, and addons. This action cannot be undone!',
        confirmText: 'Yes, Reset',
        cancelText: 'Cancel',
        confirmClass: 'btn-delete',
        processingText: 'Resetting...',
        onConfirm: async () => {
            const result = await window.pywebview.api.reset_database();
            if (result.status === 'success') {
                window.showToast(result.message, 'success');
                if (typeof window.loadView === 'function') {
                    window.loadView(window.currentView || 'dashboard');
                }
            } else {
                throw new Error(result.message);
            }
        }
    });
}

window.triggerDatabaseReset = triggerDatabaseReset;

window.formatPesosInput = (el) => {
    if (!el) return;
    let cursorPosition = el.selectionStart;
    let originalLen = el.value.length;

    // Get raw input digits and decimal point
    let val = el.value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = val.split('.');
    if (parts.length > 2) {
        val = parts[0] + '.' + parts.slice(1).join('');
    }

    // Prepend peso sign if there's any value
    if (val.length > 0) {
        el.value = '₱' + val;
    } else {
        el.value = '';
    }

    // Adjust cursor position to account for the prepended peso sign
    let newLen = el.value.length;
    let diff = newLen - originalLen;
    if (el.matches(':focus')) {
        el.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
    }
};

window.formatCurrency = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return '₱' + num.toFixed(2);
};

window.debounce = (func, delay = 500) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func(...args);
        }, delay);
    };
};

