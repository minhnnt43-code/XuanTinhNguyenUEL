/**
 * utils.js - Các hàm tiện ích chung
 * Xuân Tình Nguyện UEL 2026
 */

// ============================================================
// DATE & TIME UTILITIES
// ============================================================

/**
 * Format ngày tháng theo định dạng Việt Nam
 */
function formatDate(date, format = 'full') {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');

    switch (format) {
        case 'date':
            return `${day}/${month}/${year}`;
        case 'time':
            return `${hours}:${minutes}`;
        case 'datetime':
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        case 'full':
        default:
            return `${day} tháng ${month}, ${year} lúc ${hours}:${minutes}`;
    }
}

/**
 * Tính khoảng cách thời gian (vd: "2 giờ trước")
 */
function timeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    if (diffDay < 7) return `${diffDay} ngày trước`;
    return formatDate(date, 'date');
}

// ============================================================
// IMAGE UTILITIES
// ============================================================

/**
 * Chuyển link Google Drive thành link ảnh trực tiếp
 */
function convertDriveLink(url) {
    if (!url) return 'https://placehold.co/400x400?text=No+Image';
    if (!url.includes('drive.google.com')) return url;

    let id = '';
    const parts = url.split('/');
    const dIndex = parts.indexOf('d');

    if (dIndex !== -1 && parts[dIndex + 1]) {
        id = parts[dIndex + 1];
    } else if (url.includes('id=')) {
        const match = url.match(/id=([^&]+)/);
        if (match) id = match[1];
    }

    if (id) return `https://lh3.googleusercontent.com/d/${id}`;
    return url;
}

/**
 * Resize và compress ảnh trước khi upload
 */
function resizeImage(file, maxWidth = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => resolve(blob),
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Convert canvas to blob
 */
function canvasToBlob(canvas, type = 'image/png', quality = 1.0) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}

/**
 * Download canvas as image
 */
function downloadCanvas(canvas, filename = 'image.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

/**
 * Load image từ URL
 */
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// ============================================================
// STRING UTILITIES
// ============================================================

/**
 * Loại bỏ dấu tiếng Việt
 */
function removeVietnameseTones(str) {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
}

/**
 * Tạo slug từ tên
 */
function createSlug(text) {
    return removeVietnameseTones(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Truncate text với ellipsis
 */
function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 */
function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

// ============================================================
// VALIDATION UTILITIES
// ============================================================

/**
 * Validate email
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate phone number (VN)
 */
function isValidPhone(phone) {
    const re = /^(0|\+84)[0-9]{9,10}$/;
    return re.test(phone.replace(/\s/g, ''));
}

/**
 * Validate MSSV UEL
 */
function isValidMSSV(mssv) {
    // Format: K + 2 số năm + 6 số
    const re = /^K\d{8}$/i;
    return re.test(mssv);
}

// ============================================================
// DOM UTILITIES
// ============================================================

/**
 * Show loading overlay
 */
function showLoading(message = 'Đang xử lý...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <p class="loading-message">${message}</p>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('.loading-message').textContent = message;
    }
    overlay.style.display = 'flex';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toast
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Confirm dialog
 */
function confirmDialog(message, title = 'Xác nhận') {
    return new Promise((resolve) => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: title,
                text: message,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Đồng ý',
                cancelButtonText: 'Hủy'
            }).then((result) => {
                resolve(result.isConfirmed);
            });
        } else {
            resolve(confirm(message));
        }
    });
}

// ============================================================
// STORAGE UTILITIES
// ============================================================

/**
 * Save to localStorage with expiry
 */
function saveToStorage(key, value, expiryHours = 24) {
    const item = {
        value: value,
        expiry: new Date().getTime() + (expiryHours * 60 * 60 * 1000)
    };
    localStorage.setItem(key, JSON.stringify(item));
}

/**
 * Get from localStorage (check expiry)
 */
function getFromStorage(key) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;

    try {
        const item = JSON.parse(itemStr);
        if (new Date().getTime() > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }
        return item.value;
    } catch {
        return null;
    }
}

// ============================================================
// EXPORTS
// ============================================================

export {
    // Date/Time
    formatDate,
    timeAgo,

    // Image
    convertDriveLink,
    resizeImage,
    canvasToBlob,
    downloadCanvas,
    loadImage,

    // String
    removeVietnameseTones,
    createSlug,
    truncateText,
    capitalize,

    // Validation
    isValidEmail,
    isValidPhone,
    isValidMSSV,

    // DOM
    showLoading,
    hideLoading,
    showToast,
    confirmDialog,

    // Storage
    saveToStorage,
    getFromStorage
};
