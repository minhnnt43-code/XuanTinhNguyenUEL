/**
 * avatar-creator.js - Tạo Avatar XTN
 * XTN 2026
 */

import { auth } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const CANVAS_SIZE = 1000;
let canvas, ctx;
let userImage = null;
let frameImage = null;
let isDragging = false;
let imgX = 0, imgY = 0, imgScale = 1;
let startX, startY;

// Khởi tạo
function init() {
    // Kiểm tra đăng nhập
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
        }
    });

    canvas = document.getElementById('avatar-canvas');
    ctx = canvas.getContext('2d');

    // Load frame
    frameImage = new Image();
    frameImage.crossOrigin = 'anonymous';
    frameImage.onload = () => drawCanvas();
    frameImage.onerror = () => {
        console.warn('Frame chưa có, vẽ frame placeholder');
        frameImage = null;
        drawCanvas();
    };
    frameImage.src = 'images/avatar-frame.png';

    // Upload ảnh
    document.getElementById('upload-photo').addEventListener('change', handleUpload);

    // Kéo thả
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('mousemove', drag);
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);

    // Touch events
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startDrag(e.touches[0]);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        drag(e.touches[0]);
    });
    canvas.addEventListener('touchend', endDrag);

    // Buttons
    document.getElementById('btn-reset').addEventListener('click', resetImage);
    document.getElementById('btn-download').addEventListener('click', downloadAvatar);

    drawCanvas();
}

// Xử lý upload ảnh
function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        userImage = new Image();
        userImage.onload = () => {
            // Tính toán vị trí và scale ban đầu
            const scale = Math.max(CANVAS_SIZE / userImage.width, CANVAS_SIZE / userImage.height);
            imgScale = scale;
            imgX = (CANVAS_SIZE - userImage.width * scale) / 2;
            imgY = (CANVAS_SIZE - userImage.height * scale) / 2;

            drawCanvas();
            enableButtons();
        };
        userImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Vẽ canvas
function drawCanvas() {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Vẽ background trắng
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Vẽ ảnh user (nếu có)
    if (userImage) {
        ctx.drawImage(
            userImage,
            imgX, imgY,
            userImage.width * imgScale,
            userImage.height * imgScale
        );
    }

    // Vẽ frame overlay
    if (frameImage && frameImage.complete) {
        ctx.drawImage(frameImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
}

// Bắt đầu kéo
function startDrag(e) {
    if (!userImage) return;
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    startX = (e.clientX - rect.left) * scaleX - imgX;
    startY = (e.clientY - rect.top) * scaleY - imgY;
}

// Kéo ảnh
function drag(e) {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    imgX = (e.clientX - rect.left) * scaleX - startX;
    imgY = (e.clientY - rect.top) * scaleY - startY;
    drawCanvas();
}

// Kết thúc kéo
function endDrag() {
    isDragging = false;
}

// Reset ảnh
function resetImage() {
    if (!userImage) return;
    const scale = Math.max(CANVAS_SIZE / userImage.width, CANVAS_SIZE / userImage.height);
    imgScale = scale;
    imgX = (CANVAS_SIZE - userImage.width * scale) / 2;
    imgY = (CANVAS_SIZE - userImage.height * scale) / 2;
    drawCanvas();
}

// Tải về avatar
function downloadAvatar() {
    const link = document.createElement('a');
    link.download = 'avatar-xtn-2026.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Enable buttons
function enableButtons() {
    document.getElementById('btn-reset').disabled = false;
    document.getElementById('btn-download').disabled = false;
}

// Init
document.addEventListener('DOMContentLoaded', init);
