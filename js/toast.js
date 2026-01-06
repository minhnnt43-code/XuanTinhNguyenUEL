/**
 * toast.js - Toast Notification System using SweetAlert2
 * XTN 2026 - Popup notifications centered on screen
 */

/**
 * Show a popup notification (centered on screen)
 * @param {string} message - Message to display
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Duration in ms (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    // Map type to SweetAlert2 icon
    const iconMap = {
        success: 'success',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };

    // Title mapping for Vietnamese
    const titleMap = {
        success: 'Thành công!',
        error: 'Lỗi!',
        warning: 'Cảnh báo!',
        info: 'Thông báo'
    };

    Swal.fire({
        icon: iconMap[type] || 'info',
        title: titleMap[type] || 'Thông báo',
        text: message,
        timer: duration,
        timerProgressBar: true,
        showConfirmButton: false,
        position: 'center',
        customClass: {
            popup: 'xtn-swal-popup',
            title: 'xtn-swal-title'
        }
    });
}

/**
 * Show loading popup (centered on screen)
 * @param {string} message - Loading message (default: 'Đang xử lý...')
 */
function showLoading(message = 'Đang xử lý...') {
    Swal.fire({
        title: message,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

/**
 * Hide loading popup and optionally show result
 * @param {string} message - Result message (optional)
 * @param {string} type - 'success' | 'error' | 'warning' | 'info' (optional)
 */
function hideLoading(message = null, type = 'success') {
    if (message) {
        showToast(message, type);
    } else {
        Swal.close();
    }
}

/**
 * Show a confirmation modal
 * @param {string} message - Confirmation message
 * @param {object} options - { title, confirmText, cancelText, type }
 * @returns {Promise<boolean>}
 */
function showConfirmModal(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Xác nhận',
            confirmText = 'Đồng ý',
            cancelText = 'Hủy',
            type = 'warning' // warning, danger, info
        } = options;

        // Remove existing modal
        document.getElementById('confirm-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'confirm-modal-overlay';
        overlay.className = 'confirm-modal-overlay';

        const typeColors = {
            warning: '#FF9800',
            danger: '#D32F2F',
            info: '#2196F3'
        };

        const typeIcons = {
            warning: 'fa-triangle-exclamation',
            danger: 'fa-trash-can',
            info: 'fa-circle-question'
        };

        overlay.innerHTML = `
            <div class="confirm-modal">
                <div class="confirm-modal-icon" style="background: ${typeColors[type] || typeColors.warning}">
                    <i class="fa-solid ${typeIcons[type] || typeIcons.warning}"></i>
                </div>
                <h3 class="confirm-modal-title">${title}</h3>
                <p class="confirm-modal-message">${message}</p>
                <div class="confirm-modal-buttons">
                    <button class="confirm-btn confirm-btn-cancel">${cancelText}</button>
                    <button class="confirm-btn confirm-btn-confirm" style="background: ${typeColors[type] || typeColors.warning}">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Trigger animation
        requestAnimationFrame(() => {
            overlay.classList.add('show');
        });

        const closeModal = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 200);
        };

        overlay.querySelector('.confirm-btn-cancel').onclick = () => closeModal(false);
        overlay.querySelector('.confirm-btn-confirm').onclick = () => closeModal(true);

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) closeModal(false);
        };

        // Close on Escape key
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

// Make globally available
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showConfirmModal = showConfirmModal;

// CSS injection (inline for easy use)
const toastStyles = document.createElement('style');
toastStyles.textContent = `
/* Toast Container */
.toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}

/* Toast */
.toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
    min-width: 280px;
    max-width: 400px;
    transform: translateX(120%);
    opacity: 0;
    transition: all 0.3s ease;
    pointer-events: auto;
    border-left: 4px solid #666;
}

.toast.show {
    transform: translateX(0);
    opacity: 1;
}

.toast i:first-child {
    font-size: 20px;
    flex-shrink: 0;
}

.toast-message {
    flex: 1;
    font-size: 14px;
    line-height: 1.4;
    color: #333;
}

.toast-close {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    padding: 4px;
    font-size: 14px;
    transition: color 0.2s;
}

.toast-close:hover {
    color: #333;
}

/* Toast Types */
.toast-success {
    background: #16a34a !important;  /* Green 600 - xanh lá đậm */
    border-left-color: #15803d;  /* Green 700 */
}
.toast-success i:first-child {
    color: white;
}
.toast-success .toast-message {
    color: white;
}
.toast-success .toast-close {
    color: rgba(255, 255, 255, 0.8);
}
.toast-success .toast-close:hover {
    color: white;
}

.toast-error {
    background: #dc2626 !important;  /* Red 600 - đỏ đậm */
    border-left-color: #991b1b;  /* Red 800 */
}
.toast-error i:first-child {
    color: white;
}
.toast-error .toast-message {
    color: white;
}
.toast-error .toast-close {
    color: rgba(255, 255, 255, 0.8);
}
.toast-error .toast-close:hover {
    color: white;
}

.toast-warning {
    background: #ea580c !important;  /* Orange 600 - cam đậm */
    border-left-color: #c2410c;  /* Orange 700 */
}
.toast-warning i:first-child {
    color: white;
}
.toast-warning .toast-message {
    color: white;
}
.toast-warning .toast-close {
    color: rgba(255, 255, 255, 0.8);
}
.toast-warning .toast-close:hover {
    color: white;
}

.toast-info {
    background: #2563eb !important;  /* Blue 600 - xanh dương đậm */
    border-left-color: #1d4ed8;  /* Blue 700 */
}
.toast-info i:first-child {
    color: white;
}
.toast-info .toast-message {
    color: white;
}
.toast-info .toast-close {
    color: rgba(255, 255, 255, 0.8);
}
.toast-info .toast-close:hover {
    color: white;
}

/* Confirm Modal Overlay */
.confirm-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    opacity: 0;
    visibility: hidden;
    transition: all 0.2s ease;
}

.confirm-modal-overlay.show {
    opacity: 1;
    visibility: visible;
}

/* Confirm Modal */
.confirm-modal {
    background: white;
    border-radius: 16px;
    padding: 30px;
    max-width: 400px;
    width: 90%;
    text-align: center;
    transform: scale(0.9);
    transition: transform 0.2s ease;
}

.confirm-modal-overlay.show .confirm-modal {
    transform: scale(1);
}

.confirm-modal-icon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
    color: white;
    font-size: 28px;
}

.confirm-modal-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 12px;
    color: #1a1a1a;
}

.confirm-modal-message {
    font-size: 15px;
    color: #666;
    margin: 0 0 25px;
    line-height: 1.5;
}

.confirm-modal-buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
}

.confirm-btn {
    padding: 12px 28px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
}

.confirm-btn-cancel {
    background: #e5e7eb;
    color: #374151;
}

.confirm-btn-cancel:hover {
    background: #d1d5db;
}

.confirm-btn-confirm {
    color: white;
}

.confirm-btn-confirm:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
}

/* Mobile */
@media (max-width: 480px) {
    .toast-container {
        top: auto;
        bottom: 20px;
        left: 15px;
        right: 15px;
    }
    
    .toast {
        min-width: auto;
        max-width: none;
        transform: translateY(100%);
    }
    
    .toast.show {
        transform: translateY(0);
    }
}
`;
document.head.appendChild(toastStyles);
