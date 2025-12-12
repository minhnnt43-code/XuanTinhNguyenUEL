/**
 * card-creator.js - Tạo Thẻ Chiến Sĩ
 * XTN 2026
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const CARD_WIDTH = 800;
const CARD_HEIGHT = 1200;
let canvas, ctx;
let userData = null;
let userPhoto = null;

// Khởi tạo
async function init() {
    canvas = document.getElementById('card-canvas');
    ctx = canvas.getContext('2d');

    // Kiểm tra đăng nhập và lấy thông tin user
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // Lấy thông tin từ Firestore
        const userDoc = await getDoc(doc(db, "xtn_users", user.uid));
        if (userDoc.exists()) {
            userData = userDoc.data();
            document.getElementById('card-name').value = userData.name || '';
            document.getElementById('card-team').value = userData.team_id ? 'Đội ' + userData.team_id.replace('doi-', '') : 'Chưa phân đội';
        }
    });

    // Upload ảnh
    document.getElementById('card-photo').addEventListener('change', handlePhotoUpload);

    // Submit form
    document.getElementById('card-form').addEventListener('submit', handleCreateCard);

    // Download
    document.getElementById('btn-download-card').addEventListener('click', downloadCard);

    drawEmptyCard();
}

// Vẽ thẻ trống
function drawEmptyCard() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Header
    ctx.fillStyle = '#00723F';
    ctx.fillRect(0, 0, CARD_WIDTH, 200);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THẺ CHIẾN SĨ', CARD_WIDTH / 2, 80);
    ctx.font = '32px Montserrat, sans-serif';
    ctx.fillText('XUÂN TÌNH NGUYỆN 2026', CARD_WIDTH / 2, 140);

    // Placeholder ảnh
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(250, 250, 300, 400);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '24px sans-serif';
    ctx.fillText('Ảnh chân dung', CARD_WIDTH / 2, 460);
}

// Upload ảnh chân dung
function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        userPhoto = new Image();
        userPhoto.onload = () => {
            renderCard();
        };
        userPhoto.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Tạo thẻ
function handleCreateCard(e) {
    e.preventDefault();
    renderCard();
    document.getElementById('btn-download-card').disabled = false;
}

// Vẽ thẻ hoàn chỉnh
function renderCard() {
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Header gradient
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
    gradient.addColorStop(0, '#00723F');
    gradient.addColorStop(1, '#00964F');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, 200);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THẺ CHIẾN SĨ', CARD_WIDTH / 2, 80);
    ctx.font = '28px Montserrat, sans-serif';
    ctx.fillText('XUÂN TÌNH NGUYỆN UEL 2026', CARD_WIDTH / 2, 140);

    // Ảnh chân dung
    if (userPhoto) {
        const photoX = 250;
        const photoY = 250;
        const photoW = 300;
        const photoH = 400;

        // Vẽ ảnh crop fit
        const scale = Math.max(photoW / userPhoto.width, photoH / userPhoto.height);
        const scaledW = userPhoto.width * scale;
        const scaledH = userPhoto.height * scale;
        const offsetX = (scaledW - photoW) / 2;
        const offsetY = (scaledH - photoH) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(photoX, photoY, photoW, photoH);
        ctx.clip();
        ctx.drawImage(userPhoto, photoX - offsetX, photoY - offsetY, scaledW, scaledH);
        ctx.restore();

        // Border
        ctx.strokeStyle = '#00723F';
        ctx.lineWidth = 4;
        ctx.strokeRect(photoX, photoY, photoW, photoH);
    }

    // Thông tin
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Montserrat, sans-serif';
    ctx.fillText(document.getElementById('card-name').value || 'Họ và Tên', CARD_WIDTH / 2, 720);

    ctx.fillStyle = '#6b7280';
    ctx.font = '24px Montserrat, sans-serif';
    ctx.fillText(document.getElementById('card-team').value || 'Đội hình', CARD_WIDTH / 2, 770);

    // Footer
    ctx.fillStyle = '#FFE500';
    ctx.fillRect(0, CARD_HEIGHT - 100, CARD_WIDTH, 100);
    ctx.fillStyle = '#00723F';
    ctx.font = 'bold 28px Montserrat, sans-serif';
    ctx.fillText('HỘI SINH VIÊN TRƯỜNG ĐH KINH TẾ - LUẬT', CARD_WIDTH / 2, CARD_HEIGHT - 45);
}

// Tải về thẻ
function downloadCard() {
    const name = document.getElementById('card-name').value.replace(/\s+/g, '-') || 'the-chien-si';
    const link = document.createElement('a');
    link.download = `${name}-xtn-2026.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Init
document.addEventListener('DOMContentLoaded', init);
