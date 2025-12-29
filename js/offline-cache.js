/**
 * Offline Cache - Auto-save form inputs to localStorage
 * Helps restore data if user accidentally refreshes or loses connection
 */

document.addEventListener('DOMContentLoaded', () => {
    // Only run on dashboard or form pages
    if (!window.location.href.includes('dashboard') && !window.location.href.includes('campain-info')) return;

    console.log('[OfflineCache] Initializing auto-save...');

    const INPUT_SELECTORS = 'input:not([type="password"]):not([type="file"]), textarea, select';

    // Restore saved data
    document.querySelectorAll(INPUT_SELECTORS).forEach(input => {
        const key = getStorageKey(input);
        const savedValue = localStorage.getItem(key);

        if (savedValue !== null && savedValue !== '') {
            // Restore value
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = savedValue === 'true';
            } else {
                input.value = savedValue;
            }
            // Trigger change event to notify other scripts
            input.dispatchEvent(new Event('change'));
            input.dispatchEvent(new Event('input'));

            // Visual indicator
            input.style.borderColor = '#3b82f6';
            setTimeout(() => input.style.borderColor = '', 2000);
        }

        // Add auto-save listeners
        input.addEventListener('input', debounce((e) => {
            saveInput(e.target);
        }, 500));

        input.addEventListener('change', (e) => {
            saveInput(e.target);
        });
    });

    // Clear cache on specific actions (e.g., successful form submission)
    // This part requires integration with specific form submit handlers
});

function getStorageKey(input) {
    const page = window.location.pathname.split('/').pop().split('.')[0];
    const name = input.name || input.id;
    return `xtn_cache_${page}_${name}`;
}

function saveInput(input) {
    const key = getStorageKey(input);
    let value = input.value;

    if (input.type === 'checkbox' || input.type === 'radio') {
        value = input.checked;
    }

    localStorage.setItem(key, value);
    // console.log(`[OfflineCache] Saved ${key}`);
}

// Utility: Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
