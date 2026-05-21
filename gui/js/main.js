/**
 * laven - Entry Point
 * Manages event delegation and initialization across modules
 */

// Search Delegation
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('search-input')) {
        console.log("Global search input detected for view:", window.currentView);
        if (window.currentView === 'customers' && typeof window.applyFiltersAndSearch === 'function') {
            window.applyFiltersAndSearch();
        } else if (window.currentView === 'employees' && typeof window.applyEmployeeFilters === 'function') {
            window.applyEmployeeFilters();
        } else if (window.currentView === 'orders' && typeof window.applyOrderFilters === 'function') {
            window.applyOrderFilters();
        } else {
            console.warn("No specific filter handler found for view:", window.currentView);
        }
    }
});

// Initialization logging
console.log("laven modules initialized.");
