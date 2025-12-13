/**
 * dashboard-avatar.js - Avatar Creator Module
 * XTN 2026
 */

// ============================================================
// STATE
// ============================================================
let avatarCanvas, avatarCtx;
let avatarUserImage = null;
let avatarFrame = null;
let avatarDragging = false;
let avatarX = 0, avatarY = 0, avatarScale = 1, avatarBaseScale = 1;
let avatarStartX, avatarStartY;
let avatarUploadLabel, avatarZoomSlider, avatarDownloadBtn, avatarResetBtn;

// Import showAlert from core (will be passed as parameter)
let showAlertFn = (msg) => showToast(msg, 'info');

export function setShowAlert(fn) {
    showAlertFn = fn;
}

// ============================================================
// INIT
// ============================================================
export function initAvatarCanvas() {
    avatarCanvas = document.getElementById('avatar-canvas');
    if (!avatarCanvas) return;
    avatarCtx = avatarCanvas.getContext('2d');

    avatarUploadLabel = document.getElementById('avatar-upload-label');
    avatarZoomSlider = document.getElementById('avatar-zoom');
    avatarDownloadBtn = document.getElementById('btn-avatar-download');
    avatarResetBtn = document.getElementById('btn-avatar-reset');

    // Load frame
    avatarFrame = new Image();
    avatarFrame.crossOrigin = 'anonymous';
    avatarFrame.onload = () => drawAvatarCanvas();
    avatarFrame.onerror = () => { avatarFrame = null; drawAvatarCanvas(); };
    avatarFrame.src = 'images/avatar-frame.png';

    // Canvas drag events
    avatarCanvas.onmousedown = startAvatarDrag;
    avatarCanvas.onmousemove = dragAvatar;
    avatarCanvas.onmouseup = endAvatarDrag;
    avatarCanvas.onmouseleave = endAvatarDrag;

    // Touch support
    avatarCanvas.addEventListener('touchstart', (e) => {
        if (!avatarUserImage || e.touches.length !== 1) return;
        const touch = e.touches[0];
        avatarDragging = true;
        const rect = avatarCanvas.getBoundingClientRect();
        avatarStartX = (touch.clientX - rect.left) * (1000 / rect.width) - avatarX;
        avatarStartY = (touch.clientY - rect.top) * (1000 / rect.height) - avatarY;
    });

    avatarCanvas.addEventListener('touchmove', (e) => {
        if (!avatarDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = avatarCanvas.getBoundingClientRect();
        avatarX = (touch.clientX - rect.left) * (1000 / rect.width) - avatarStartX;
        avatarY = (touch.clientY - rect.top) * (1000 / rect.height) - avatarStartY;
        drawAvatarCanvas();
    });

    avatarCanvas.addEventListener('touchend', endAvatarDrag);

    // Mouse wheel zoom
    avatarCanvas.addEventListener('wheel', (e) => {
        if (!avatarUserImage) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        const newValue = parseFloat(avatarZoomSlider.value) * delta;
        if (newValue >= 0.5 && newValue <= 3) {
            avatarZoomSlider.value = newValue;
            avatarScale = avatarBaseScale * newValue;
            drawAvatarCanvas();
        }
    });

    // Zoom slider
    if (avatarZoomSlider) {
        avatarZoomSlider.addEventListener('input', (e) => {
            if (!avatarUserImage) return;
            avatarScale = avatarBaseScale * parseFloat(e.target.value);
            drawAvatarCanvas();
        });
    }

    // Drag & drop upload
    if (avatarUploadLabel) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
            avatarUploadLabel.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(event => {
            avatarUploadLabel.addEventListener(event, () => avatarUploadLabel.classList.add('dragging'));
        });

        ['dragleave', 'drop'].forEach(event => {
            avatarUploadLabel.addEventListener(event, () => avatarUploadLabel.classList.remove('dragging'));
        });

        avatarUploadLabel.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleAvatarFile(files[0]);
            }
        });

        // Mobile touch support - manually trigger file input
        avatarUploadLabel.addEventListener('touchend', (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('avatar-upload');
            if (fileInput) fileInput.click();
        });
    }

    // NEW: Simple upload button click handler
    const uploadBtn = document.getElementById('btn-avatar-upload');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            document.getElementById('avatar-upload').click();
        });
    }

    // Reset button
    if (avatarResetBtn) {
        avatarResetBtn.addEventListener('click', resetAvatarFull);
    }

    // Download button
    if (avatarDownloadBtn) {
        avatarDownloadBtn.addEventListener('click', downloadAvatar);
    }

    drawAvatarCanvas();
}

// ============================================================
// HANDLERS
// ============================================================
export function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (file) handleAvatarFile(file);
}

function handleAvatarFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        avatarUserImage = new Image();
        avatarUserImage.onload = () => {
            avatarBaseScale = Math.max(1000 / avatarUserImage.width, 1000 / avatarUserImage.height);
            avatarScale = avatarBaseScale;
            avatarX = (1000 - avatarUserImage.width * avatarScale) / 2;
            avatarY = (1000 - avatarUserImage.height * avatarScale) / 2;

            if (avatarZoomSlider) avatarZoomSlider.value = 1;
            if (avatarResetBtn) avatarResetBtn.style.display = 'block';
            if (avatarDownloadBtn) avatarDownloadBtn.disabled = false;

            // Update status
            const status = document.getElementById('avatar-upload-status');
            if (status) {
                status.innerHTML = '<i class="fa-solid fa-check-circle" style="color:#00723F;"></i> Ảnh đã tải lên!';
                status.style.color = '#00723F';
            }

            drawAvatarCanvas();
        };
        avatarUserImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function drawAvatarCanvas() {
    if (!avatarCtx) return;
    avatarCtx.clearRect(0, 0, 1000, 1000);
    avatarCtx.fillStyle = '#ffffff';
    avatarCtx.fillRect(0, 0, 1000, 1000);

    if (avatarUserImage) {
        avatarCtx.drawImage(avatarUserImage, avatarX, avatarY,
            avatarUserImage.width * avatarScale, avatarUserImage.height * avatarScale);
    }

    if (avatarFrame && avatarFrame.complete) {
        avatarCtx.drawImage(avatarFrame, 0, 0, 1000, 1000);
    }
}

function startAvatarDrag(e) {
    if (!avatarUserImage) return;
    avatarDragging = true;
    const rect = avatarCanvas.getBoundingClientRect();
    const scaleX = 1000 / rect.width;
    const scaleY = 1000 / rect.height;
    avatarStartX = (e.clientX - rect.left) * scaleX - avatarX;
    avatarStartY = (e.clientY - rect.top) * scaleY - avatarY;
}

function dragAvatar(e) {
    if (!avatarDragging) return;
    const rect = avatarCanvas.getBoundingClientRect();
    const scaleX = 1000 / rect.width;
    const scaleY = 1000 / rect.height;
    avatarX = (e.clientX - rect.left) * scaleX - avatarStartX;
    avatarY = (e.clientY - rect.top) * scaleY - avatarStartY;
    drawAvatarCanvas();
}

function endAvatarDrag() { avatarDragging = false; }

export function resetAvatarFull() {
    avatarUserImage = null;
    avatarX = 0;
    avatarY = 0;
    avatarScale = 1;
    avatarBaseScale = 1;

    if (avatarZoomSlider) avatarZoomSlider.value = 1;
    if (avatarDownloadBtn) avatarDownloadBtn.disabled = true;
    if (avatarResetBtn) avatarResetBtn.style.display = 'none';

    // Reset upload label
    if (avatarUploadLabel) {
        avatarUploadLabel.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><p>Nhấn hoặc kéo ảnh vào đây</p><small>Hỗ trợ: JPG, PNG, WEBP</small>';
    }

    // Reset file input
    const fileInput = document.getElementById('avatar-upload');
    if (fileInput) fileInput.value = '';

    drawAvatarCanvas();
}

export function downloadAvatar() {
    if (!avatarUserImage) {
        showAlertFn('Vui lòng tải ảnh lên trước!', 'warning', 'Chưa có ảnh');
        return;
    }
    const link = document.createElement('a');
    link.download = 'AvatarXTN2026.png';
    link.href = avatarCanvas.toDataURL('image/png', 1.0);
    link.click();
}
