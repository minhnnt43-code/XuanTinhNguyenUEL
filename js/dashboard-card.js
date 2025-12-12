/**
 * dashboard-card.js - Card Creator Module
 * XTN 2026 - Tham khảo MHX
 * Features: Template, Zoom/Pan, QR Code
 */

import { db } from './firebase.js';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// STATE
// ============================================================
let cardCanvas, cardCtx;
let userData = null;
let sttData = null;

// Template image
let templateImg = new Image();
templateImg.crossOrigin = "Anonymous";

// User photo
let userPhoto = new Image();
let userPhotoLoaded = false;

// Zoom & Pan state
let scale = 1;
let offsetX = 0, offsetY = 0;
let isDragging = false;
let lastX, lastY;

// QR Code instance
let qrCodeImage = null;

// ============================================================
// CONFIG - Dựa trên template 5.5x8.5cm
// TĂNG RESOLUTION 2X ĐỂ NÉT
// ============================================================
const SCALE_FACTOR = 2.5;  // Tăng resolution 2x
const CANVAS_WIDTH = 550 * SCALE_FACTOR;
const CANVAS_HEIGHT = 850 * SCALE_FACTOR;

// Vị trí ảnh tròn (phần đục lỗ trong template - ở giữa)
const AVATAR_X = 275 * SCALE_FACTOR;  // Trung tâm X của canvas
const AVATAR_Y = 415 * SCALE_FACTOR;  // Vị trí Y trung tâm
const AVATAR_RADIUS = 160 * SCALE_FACTOR;  // Bán kính

// Vị trí text (phía dưới ảnh) - ĐÃ ĐƯỢC USER CỐ ĐỌNH
const NAME_Y = 630 * SCALE_FACTOR;   // Tên - màu đỏ
const TEAM_Y = 675 * SCALE_FACTOR;   // Đội hình - màu xanh lá
const ROLE_Y = 730 * SCALE_FACTOR;   // Vai trò - trong khung xanh có sẵn

// QR Code - góc trái nhỏ
const QR_X = 15 * SCALE_FACTOR;
const QR_Y = 770 * SCALE_FACTOR;
const QR_SIZE = 65 * SCALE_FACTOR;

// Màu sắc XTN
const COLOR_RED = '#E31837';      // Màu đỏ cho tên
const COLOR_GREEN = '#00723F';    // Màu xanh lá cho đội hình
const COLOR_YELLOW = '#FFE500';
const COLOR_ORANGE = '#FF6B00';

// Font
const FONT_IMPACT = '"UTM Impact", "Arial Black", sans-serif';

// ============================================================
// EXPORT
// ============================================================
export function setUserData(data) {
    userData = data;
}

// ============================================================
// INIT
// ============================================================
export async function initCardCanvas() {
    cardCanvas = document.getElementById('card-canvas');
    if (!cardCanvas) return;

    cardCtx = cardCanvas.getContext('2d');
    cardCanvas.width = CANVAS_WIDTH;
    cardCanvas.height = CANVAS_HEIGHT;

    // Load template
    templateImg.src = 'images/thechiensi.png';
    templateImg.onload = () => {
        console.log('[Card] Template loaded');
        drawCard();
    };
    templateImg.onerror = () => {
        console.warn('[Card] Template not found, using fallback');
        drawCard();
    };

    // Auto-fill from userData (bao gồm vai trò và đội hình)
    if (userData) {
        const nameInput = document.getElementById('card-name');
        const mssvInput = document.getElementById('card-mssv');
        const roleInput = document.getElementById('card-role');
        const teamInput = document.getElementById('card-team');

        if (nameInput) nameInput.value = userData.name || '';
        if (mssvInput) mssvInput.value = userData.mssv || '';

        // Hiển thị position thay vì role ID (ưu tiên position > role)
        // Map role ID thành tên hiển thị nếu không có position
        const roleDisplayMap = {
            'super_admin': 'BCH Trường',
            'kysutet_admin': 'BCH Ký sự Tết',
            'doihinh_admin': 'BCH Đội hình',
            'member': 'Chiến sĩ',
            'pending': 'Chờ duyệt'
        };
        const displayRole = userData.position || roleDisplayMap[userData.role] || userData.role || 'Chiến sĩ';
        if (roleInput) roleInput.value = displayRole;

        // Lấy team_name từ xtn_teams dựa vào team_id
        let teamName = 'Chưa phân đội';
        if (userData.team_id) {
            try {
                const teamDoc = await getDoc(doc(db, 'xtn_teams', userData.team_id));
                if (teamDoc.exists()) {
                    teamName = teamDoc.data().team_name || userData.team_id;
                }
            } catch (e) {
                console.warn('[Card] Could not load team:', e);
                teamName = userData.team_id; // Fallback to ID
            }
        }
        if (teamInput) teamInput.value = teamName;

        // Auto-load Google avatar as default (có thể chỉnh)
        if (userData.photoURL) {
            userPhoto.crossOrigin = 'anonymous';
            userPhoto.onload = () => {
                userPhotoLoaded = true;
                const baseScale = getBaseScale();
                scale = baseScale;
                offsetX = 0;
                offsetY = 0;

                // Show zoom controls
                const zoomGroup = document.getElementById('card-zoom-group');
                if (zoomGroup) zoomGroup.style.display = 'block';

                const zoomSlider = document.getElementById('card-zoom');
                if (zoomSlider) zoomSlider.value = 1;

                if (cardCanvas) cardCanvas.style.cursor = 'grab';

                // Enable download button
                const btn = document.getElementById('btn-card-download');
                if (btn) btn.disabled = false;

                drawCard();
                console.log('[Card] Auto-loaded Google avatar');
            };
            userPhoto.onerror = () => {
                console.warn('[Card] Could not load Google avatar, user can upload manually');
            };
            userPhoto.src = userData.photoURL;

            // Show hint that user can change
            const uploadLabel = document.getElementById('card-photo-label');
            if (uploadLabel) {
                uploadLabel.innerHTML = `
                    <span style="font-size:13px; color:#22c55e;">
                        <i class="fa-solid fa-check-circle"></i> 
                        Đã dùng ảnh đăng nhập
                    </span><br>
                    <span style="font-size:11px; color:#888;">
                        Nhấn hoặc kéo ảnh vào đây để thay đổi
                    </span>
                `;
            }
        }

        // Load existing card status
        await loadCardStatus();

        // Load city card link
        await loadCityCardLink();
    }

    // Setup event listeners
    setupEventListeners();

    // Initial draw
    drawCard();
}

// ============================================================
// LOAD TEAMS
// ============================================================
async function loadTeamsToDropdown() {
    try {
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        const teamSelect = document.getElementById('card-team');
        if (!teamSelect) return;

        teamSelect.innerHTML = '<option value="">-- Chọn đội hình --</option>';
        teamsSnap.forEach(doc => {
            const team = doc.data();
            const opt = document.createElement('option');
            opt.value = team.team_name || doc.id;
            opt.textContent = team.team_name || doc.id;
            if (userData?.team_id === doc.id) opt.selected = true;
            teamSelect.appendChild(opt);
        });
    } catch (e) {
        console.warn('[Card] Could not load teams:', e);
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    // Form inputs -> redraw
    ['card-name', 'card-mssv', 'card-role', 'card-team'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', drawCard);
            el.addEventListener('change', drawCard);
        }
    });

    // Photo upload
    const photoInput = document.getElementById('card-photo');
    if (photoInput) {
        photoInput.addEventListener('change', handlePhotoUpload);
    }

    // Drag & Drop
    const uploadLabel = document.getElementById('card-photo-label');
    if (uploadLabel) {
        uploadLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadLabel.classList.add('dragging');
        });
        uploadLabel.addEventListener('dragleave', () => {
            uploadLabel.classList.remove('dragging');
        });
        uploadLabel.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadLabel.classList.remove('dragging');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handlePhotoFile(file);
            }
        });

        // Mobile touch support - manually trigger file input
        uploadLabel.addEventListener('touchend', (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('card-photo');
            if (fileInput) fileInput.click();
        });
    }

    // Zoom slider
    const zoomSlider = document.getElementById('card-zoom');
    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            if (!userPhotoLoaded) return;
            const baseScale = getBaseScale();
            scale = baseScale * e.target.value;
            drawCard();
        });
    }

    // Mouse wheel zoom on canvas
    if (cardCanvas) {
        cardCanvas.addEventListener('wheel', (e) => {
            if (!userPhotoLoaded) return;
            e.preventDefault();
            const zoomIntensity = 0.1;
            const wheel = e.deltaY < 0 ? 1 : -1;
            const zoom = Math.exp(wheel * zoomIntensity);
            const newScale = scale * zoom;
            const baseScale = getBaseScale();
            const minScale = baseScale * 0.5;
            const maxScale = baseScale * 3;
            if (newScale >= minScale && newScale <= maxScale) {
                scale = newScale;
                const zoomSlider = document.getElementById('card-zoom');
                if (zoomSlider) zoomSlider.value = scale / baseScale;
                drawCard();
            }
        });

        // Mouse drag on canvas
        cardCanvas.addEventListener('mousedown', (e) => {
            if (userPhotoLoaded && e.button === 0) {
                isDragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
                cardCanvas.style.cursor = 'grabbing';
            }
        });
        cardCanvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                const rect = cardCanvas.getBoundingClientRect();
                const canvasScaleRatio = cardCanvas.width / rect.width;
                offsetX += dx * canvasScaleRatio;
                offsetY += dy * canvasScaleRatio;
                lastX = e.clientX;
                lastY = e.clientY;
                drawCard();
            }
        });
        cardCanvas.addEventListener('mouseup', stopDrag);
        cardCanvas.addEventListener('mouseleave', stopDrag);
        cardCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // MSSV change -> update QR
    const mssvInput = document.getElementById('card-mssv');
    if (mssvInput) {
        mssvInput.addEventListener('input', debounce(async (e) => {
            await updateQRCode(e.target.value);
            drawCard();
        }, 300));
    }

    // Form submit
    const form = document.getElementById('card-form');
    if (form) {
        form.addEventListener('submit', handleCardForm);
    }

    // Confirm card button
    const confirmBtn = document.getElementById('btn-card-confirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmCard);
    }

    // Save city card link button
    const saveCityBtn = document.getElementById('btn-save-city-card');
    if (saveCityBtn) {
        saveCityBtn.addEventListener('click', saveCityCardLink);
    }
}

function stopDrag() {
    if (isDragging) {
        isDragging = false;
        if (cardCanvas) cardCanvas.style.cursor = userPhotoLoaded ? 'grab' : 'default';
    }
}

function getBaseScale() {
    if (!userPhoto.width) return 1;
    return Math.max((AVATAR_RADIUS * 2) / userPhoto.width, (AVATAR_RADIUS * 2) / userPhoto.height);
}

function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// ============================================================
// PHOTO HANDLING
// ============================================================
function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) handlePhotoFile(file);
}

function handlePhotoFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        userPhoto.src = e.target.result;
        userPhoto.onload = () => {
            userPhotoLoaded = true;
            const baseScale = getBaseScale();
            scale = baseScale;
            offsetX = 0;
            offsetY = 0;

            // Show zoom controls
            const zoomGroup = document.getElementById('card-zoom-group');
            if (zoomGroup) zoomGroup.style.display = 'block';

            const zoomSlider = document.getElementById('card-zoom');
            if (zoomSlider) zoomSlider.value = 1;

            if (cardCanvas) cardCanvas.style.cursor = 'grab';

            drawCard();

            // Enable download button
            const btn = document.getElementById('btn-card-download');
            if (btn) btn.disabled = false;
        };
    };
    reader.readAsDataURL(file);
}

// ============================================================
// QR CODE
// ============================================================
async function updateQRCode(data) {
    if (!data || !data.trim()) {
        qrCodeImage = null;
        return;
    }

    // Load QRCodeStyling if not loaded
    if (typeof QRCodeStyling === 'undefined') {
        console.warn('[Card] QRCodeStyling not loaded, skipping QR');
        return;
    }

    try {
        const qrCode = new QRCodeStyling({
            width: QR_SIZE * 2,
            height: QR_SIZE * 2,
            type: 'canvas',
            margin: 5,
            data: data.trim(),
            dotsOptions: { color: COLOR_GREEN, type: "square" },
            backgroundOptions: { color: "#ffffff" },
            cornersSquareOptions: { type: "square", color: COLOR_ORANGE },
            cornersDotOptions: { type: "square", color: COLOR_GREEN },
            qrOptions: { errorCorrectionLevel: 'H' }
        });

        const blob = await qrCode.getRawData('png');
        if (blob) {
            const url = URL.createObjectURL(blob);
            qrCodeImage = new Image();
            qrCodeImage.onload = () => {
                URL.revokeObjectURL(url);
                drawCard();
            };
            qrCodeImage.src = url;
        }
    } catch (e) {
        console.warn('[Card] QR generation error:', e);
    }
}

// ============================================================
// FORM HANDLER
// ============================================================
export function handleCardPhoto(e) {
    handlePhotoUpload(e);
}

export function handleCardForm(e) {
    e.preventDefault();
    drawCard();
    const btn = document.getElementById('btn-card-download');
    if (btn && userPhotoLoaded) btn.disabled = false;
}

// ============================================================
// DRAW CARD
// ============================================================
function drawCard() {
    if (!cardCtx) return;

    // Clear
    cardCtx.fillStyle = '#f0f0f0';
    cardCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw template if loaded
    if (templateImg.complete && templateImg.naturalWidth > 0) {
        cardCtx.drawImage(templateImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        // Fallback: Draw basic card
        drawFallbackCard();
    }

    // Draw user photo in circle
    drawUserPhoto();

    // Draw QR Code
    if (qrCodeImage && qrCodeImage.complete) {
        cardCtx.drawImage(qrCodeImage, QR_X, QR_Y, QR_SIZE, QR_SIZE);
    }

    // Draw text
    drawTexts();
}

function drawFallbackCard() {
    // Header gradient
    const gradient = cardCtx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
    gradient.addColorStop(0, COLOR_GREEN);
    gradient.addColorStop(1, '#00964F');
    cardCtx.fillStyle = gradient;
    cardCtx.fillRect(0, 0, CANVAS_WIDTH, 120);

    // Title
    cardCtx.fillStyle = '#fff';
    cardCtx.font = 'bold 32px Montserrat, sans-serif';
    cardCtx.textAlign = 'center';
    cardCtx.fillText('THẺ CHIẾN SĨ', CANVAS_WIDTH / 2, 55);
    cardCtx.font = '18px Montserrat, sans-serif';
    cardCtx.fillText('XUÂN TÌNH NGUYỆN UEL 2026', CANVAS_WIDTH / 2, 90);

    // Background
    cardCtx.fillStyle = COLOR_YELLOW;
    cardCtx.fillRect(0, 120, CANVAS_WIDTH, CANVAS_HEIGHT - 120);

    // Footer
    cardCtx.fillStyle = COLOR_GREEN;
    cardCtx.fillRect(0, CANVAS_HEIGHT - 60, CANVAS_WIDTH, 60);
    cardCtx.fillStyle = '#fff';
    cardCtx.font = 'bold 14px Montserrat, sans-serif';
    cardCtx.fillText('HỘI SINH VIÊN ĐH KINH TẾ - LUẬT', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 25);
}

function drawUserPhoto() {
    const centerX = AVATAR_X;
    const centerY = AVATAR_Y;

    // KHÔNG VẼ BORDER - Template đã có khung sẵn

    // Clip to circle
    cardCtx.save();
    cardCtx.beginPath();
    cardCtx.arc(centerX, centerY, AVATAR_RADIUS, 0, Math.PI * 2);
    cardCtx.clip();

    if (userPhotoLoaded && userPhoto.complete) {
        const imgWidth = userPhoto.width * scale;
        const imgHeight = userPhoto.height * scale;
        const drawX = centerX - imgWidth / 2 + offsetX;
        const drawY = centerY - imgHeight / 2 + offsetY;
        cardCtx.drawImage(userPhoto, drawX, drawY, imgWidth, imgHeight);
    }
    // KHÔNG VẼ PLACEHOLDER - để template hiển thị

    cardCtx.restore();
}

function drawTexts() {
    const name = document.getElementById('card-name')?.value || 'Họ và Tên';
    const team = document.getElementById('card-team')?.value || 'Đội hình';
    const role = document.getElementById('card-role')?.value || 'Chiến sĩ';

    cardCtx.textAlign = 'center';

    // Name - MÀU ĐỎ, IN HOA, UTM IMPACT
    cardCtx.fillStyle = COLOR_RED;
    cardCtx.font = `bold ${40 * SCALE_FACTOR}px ${FONT_IMPACT}`;
    cardCtx.fillText(name.toUpperCase(), CANVAS_WIDTH / 2, NAME_Y);

    // Team - MÀU XANH LÁ, IN HOA, UTM IMPACT
    cardCtx.fillStyle = COLOR_GREEN;
    cardCtx.font = `${23 * SCALE_FACTOR}px ${FONT_IMPACT}`;
    cardCtx.fillText(team.toUpperCase(), CANVAS_WIDTH / 2, TEAM_Y);

    // Role - TRONG KHUNG XANH CÓ SẴN TRÊN TEMPLATE (không vẽ thêm khung)
    // Chỉ vẽ text trắng vào vị trí khung
    cardCtx.fillStyle = '#fffcfcff';
    cardCtx.font = `bold ${20 * SCALE_FACTOR}px ${FONT_IMPACT}`;
    cardCtx.fillText(role.toUpperCase(), CANVAS_WIDTH / 2, ROLE_Y);
}

// ============================================================
// DOWNLOAD
// ============================================================
export function downloadCard() {
    if (!cardCanvas) return;

    // Build filename
    const rawName = document.getElementById('card-name')?.value || 'ChienSi';
    const name = rawName.replace(/\s+/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const rawTeam = document.getElementById('card-team')?.value || 'DoiHinh';
    const team = rawTeam.replace(/\s+/g, '').replace(/Đội/g, 'Doi');

    const mssv = document.getElementById('card-mssv')?.value || String(Date.now()).slice(-6);

    const fileName = `${name}-${team}-${mssv}.png`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = cardCanvas.toDataURL('image/png');
    link.click();

    console.log('[Card] Downloaded:', fileName);

    // Enable confirm button after download
    const confirmBtn = document.getElementById('btn-card-confirm');
    if (confirmBtn) confirmBtn.disabled = false;
}

// ============================================================
// CARD STATUS - Xác nhận đã tạo thẻ
// ============================================================
async function loadCardStatus() {
    if (!userData?.uid) return;

    try {
        const cardDoc = await getDoc(doc(db, 'xtn_cards', userData.uid));
        const statusDiv = document.getElementById('card-confirm-status');
        const confirmBtn = document.getElementById('btn-card-confirm');

        if (cardDoc.exists()) {
            const data = cardDoc.data();
            if (data.confirmed) {
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        <span style="color:#16a34a;"><i class="fa-solid fa-circle-check"></i> 
                        Đã xác nhận tạo thẻ lúc ${data.confirmed_at?.toDate?.().toLocaleString('vi-VN') || 'N/A'}</span>
                    `;
                }
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đã xác nhận';
                }
            }
        }
    } catch (e) {
        console.warn('[Card] Could not load card status:', e);
    }
}

export async function confirmCard() {
    if (!userData?.uid) {
        alert('Vui lòng đăng nhập lại!');
        return;
    }

    try {
        // Lấy team_name từ form (đã được load từ xtn_teams)
        const teamName = document.getElementById('card-team')?.value || '';

        // Lưu thẻ với dữ liệu gốc từ xtn_users (không dùng form input)
        await setDoc(doc(db, 'xtn_cards', userData.uid), {
            user_id: userData.uid,
            email: userData.email || '',
            // Dùng userData từ xtn_users (nguồn gốc)
            name: userData.name || '',
            mssv: userData.mssv || '',
            role: userData.role || 'member',
            position: userData.position || '',
            team_id: userData.team_id || '',
            team_name: teamName,  // team_name đã được load từ xtn_teams
            confirmed: true,
            confirmed_at: serverTimestamp()
        }, { merge: true });

        const statusDiv = document.getElementById('card-confirm-status');
        if (statusDiv) {
            statusDiv.innerHTML = `
                <span style="color:#16a34a;"><i class="fa-solid fa-circle-check"></i> 
                Đã xác nhận thành công!</span>
            `;
        }

        const confirmBtn = document.getElementById('btn-card-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đã xác nhận';
        }

        console.log('[Card] Confirmed successfully');
        alert('✅ Đã xác nhận tạo thẻ thành công!');
    } catch (e) {
        console.error('[Card] Confirm error:', e);
        // Show detailed error
        const errorMsg = e?.code || e?.message || String(e);
        alert('❌ Có lỗi xảy ra: ' + errorMsg + '\n\nVui lòng thử lại hoặc liên hệ Admin.');
    }
}

// ============================================================
// CITY CARD LINK - Lưu link Drive thẻ cấp thành phố
// ============================================================
async function loadCityCardLink() {
    if (!userData?.uid) return;

    try {
        const cardDoc = await getDoc(doc(db, 'xtn_cards', userData.uid));
        if (cardDoc.exists()) {
            const data = cardDoc.data();
            const linkInput = document.getElementById('card-city-link');
            if (linkInput && data.city_card_link) {
                linkInput.value = data.city_card_link;
            }
        }
    } catch (e) {
        console.warn('[Card] Could not load city card link:', e);
    }
}

export async function saveCityCardLink() {
    if (!userData?.uid) {
        alert('Vui lòng đăng nhập lại!');
        return;
    }

    const linkInput = document.getElementById('card-city-link');
    const link = linkInput?.value?.trim() || '';

    if (link && !link.includes('drive.google.com')) {
        alert('Vui lòng nhập link Google Drive hợp lệ!');
        return;
    }

    try {
        await setDoc(doc(db, 'xtn_cards', userData.uid), {
            user_id: userData.uid,
            city_card_link: link,
            city_card_updated_at: serverTimestamp()
        }, { merge: true });

        alert('Đã lưu link thẻ thành phố!');
        console.log('[Card] City card link saved');
    } catch (e) {
        console.error('[Card] Save city link error:', e);
        alert('Có lỗi xảy ra, vui lòng thử lại!');
    }
}

