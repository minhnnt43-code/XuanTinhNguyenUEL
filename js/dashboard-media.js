/**
 * Dashboard Media Manager
 * Quản lý hình ảnh giao diện cho index.html và job-description.html
 */

import { db } from './firebase.js';
import {
    collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
    query, orderBy, writeBatch, serverTimestamp, setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { log as activityLog } from './activity-logger.js';

// Collection names
const COLLECTIONS = {
    HERO: 'xtn_media_hero',           // index.html hero slideshow
    JD_BG: 'xtn_media_jd_background', // job-description.html background
    GALLERY: 'xtn_media_gallery',     // Gallery "Gieo sắc Xuân sang"
    TEAM_GALLERY: 'xtn_media_teams'   // Team gallery images
};

// State
let currentTab = 'hero';
let heroImages = [];
let jdImages = [];
let galleryImages = [];
let teamImages = {};

// ============================================================
// GOOGLE DRIVE URL CONVERTER
// ============================================================
function convertGoogleDriveUrl(url) {
    if (!url) return url;

    // Already in correct format
    if (url.includes('lh3.googleusercontent.com/d/')) {
        return url;
    }

    // Pattern 1: https://drive.google.com/file/d/FILE_ID/view...
    const pattern1 = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match1 = url.match(pattern1);
    if (match1) {
        console.log('[MediaManager] Converted Drive URL, FileID:', match1[1]);
        return `https://lh3.googleusercontent.com/d/${match1[1]}`;
    }

    // Pattern 2: https://drive.google.com/open?id=FILE_ID
    const pattern2 = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/;
    const match2 = url.match(pattern2);
    if (match2) {
        console.log('[MediaManager] Converted Drive URL, FileID:', match2[1]);
        return `https://lh3.googleusercontent.com/d/${match2[1]}`;
    }

    // Pattern 3: https://drive.google.com/uc?id=FILE_ID
    const pattern3 = /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/;
    const match3 = url.match(pattern3);
    if (match3) {
        console.log('[MediaManager] Converted Drive URL, FileID:', match3[1]);
        return `https://lh3.googleusercontent.com/d/${match3[1]}`;
    }

    // Not a Google Drive URL, return as-is
    return url;
}

// ============================================================
// RENDER MAIN HTML
// ============================================================
export function renderMediaManagerHTML() {
    return `
        <div class="section-header">
            <h1><i class="fa-solid fa-images"></i> Quản lý Hình ảnh Giao diện</h1>
        </div>

        <style>
            .media-tabs {
                display: flex;
                gap: 10px;
                margin-bottom: 25px;
                flex-wrap: wrap;
            }
            .media-tab {
                padding: 12px 24px;
                background: #f3f4f6;
                border: 2px solid transparent;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .media-tab:hover {
                background: #e5e7eb;
            }
            .media-tab.active {
                background: linear-gradient(135deg, #16a34a, #15803d);
                color: white;
                border-color: #166534;
            }
            .media-content {
                background: white;
                border-radius: 15px;
                padding: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }
            .media-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }
            .media-card {
                border: 2px solid #e5e7eb;
                border-radius: 12px;
                overflow: hidden;
                background: #f9fafb;
                transition: all 0.2s;
            }
            .media-card:hover {
                border-color: #16a34a;
                box-shadow: 0 5px 20px rgba(22, 163, 74, 0.15);
            }
            .media-card img {
                width: 100%;
                height: 140px;
                object-fit: cover;
            }
            .media-card-info {
                padding: 12px;
            }
            .media-card-order {
                font-size: 0.85rem;
                color: #666;
                margin-bottom: 8px;
            }
            .media-card-actions {
                display: flex;
                gap: 8px;
            }
            .media-card-actions button {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.85rem;
                transition: all 0.2s;
            }
            .btn-media-delete {
                background: #fee2e2;
                color: #dc2626;
            }
            .btn-media-delete:hover {
                background: #dc2626;
                color: white;
            }
            .btn-media-toggle {
                background: #dcfce7;
                color: #16a34a;
            }
            .btn-media-toggle.inactive {
                background: #f3f4f6;
                color: #9ca3af;
            }
            .btn-media-edit {
                background: #dbeafe;
                color: #2563eb;
            }
            .btn-media-edit:hover {
                background: #2563eb;
                color: white;
            }
            .add-media-form {
                margin-top: 20px;
                padding: 20px;
                background: #f0fdf4;
                border-radius: 12px;
                border: 2px dashed #16a34a;
            }
            .add-media-form h4 {
                margin-bottom: 15px;
                color: #166534;
            }
            .add-media-row {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            .add-media-row input {
                flex: 1;
                min-width: 250px;
                padding: 12px 15px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: 1rem;
            }
            .add-media-row input:focus {
                outline: none;
                border-color: #16a34a;
            }
            .add-media-row button {
                padding: 12px 25px;
                background: linear-gradient(135deg, #16a34a, #15803d);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .add-media-row button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(22, 163, 74, 0.3);
            }
            .empty-media {
                text-align: center;
                padding: 50px;
                color: #9ca3af;
            }
            .empty-media i {
                font-size: 3rem;
                margin-bottom: 15px;
            }
            .team-select {
                margin-bottom: 20px;
            }
            .team-select select {
                padding: 12px 15px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: 1rem;
                min-width: 250px;
            }
            .media-hint {
                margin-top: 15px;
                padding: 15px;
                background: #fef3c7;
                border-radius: 8px;
                font-size: 0.9rem;
                color: #92400e;
            }
            .media-hint i {
                margin-right: 8px;
            }
        </style>

        <div class="media-tabs">
            <div class="media-tab active" data-tab="hero">
                <i class="fa-solid fa-home"></i> Hero Slideshow
            </div>
            <div class="media-tab" data-tab="jd">
                <i class="fa-solid fa-briefcase"></i> JD Background
            </div>
            <div class="media-tab" data-tab="gallery">
                <i class="fa-solid fa-images"></i> Gieo sắc Xuân sang
            </div>
            <div class="media-tab" data-tab="teams">
                <i class="fa-solid fa-users"></i> Gallery Đội hình
            </div>
        </div>

        <div class="media-content" id="media-content">
            <div class="empty-media">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Đang tải...</p>
            </div>
        </div>
    `;
}

// ============================================================
// INITIALIZE
// ============================================================
export async function initMediaManager() {
    console.log('[MediaManager] Initializing...');

    // Tab click handlers
    document.querySelectorAll('.media-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            renderTabContent();
        });
    });

    // Load initial data
    await loadAllMedia();
    renderTabContent();
}

// ============================================================
// LOAD DATA FROM FIREBASE
// ============================================================
async function loadAllMedia() {
    try {
        // Load hero images
        const heroSnap = await getDocs(query(collection(db, COLLECTIONS.HERO), orderBy('order')));
        heroImages = heroSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Load JD background images
        const jdSnap = await getDocs(query(collection(db, COLLECTIONS.JD_BG), orderBy('order')));
        jdImages = jdSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Load gallery images (Gieo sắc Xuân sang)
        const gallerySnap = await getDocs(query(collection(db, COLLECTIONS.GALLERY), orderBy('order')));
        galleryImages = gallerySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Load team gallery
        const teamSnap = await getDocs(collection(db, COLLECTIONS.TEAM_GALLERY));
        teamImages = {};
        teamSnap.docs.forEach(doc => {
            teamImages[doc.id] = { id: doc.id, ...doc.data() };
        });

        console.log('[MediaManager] Loaded:', { hero: heroImages.length, jd: jdImages.length, gallery: galleryImages.length, teams: Object.keys(teamImages).length });
    } catch (error) {
        console.error('[MediaManager] Load error:', error);
    }
}

// ============================================================
// RENDER TAB CONTENT
// ============================================================
function renderTabContent() {
    const container = document.getElementById('media-content');
    if (!container) return;

    switch (currentTab) {
        case 'hero':
            container.innerHTML = renderImageGrid(heroImages, 'hero', 'Trang chủ Hero Slideshow');
            break;
        case 'jd':
            container.innerHTML = renderImageGrid(jdImages, 'jd', 'Job Description Background');
            break;
        case 'gallery':
            container.innerHTML = renderImageGrid(galleryImages, 'gallery', 'Gallery "Gieo sắc Xuân sang"');
            break;
        case 'teams':
            container.innerHTML = renderTeamGallery();
            break;
    }

    attachEventListeners();
}

// ============================================================
// RENDER IMAGE GRID
// ============================================================
function renderImageGrid(images, type, title) {
    const gridHtml = images.length > 0
        ? images.map((img, idx) => `
            <div class="media-card" data-id="${img.id}" data-type="${type}" data-url="${img.url}">
                <img src="${img.url}" alt="Image ${idx + 1}" onerror="this.src='https://via.placeholder.com/300x200?text=Error'">
                <div class="media-card-info">
                    <div class="media-card-order">#${idx + 1} - ${img.active !== false ? '✅ Đang hiện' : '⏸️ Tạm ẩn'}</div>
                    <div class="media-card-actions">
                        <button class="btn-media-edit" data-id="${img.id}" title="Sửa URL">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-media-toggle ${img.active === false ? 'inactive' : ''}" data-id="${img.id}" title="Ẩn/Hiện">
                            <i class="fa-solid ${img.active !== false ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="btn-media-delete" data-id="${img.id}" title="Xóa">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('')
        : `<div class="empty-media">
            <i class="fa-solid fa-image"></i>
            <p>Chưa có hình ảnh nào</p>
        </div>`;

    return `
        <h3 style="margin-bottom: 20px; color: #166534;">
            <i class="fa-solid fa-images"></i> ${title}
        </h3>
        <div class="media-grid">${gridHtml}</div>
        
        <div class="add-media-form">
            <h4><i class="fa-solid fa-plus-circle"></i> Thêm hình ảnh mới</h4>
            <textarea id="new-media-url" rows="4" style="width:100%; padding:12px; border:2px solid #e5e7eb; border-radius:8px; font-size:1rem; resize:vertical;" placeholder="Dán nhiều link Google Drive, mỗi link 1 dòng..."></textarea>
            <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                <button id="btn-add-media" data-type="${type}" style="padding:12px 25px; background:linear-gradient(135deg, #16a34a, #15803d); color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer;">
                    <i class="fa-solid fa-plus"></i> Thêm tất cả
                </button>
                <span style="color:#666; font-size:0.9rem;">Hỗ trợ nhiều link cùng lúc!</span>
            </div>
            <div class="media-hint">
                <i class="fa-solid fa-lightbulb"></i>
                <strong>Hướng dẫn:</strong> Paste nhiều link Google Drive (mỗi link 1 dòng) - hệ thống sẽ tự động chuyển đổi! ✨
            </div>
        </div>
    `;
}

// ============================================================
// RENDER TEAM GALLERY
// ============================================================
function renderTeamGallery() {
    // Danh sách đội hình từ xtn_teams (trừ Ban Chỉ huy)
    const teamList = [
        { id: 'xuan-tu-hao', name: 'Đội hình Xuân tự hào' },
        { id: 'xuan-ban-sac', name: 'Đội hình Xuân bản sắc' },
        { id: 'xuan-se-chia', name: 'Đội hình Xuân sẻ chia' },
        { id: 'xuan-gan-ket', name: 'Đội hình Xuân gắn kết' },
        { id: 'xuan-chien-si', name: 'Đội hình Xuân chiến sĩ' },
        { id: 'tet-van-minh', name: 'Đội hình Tết văn minh' },
        { id: 'giai-dieu-mua-xuan', name: 'Đội hình Giai điệu mùa xuân' },
        { id: 'vien-chuc-tre', name: 'Đội hình Viên chức trẻ' },
        { id: 'ky-su-tet', name: 'Đội hình Ký sự Tết' },
        { id: 'hau-can', name: 'Đội hình Hậu cần' },
        { id: 'tu-van-phap-luat', name: 'Đội hình Tư vấn và Giảng dạy pháp luật cộng đồng' }
    ];

    return `
        <h3 style="margin-bottom: 20px; color: #166534;">
            <i class="fa-solid fa-users"></i> Gallery Đội hình (Job Description)
        </h3>
        
        <div class="team-select">
            <select id="select-team">
                ${teamList.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
        </div>
        
        <div id="team-gallery-content">
            ${renderTeamImages(teamList[0].id)}
        </div>
    `;
}

function renderTeamImages(teamId) {
    const team = teamImages[teamId] || { images: [], description: '' };
    const images = team.images || [];
    const description = team.description || '';

    const gridHtml = images.length > 0
        ? images.map((url, idx) => `
            <div class="media-card" data-team="${teamId}" data-index="${idx}">
                <img src="${url}" alt="Team ${idx + 1}" onerror="this.src='https://via.placeholder.com/300x200?text=Error'">
                <div class="media-card-info">
                    <div class="media-card-order">#${idx + 1}</div>
                    <div class="media-card-actions">
                        <button class="btn-media-delete" data-team="${teamId}" data-index="${idx}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('')
        : `<div class="empty-media">
            <i class="fa-solid fa-image"></i>
            <p>Chưa có hình ảnh cho đội này</p>
        </div>`;

    return `
        <div class="media-grid">${gridHtml}</div>
        
        <!-- Mô tả công việc với Rich Text Editor -->
        <div class="add-media-form" style="margin-bottom: 20px; background: #fffbeb; border-color: #f59e0b;">
            <h4 style="color: #b45309;"><i class="fa-solid fa-file-alt"></i> Mô tả công việc của đội</h4>
            
            <!-- Rich Text Toolbar -->
            <div class="rich-editor-toolbar" style="display:flex; gap:5px; margin-bottom:8px; padding:8px; background:#fff; border:1px solid #fcd34d; border-radius:8px 8px 0 0; flex-wrap:wrap;">
                <button type="button" class="editor-btn" data-cmd="bold" title="In đậm (Ctrl+B)" style="padding:8px 12px; border:1px solid #ddd; border-radius:4px; background:#fff; cursor:pointer; font-weight:bold;">B</button>
                <button type="button" class="editor-btn" data-cmd="italic" title="In nghiêng (Ctrl+I)" style="padding:8px 12px; border:1px solid #ddd; border-radius:4px; background:#fff; cursor:pointer; font-style:italic;">I</button>
                <button type="button" class="editor-btn" data-cmd="underline" title="Gạch chân (Ctrl+U)" style="padding:8px 12px; border:1px solid #ddd; border-radius:4px; background:#fff; cursor:pointer; text-decoration:underline;">U</button>
                <span style="width:1px; background:#ddd; margin:0 5px;"></span>
                <label style="display:flex; align-items:center; gap:5px; padding:4px 8px; border:1px solid #ddd; border-radius:4px; cursor:pointer;">
                    <i class="fa-solid fa-palette" style="color:#666;"></i>
                    <input type="color" id="text-color-picker" value="#000000" style="width:24px; height:24px; border:none; cursor:pointer;">
                </label>
                <span style="width:1px; background:#ddd; margin:0 5px;"></span>
                <select id="font-select" style="padding:6px 10px; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:0.9rem;">
                    <option value="UTM Avo" style="font-family:'UTM Avo'">UTM Avo</option>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Georgia">Georgia</option>
                </select>
                <button type="button" class="editor-btn editor-btn-red" data-color="#dc2626" title="Màu đỏ" style="padding:8px 12px; border:1px solid #ddd; border-radius:4px; background:#dc2626; color:white; cursor:pointer; font-weight:bold;">
                    A
                </button>
                <button type="button" class="editor-btn" data-cmd="removeFormat" title="Xóa định dạng" style="padding:8px 12px; border:1px solid #ddd; border-radius:4px; background:#fff; cursor:pointer;">
                    <i class="fa-solid fa-eraser"></i>
                </button>
            </div>
            
            <!-- Contenteditable Editor -->
            <div id="team-description-editor" contenteditable="true" style="width:100%; min-height:120px; padding:12px; border:2px solid #fcd34d; border-top:none; border-radius:0 0 8px 8px; font-size:1rem; background:#fff; outline:none; line-height:1.6;" placeholder="Nhập mô tả công việc, nhiệm vụ của đội hình này...">${description}</div>
            
            <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                <button id="btn-save-description" data-team="${teamId}" style="padding:10px 20px; background: linear-gradient(135deg, #f59e0b, #d97706); color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer;">
                    <i class="fa-solid fa-save"></i> Lưu mô tả
                </button>
                <span style="color:#666; font-size:0.85rem;"><i class="fa-solid fa-info-circle"></i> Hỗ trợ: <b>B</b>old, <i>I</i>talic, <u>U</u>nderline, Màu chữ</span>
            </div>
        </div>
        
        <!-- Thêm hình ảnh -->
        <div class="add-media-form">
            <h4><i class="fa-solid fa-plus-circle"></i> Thêm hình ảnh cho đội hình</h4>
            <textarea id="new-team-image-url" rows="4" style="width:100%; padding:12px; border:2px solid #e5e7eb; border-radius:8px; font-size:1rem; resize:vertical;" placeholder="Dán nhiều link Google Drive, mỗi link 1 dòng..."></textarea>
            <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                <button id="btn-add-team-image" data-team="${teamId}" style="padding:12px 25px; background:linear-gradient(135deg, #16a34a, #15803d); color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer;">
                    <i class="fa-solid fa-plus"></i> Thêm tất cả
                </button>
                <span style="color:#666; font-size:0.9rem;">Hỗ trợ nhiều link cùng lúc!</span>
            </div>
            <div class="media-hint">
                <i class="fa-solid fa-lightbulb"></i>
                <strong>Hướng dẫn:</strong> Paste nhiều link Google Drive (mỗi link 1 dòng) - hệ thống sẽ tự động chuyển đổi! ✨
            </div>
        </div>
    `;
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function attachEventListeners() {
    // Add media button
    const addBtn = document.getElementById('btn-add-media');
    if (addBtn) {
        addBtn.addEventListener('click', handleAddMedia);
    }

    // Delete buttons
    document.querySelectorAll('.btn-media-delete').forEach(btn => {
        btn.addEventListener('click', handleDeleteMedia);
    });

    // Toggle buttons
    document.querySelectorAll('.btn-media-toggle').forEach(btn => {
        btn.addEventListener('click', handleToggleMedia);
    });

    // Edit buttons
    document.querySelectorAll('.btn-media-edit').forEach(btn => {
        btn.addEventListener('click', handleEditMedia);
    });

    // Team select
    const teamSelect = document.getElementById('select-team');
    if (teamSelect) {
        teamSelect.addEventListener('change', (e) => {
            document.getElementById('team-gallery-content').innerHTML = renderTeamImages(e.target.value);
            attachEventListeners();
        });
    }

    // Add team image
    const addTeamBtn = document.getElementById('btn-add-team-image');
    if (addTeamBtn) {
        addTeamBtn.addEventListener('click', handleAddTeamImage);
    }

    // Save description button
    const saveDescBtn = document.getElementById('btn-save-description');
    if (saveDescBtn) {
        saveDescBtn.addEventListener('click', handleSaveDescription);
    }

    // Rich Text Editor toolbar buttons
    document.querySelectorAll('.editor-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            document.execCommand(cmd, false, null);
            // Re-focus editor
            document.getElementById('team-description-editor')?.focus();
        });
    });

    // Color picker for text
    const colorPicker = document.getElementById('text-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            document.execCommand('foreColor', false, e.target.value);
            document.getElementById('team-description-editor')?.focus();
        });
    }

    // Font selector
    const fontSelect = document.getElementById('font-select');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            document.execCommand('fontName', false, e.target.value);
            document.getElementById('team-description-editor')?.focus();
        });
    }

    // Red color button
    const redBtn = document.querySelector('.editor-btn-red');
    if (redBtn) {
        redBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand('foreColor', false, '#dc2626');
            document.getElementById('team-description-editor')?.focus();
        });
    }
}

// ============================================================
// CRUD OPERATIONS
// ============================================================
async function handleAddMedia(e) {
    const type = e.target.closest('button')?.dataset?.type || e.target.dataset.type;
    const input = document.getElementById('new-media-url');
    const rawValue = input?.value?.trim();

    if (!rawValue) {
        if (window.showToast) showToast('Vui lòng nhập URL hình ảnh', 'warning');
        return;
    }

    // Split by newlines to get multiple URLs
    const urls = rawValue.split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0)
        .map(u => convertGoogleDriveUrl(u));

    if (urls.length === 0) {
        if (window.showToast) showToast('Không tìm thấy URL hợp lệ', 'warning');
        return;
    }

    const collName = type === 'hero' ? COLLECTIONS.HERO : (type === 'gallery' ? COLLECTIONS.GALLERY : COLLECTIONS.JD_BG);
    const images = type === 'hero' ? heroImages : (type === 'gallery' ? galleryImages : jdImages);

    try {
        let addedCount = 0;
        for (let i = 0; i < urls.length; i++) {
            await addDoc(collection(db, collName), {
                url: urls[i],
                order: images.length + i + 1,
                active: true,
                created_at: serverTimestamp()
            });
            addedCount++;
        }

        // Log activity
        activityLog.create('media_bulk_add', {
            type,
            count: addedCount
        });

        input.value = '';
        await loadAllMedia();
        renderTabContent();
        if (window.showToast) showToast(`Đã thêm ${addedCount} hình ảnh!`, 'success');
    } catch (error) {
        console.error('Add error:', error);
        if (window.showToast) showToast('Lỗi: ' + error.message, 'error');
    }
}

async function handleDeleteMedia(e) {
    const btn = e.target.closest('button');
    const id = btn.dataset.id;
    const type = btn.closest('.media-card')?.dataset?.type;

    if (!id) return;

    const confirmed = window.showConfirmModal
        ? await window.showConfirmModal('Xóa hình ảnh này?')
        : confirm('Xóa hình ảnh này?');

    if (!confirmed) return;

    const collName = type === 'hero' ? COLLECTIONS.HERO : (type === 'gallery' ? COLLECTIONS.GALLERY : COLLECTIONS.JD_BG);

    try {
        await deleteDoc(doc(db, collName, id));

        // Log activity
        activityLog.delete('media_delete', {
            type,
            imageId: id
        });

        await loadAllMedia();
        renderTabContent();
        if (window.showToast) showToast('Đã xóa!', 'success');
    } catch (error) {
        console.error('Delete error:', error);
        if (window.showToast) showToast('Lỗi: ' + error.message, 'error');
    }
}

async function handleToggleMedia(e) {
    const btn = e.target.closest('button');
    const id = btn.dataset.id;
    const type = btn.closest('.media-card')?.dataset?.type;

    if (!id) return;

    const collName = type === 'hero' ? COLLECTIONS.HERO : (type === 'gallery' ? COLLECTIONS.GALLERY : COLLECTIONS.JD_BG);
    const images = type === 'hero' ? heroImages : (type === 'gallery' ? galleryImages : jdImages);
    const img = images.find(i => i.id === id);

    if (!img) return;

    try {
        await updateDoc(doc(db, collName, id), {
            active: img.active === false ? true : false
        });

        // Log activity
        activityLog.update('media_toggle', {
            type,
            imageId: id,
            newState: img.active === false ? 'visible' : 'hidden'
        });

        await loadAllMedia();
        renderTabContent();
        if (window.showToast) showToast('Đã cập nhật!', 'success');
    } catch (error) {
        console.error('Toggle error:', error);
        if (window.showToast) showToast('Lỗi: ' + error.message, 'error');
    }
}

async function handleEditMedia(e) {
    const btn = e.target.closest('button');
    const id = btn.dataset.id;
    const card = btn.closest('.media-card');
    const type = card?.dataset?.type;
    const currentUrl = card?.dataset?.url;

    if (!id) return;

    // Use SweetAlert to show current URL clearly
    const { value: newUrl, isConfirmed } = await Swal.fire({
        title: '<i class="fa-solid fa-pen"></i> Chỉnh sửa URL hình ảnh',
        html: `
            <div style="text-align:left; margin-bottom:15px;">
                <label style="font-weight:600; color:#666; display:block; margin-bottom:8px;">
                    <i class="fa-solid fa-link"></i> URL hiện tại:
                </label>
                <textarea id="swal-url-input" style="width:100%; min-height:120px; padding:12px; border:2px solid #e5e7eb; border-radius:8px; font-size:0.9rem; font-family:monospace; resize:vertical;">${currentUrl || ''}</textarea>
                <div style="margin-top:10px; font-size:0.85rem; color:#666;">
                    <i class="fa-solid fa-lightbulb" style="color:#f59e0b;"></i> 
                    Có thể dán link Google Drive - hệ thống sẽ tự động chuyển đổi!
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-save"></i> Lưu thay đổi',
        cancelButtonText: '<i class="fa-solid fa-times"></i> Hủy',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280',
        width: '600px',
        preConfirm: () => {
            return document.getElementById('swal-url-input').value.trim();
        }
    });

    if (!isConfirmed || !newUrl || newUrl === currentUrl) return;

    // Auto-convert Google Drive links
    const convertedUrl = convertGoogleDriveUrl(newUrl);

    const collName = type === 'hero' ? COLLECTIONS.HERO : (type === 'gallery' ? COLLECTIONS.GALLERY : COLLECTIONS.JD_BG);

    try {
        await updateDoc(doc(db, collName, id), {
            url: convertedUrl
        });

        // Log activity
        activityLog.update('media_edit', {
            type,
            imageId: id,
            oldUrl: currentUrl?.substring(0, 50) + '...',
            newUrl: convertedUrl.substring(0, 50) + '...'
        });

        await loadAllMedia();
        renderTabContent();
        if (window.showToast) showToast('Đã cập nhật URL!', 'success');
    } catch (error) {
        console.error('Edit error:', error);
        if (window.showToast) showToast('Lỗi: ' + error.message, 'error');
    }
}

async function handleAddTeamImage(e) {
    const teamId = e.target.closest('button')?.dataset?.team || e.target.dataset.team;
    const input = document.getElementById('new-team-image-url');
    const rawValue = input?.value?.trim();

    if (!rawValue) {
        if (window.showToast) showToast('Vui lòng nhập URL hình ảnh', 'warning');
        return;
    }

    // Split by newlines to get multiple URLs
    const urls = rawValue.split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0)
        .map(u => convertGoogleDriveUrl(u));

    if (urls.length === 0) {
        if (window.showToast) showToast('Không tìm thấy URL hợp lệ', 'warning');
        return;
    }

    try {
        const teamRef = doc(db, COLLECTIONS.TEAM_GALLERY, teamId);
        const currentImages = teamImages[teamId]?.images || [];

        // Use setDoc with merge to create or update
        await setDoc(teamRef, {
            images: [...currentImages, ...urls]
        }, { merge: true });

        // Log activity
        activityLog.create('media_team_add', {
            teamId,
            count: urls.length
        });

        input.value = '';
        await loadAllMedia();
        document.getElementById('team-gallery-content').innerHTML = renderTeamImages(teamId);
        attachEventListeners();
        if (window.showToast) showToast(`Đã thêm ${urls.length} hình ảnh!`, 'success');
    } catch (error) {
        console.error('Add team image error:', error);
        if (window.showToast) showToast('Lỗi: ' + error.message, 'error');
    }
}

// Handle save team description (with rich text HTML)
async function handleSaveDescription(e) {
    const teamId = e.target.closest('button')?.dataset?.team || e.target.dataset.team;
    const editor = document.getElementById('team-description-editor');
    const description = editor?.innerHTML?.trim() || '';

    try {
        const teamRef = doc(db, COLLECTIONS.TEAM_GALLERY, teamId);

        // Use setDoc with merge to create or update
        await setDoc(teamRef, {
            description: description
        }, { merge: true });

        // Log activity
        activityLog.update('media_team_description', {
            teamId,
            descriptionLength: description.length
        });

        await loadAllMedia();
        if (window.showToast) showToast('Đã lưu mô tả công việc!', 'success');
    } catch (error) {
        console.error('Save description error:', error);
        if (window.showToast) showToast('Lỗi: ' + error.message, 'error');
    }
}
