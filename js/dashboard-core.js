/**
 * dashboard-core.js - Core Module (Auth, Menu, Routing)
 * XTN 2026 - Refactored
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Import modules
import { initAvatarCanvas, handleAvatarUpload, downloadAvatar, resetAvatarFull, setShowAlert as setAvatarShowAlert } from './dashboard-avatar.js';
import { initCardCanvas, handleCardPhoto, handleCardForm, downloadCard, setUserData as setCardUserData } from './dashboard-card.js';
import {
    loadRegistrations, handleRegister, viewRegistration, saveRegistration,
    closeRegistrationModal, toggleRegSelection, toggleAllRegs, deleteSelectedRegs,
    deleteRegistration, setHelpers as setRegHelpers, setCurrentUser as setRegCurrentUser
} from './dashboard-registrations.js';
import { initActivityModule } from './activity.js';
import { initCardsAdmin, setHelpers as setCardsAdminHelpers } from './dashboard-cards-admin.js';
import { exportChienSi, importFromExcel, validateImportData, downloadImportTemplate } from './excel-utils.js';
import {
    backupAllJSON, backupUsersJSON, backupActivitiesJSON,
    backupAllExcel, backupUsersExcel, backupActivitiesExcel
} from './backup.js';
import { initAIDashboard } from './ai-dashboard.js';
// AI features - TẠM TẮT, LÀM SAU
// import { aiCreateActivity, aiGenerateReport } from './ai-features.js';

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let userData = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ dashboard-core.js loaded');

    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUser = user;
        setRegCurrentUser(user);

        // ============================================================
        // DANH SÁCH SUPER ADMIN (HARDCODE)
        // Các vai trò trong hệ thống:
        // - super_admin    : BCH Trường (Super Admin) - Toàn quyền
        // - kysutet_admin  : Đội trưởng/Đội phó Ký sự Tết - Quyền ngang Super Admin
        // - doihinh_admin  : BCH Đội (Đội trưởng/Đội phó) - Quản lý đội hình
        // - member         : Chiến sĩ - Xem thông tin, tạo avatar/thẻ
        // - pending        : Chờ duyệt - Mới đăng ký, chưa được duyệt
        // ============================================================
        const SUPER_ADMIN_EMAILS = [
            'minhlq23504b@st.uel.edu.vn',  // Lâm Quốc Minh - Web Admin
            'hoisinhvien@uel.edu.vn',      // Email Ban Chỉ huy Chiến dịch
            // Thêm email BCH Trường khác ở đây (sẽ tự động có quyền super_admin khi đăng nhập)
        ];

        // Lấy thông tin user từ Firestore
        try {
            // 1. Tìm theo UID trước
            const userDoc = await getDoc(doc(db, "xtn_users", user.uid));

            // 2. Nếu không tìm thấy theo UID, tìm theo email (từ form thêm chiến sĩ)
            if (!userDoc.exists()) {
                console.log('🔐 [Auth] User not found by UID, searching by email...');
                const emailQuery = await getDocs(
                    query(collection(db, 'xtn_users'), where('email', '==', user.email))
                );

                if (!emailQuery.empty) {
                    // Tìm thấy theo email - lấy role từ đó và cập nhật UID document
                    const existingData = emailQuery.docs[0].data();
                    console.log('🔐 [Auth] Found user by email, role:', existingData.role);

                    // Tạo/cập nhật document theo UID với role đã có
                    await setDoc(doc(db, "xtn_users", user.uid), {
                        ...existingData,
                        name: user.displayName || existingData.name || user.email.split('@')[0],
                        last_login: new Date().toISOString()
                    }, { merge: true });

                    userData = existingData;
                    console.log('✅ Synced role from email document:', existingData.role);
                } else {
                    // Không tìm thấy - tạo mới với role pending
                    userData = { role: 'pending', name: user.displayName || user.email.split('@')[0] };
                    console.log('🔐 [Auth] New user, role: pending');
                }
            } else {
                userData = userDoc.data();
            }

            // Check và auto-upgrade Super Admin (fallback)
            const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email);
            console.log('🔐 [Auth] Email:', user.email, '| Current role:', userData.role, '| Should be super_admin:', shouldBeSuperAdmin);

            if (shouldBeSuperAdmin && userData.role !== 'super_admin') {
                console.log('🔐 [Auth] Upgrading to super_admin...');
                await setDoc(doc(db, "xtn_users", user.uid), { role: 'super_admin' }, { merge: true });
                userData.role = 'super_admin';
                console.log('✅ Auto-upgraded to super_admin:', user.email);
            }
        } catch (e) {
            console.error('Error loading user data:', e);
            userData = { role: 'pending', name: user.displayName || user.email.split('@')[0] };
        }

        // Pass helpers to modules
        setAvatarShowAlert(showAlert);
        setRegHelpers(showAlert, showConfirm);
        setCardUserData(userData);
        setCardsAdminHelpers(showAlert, showConfirm);

        // Hiện tên user
        const displayName = userData.name || user.displayName || user.email.split('@')[0];
        document.getElementById('user-name').textContent = displayName;

        // Hiện avatar
        const avatarImg = document.getElementById('user-avatar-img');
        if (avatarImg) {
            avatarImg.src = user.photoURL || 'images/default-avatar.png';
            avatarImg.onerror = () => { avatarImg.src = 'images/default-avatar.png'; };
        }

        // Setup menu theo role
        setupMenuByRole();

        // Ẩn loading, hiện section mặc định
        hideSection('section-loading');
        showDefaultSection();

        // Init AI Dashboard (nếu là admin)
        if (['super_admin', 'admin', 'bch_truong'].includes(userData.role)) {
            initAIDashboard();
        }
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    });

    // Menu clicks
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            if (section) {
                setActiveMenuItem(item);
                showSection(section);
            }
        });
    });

    // Menu section toggle
    document.querySelectorAll('.menu-section-title').forEach(title => {
        title.addEventListener('click', () => {
            const section = title.parentElement;
            section.classList.toggle('open');
        });
    });

    // Forms
    document.getElementById('register-form')?.addEventListener('submit', (e) => handleRegister(e, showSection));
    document.getElementById('avatar-upload')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('btn-avatar-reset')?.addEventListener('click', resetAvatarFull);
    document.getElementById('btn-avatar-download')?.addEventListener('click', downloadAvatar);
    document.getElementById('card-form')?.addEventListener('submit', handleCardForm);
    document.getElementById('card-photo')?.addEventListener('change', handleCardPhoto);
    document.getElementById('btn-card-download')?.addEventListener('click', downloadCard);
    document.getElementById('activity-form')?.addEventListener('submit', handleActivityForm);
    document.getElementById('team-form')?.addEventListener('submit', handleTeamForm);
    document.getElementById('question-form')?.addEventListener('submit', handleQuestionForm);

    // Excel Import/Export
    document.getElementById('btn-export-excel')?.addEventListener('click', handleExportExcel);
    document.getElementById('btn-import-excel')?.addEventListener('click', () => {
        document.getElementById('excel-import-file')?.click();
    });
    document.getElementById('excel-import-file')?.addEventListener('change', handleImportExcel);
    document.getElementById('btn-download-template')?.addEventListener('click', downloadImportTemplate);
    document.getElementById('btn-confirm-import')?.addEventListener('click', confirmImport);

    // Add Member Manually
    document.getElementById('btn-add-member')?.addEventListener('click', openAddMemberModal);
    document.getElementById('form-add-member')?.addEventListener('submit', handleAddMember);

    // AI Features
    document.getElementById('btn-ai-create-activity')?.addEventListener('click', openAIActivityModal);
    document.getElementById('btn-ai-report')?.addEventListener('click', openAIReportModal);
    document.getElementById('btn-ai-generate')?.addEventListener('click', handleAIGenerateActivity);
    document.getElementById('btn-ai-apply')?.addEventListener('click', applyAIActivity);
    document.getElementById('btn-ai-generate-report')?.addEventListener('click', handleAIGenerateReport);
    document.getElementById('btn-copy-report')?.addEventListener('click', copyReportContent);

    // Reload câu hỏi khi chọn đội hình khác
    document.getElementById('reg-team')?.addEventListener('change', function () {
        loadDynamicQuestionsToForm(this.value || null);
    });

    // Backup buttons - JSON
    document.getElementById('btn-backup-all-json')?.addEventListener('click', async () => {
        try {
            await backupAllJSON();
            showAlert('Backup JSON toàn bộ thành công!', 'success', 'Hoàn thành');
        } catch (e) {
            console.error('[Backup] Error:', e);
            showAlert('Lỗi backup dữ liệu!', 'error', 'Lỗi');
        }
    });
    document.getElementById('btn-backup-users-json')?.addEventListener('click', async () => {
        try {
            await backupUsersJSON();
            showAlert('Backup thành viên thành công!', 'success', 'Hoàn thành');
        } catch (e) {
            console.error('[Backup] Error:', e);
            showAlert('Lỗi backup dữ liệu!', 'error', 'Lỗi');
        }
    });
    document.getElementById('btn-backup-activities-json')?.addEventListener('click', async () => {
        try {
            await backupActivitiesJSON();
            showAlert('Backup hoạt động thành công!', 'success', 'Hoàn thành');
        } catch (e) {
            console.error('[Backup] Error:', e);
            showAlert('Lỗi backup dữ liệu!', 'error', 'Lỗi');
        }
    });

    // Backup buttons - Excel
    document.getElementById('btn-backup-all-excel')?.addEventListener('click', async () => {
        try {
            await backupAllExcel();
            showAlert('Backup Excel toàn bộ thành công!', 'success', 'Hoàn thành');
        } catch (e) {
            console.error('[Backup] Error:', e);
            showAlert('Lỗi backup dữ liệu!', 'error', 'Lỗi');
        }
    });
    document.getElementById('btn-backup-users-excel')?.addEventListener('click', async () => {
        try {
            await backupUsersExcel();
            showAlert('Backup thành viên thành công!', 'success', 'Hoàn thành');
        } catch (e) {
            console.error('[Backup] Error:', e);
            showAlert('Lỗi backup dữ liệu!', 'error', 'Lỗi');
        }
    });
    document.getElementById('btn-backup-activities-excel')?.addEventListener('click', async () => {
        try {
            await backupActivitiesExcel();
            showAlert('Backup hoạt động thành công!', 'success', 'Hoàn thành');
        } catch (e) {
            console.error('[Backup] Error:', e);
            showAlert('Lỗi backup dữ liệu!', 'error', 'Lỗi');
        }
    });

    // [COMMENTED OUT - Production] Dev role switcher
    // document.getElementById('btn-dev-apply')?.addEventListener('click', applyDevRole);
});

// ============================================================
// CUSTOM MODAL CONFIRM / ALERT
// ============================================================
function showConfirm(message, title = 'Xác nhận') {
    return new Promise((resolve) => {
        const existingModal = document.getElementById('custom-confirm-modal');
        if (existingModal) existingModal.remove();

        const html = `
            <div id="custom-confirm-modal" class="modal-overlay" style="display:flex;">
                <div class="modal-box">
                    <h3>${title}</h3>
                    <p>${message}</p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="confirm-cancel">Hủy</button>
                        <button class="btn btn-primary" id="confirm-ok">Đồng ý</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);

        const cleanup = () => document.getElementById('custom-confirm-modal')?.remove();
        document.getElementById('confirm-ok').onclick = () => { cleanup(); resolve(true); };
        document.getElementById('confirm-cancel').onclick = () => { cleanup(); resolve(false); };
    });
}

function showAlert(message, type = 'info', title = 'Thông báo') {
    return new Promise((resolve) => {
        const existingModal = document.getElementById('custom-alert-modal');
        if (existingModal) existingModal.remove();

        const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        const colors = { success: '#16a34a', error: '#dc2626', warning: '#f59e0b', info: '#0ea5e9' };
        const bgColors = { success: '#f0fdf4', error: '#fef2f2', warning: '#fffbeb', info: '#f0f9ff' };

        const html = `
            <div id="custom-alert-modal" class="modal-overlay" style="display:flex; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);">
                <div class="modal-box" style="
                    text-align: center;
                    background: white;
                    border-radius: 16px;
                    padding: 30px 40px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 400px;
                    animation: modalPop 0.3s ease;
                ">
                    <div style="
                        width: 70px;
                        height: 70px;
                        border-radius: 50%;
                        background: ${bgColors[type]};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 20px;
                    ">
                        <i class="fa-solid fa-${icons[type]}" style="font-size: 36px; color: ${colors[type]};"></i>
                    </div>
                    <h3 style="margin: 0 0 10px; color: #1f2937; font-size: 1.4rem;">${title}</h3>
                    <p style="margin: 0 0 25px; color: #6b7280; font-size: 1rem; line-height: 1.5;">${message}</p>
                    <button class="btn" id="alert-ok" style="
                        background: ${colors[type]};
                        color: white;
                        border: none;
                        padding: 12px 40px;
                        border-radius: 8px;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        box-shadow: 0 4px 15px ${colors[type]}40;
                    ">OK</button>
                </div>
            </div>
            <style>
                @keyframes modalPop {
                    from { transform: scale(0.8); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            </style>`;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('alert-ok').onclick = () => {
            document.getElementById('custom-alert-modal')?.remove();
            resolve();
        };
    });
}

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
    const now = new Date();

    // Update time
    const timeEl = document.getElementById('clock-time');
    if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString('vi-VN');
    }

    // Update date
    const dateEl = document.getElementById('clock-date');
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
}

// ============================================================
// MENU
// ============================================================
function setupMenuByRole() {
    const role = userData.role || 'pending';

    // Hide all role-specific menus first
    document.getElementById('menu-dashboard')?.classList.add('hidden');
    document.getElementById('menu-tools')?.classList.add('hidden');
    document.getElementById('menu-activity')?.classList.add('hidden');
    document.getElementById('menu-system')?.classList.add('hidden');
    document.getElementById('menu-register')?.classList.add('hidden');

    if (role === 'pending') {
        document.getElementById('menu-register')?.classList.remove('hidden');
    } else if (role === 'member') {
        document.getElementById('menu-tools')?.classList.remove('hidden');
    } else if (role === 'doihinh_admin') {
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        document.getElementById('menu-activity')?.classList.remove('hidden');
    } else if (role === 'super_admin' || role === 'kysutet_admin') {
        // kysutet_admin có quyền ngang super_admin
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        document.getElementById('menu-activity')?.classList.remove('hidden');
        document.getElementById('menu-system')?.classList.remove('hidden');
    }
}

function setActiveMenuItem(item) {
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');

    // Load data for specific sections
    if (sectionId === 'section-dashboard') loadDashboardStats();
    if (sectionId === 'section-avatar') initAvatarCanvas();
    if (sectionId === 'section-card') initCardCanvas();
    if (sectionId === 'section-registrations') loadRegistrations();
    if (sectionId === 'section-members') loadMembers();
    if (sectionId === 'section-activities') loadActivities();
    if (sectionId === 'section-activity') initActivityModule();
    if (sectionId === 'section-teams') loadTeams();
    if (sectionId === 'section-questions') loadQuestions();
    if (sectionId === 'section-cards-admin') initCardsAdmin();
    if (sectionId === 'section-settings') initSettings();
}

function hideSection(sectionId) {
    document.getElementById(sectionId)?.classList.remove('active');
}

async function showDefaultSection() {
    const role = userData.role || 'pending';
    console.log('🔵 showDefaultSection, role:', role);

    // ĐÃ XÓA section-register và section-pending (đăng ký qua Google Form)
    // Pending users sẽ được redirect về avatar
    if (role === 'pending') {
        showSection('section-avatar');
    } else if (role === 'member') {
        showSection('section-avatar');
    } else {
        showSection('section-dashboard');
    }
}

// ============================================================
// DASHBOARD STATS
// ============================================================
async function loadDashboardStats() {
    try {
        const [regsSnap, membersSnap, teamsSnap] = await Promise.all([
            getDocs(collection(db, 'xtn_registrations')),
            getDocs(query(collection(db, 'xtn_users'), where('role', '==', 'member'))),
            getDocs(collection(db, 'xtn_teams'))
        ]);

        const statRegs = document.getElementById('stat-registrations');
        const statMembers = document.getElementById('stat-members');
        const statTeams = document.getElementById('stat-teams');

        if (statRegs) statRegs.textContent = regsSnap.size;
        if (statMembers) statMembers.textContent = membersSnap.size;
        if (statTeams) statTeams.textContent = teamsSnap.size;
    } catch (e) {
        console.error('Load stats error:', e);
    }
}

// ============================================================
// ACTIVITIES (Simple)
// ============================================================
async function loadActivities() {
    const list = document.getElementById('activities-list');
    if (!list) return;

    try {
        const snap = await getDocs(collection(db, 'xtn_activities'));
        if (snap.empty) {
            list.innerHTML = '<p style="text-align:center;color:#888;">Chưa có hoạt động nào</p>';
            return;
        }

        let html = '<table class="data-table"><thead><tr><th>Tên</th><th>Ngày</th><th>Số người</th></tr></thead><tbody>';
        snap.forEach(d => {
            const a = d.data();
            html += `<tr><td>${a.name}</td><td>${a.date}</td><td>${a.participants}</td></tr>`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu</p>';
    }
}

async function handleActivityForm(e) {
    e.preventDefault();

    const data = {
        name: document.getElementById('act-name').value.trim(),
        date: document.getElementById('act-date').value,
        participants: parseInt(document.getElementById('act-participants').value),
        description: document.getElementById('act-desc').value.trim(),
        team_id: userData.team_id || 'all',
        created_by: currentUser.uid,
        created_at: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, 'xtn_activities'), data);
        await showAlert('Đã lưu hoạt động!', 'success', 'Hoàn thành');
        e.target.reset();
        showSection('section-activities');
    } catch (err) {
        console.error(err);
        await showAlert('Lỗi lưu hoạt động!', 'error', 'Lỗi');
    }
}

// ============================================================
// MEMBERS
// ============================================================
let teamsListCache = [];
// ============================================================
// MEMBERS - DANH SÁCH CHIẾN SĨ NÂNG CẤP
// ============================================================
let selectedMembers = new Set();
let membersDataCache = [];

// Mapping chức vụ → role
const POSITION_TO_ROLE = {
    'Chỉ huy Trưởng': 'super_admin',
    'Chỉ huy Phó Thường trực': 'super_admin',
    'Chỉ huy Phó': 'super_admin',
    'Thành viên Thường trực Ban Chỉ huy': 'super_admin',
    'Thành viên Ban Chỉ huy': 'super_admin',
    'Đội trưởng': 'doihinh_admin',
    'Đội phó': 'doihinh_admin',
    'Chiến sĩ': 'member'
};

const POSITIONS_LIST = Object.keys(POSITION_TO_ROLE);

// Color helpers cho badges
function getPositionColor(position) {
    const colors = {
        'Chỉ huy Trưởng': '#dc2626',        // Đỏ đậm
        'Chỉ huy Phó Thường trực': '#ea580c', // Cam đỏ
        'Chỉ huy Phó': '#f97316',           // Cam
        'Thành viên Thường trực Ban Chỉ huy': '#ea580c',
        'Thành viên Ban Chỉ huy': '#fb923c',
        'Đội trưởng': '#0891b2',            // Cyan
        'Đội phó': '#06b6d4',               // Cyan nhạt
        'Chiến sĩ': '#16a34a'               // Xanh lá
    };
    return colors[position] || '#6b7280';
}

function getTeamColor(teamId) {
    if (!teamId) return '#9ca3af'; // Chưa phân đội - xám

    // Hash team_id để tạo màu nhất quán
    const colors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#6366f1', '#84cc16',
        '#f43f5e', '#14b8a6', '#a855f7', '#eab308'
    ];

    // Simple hash
    let hash = 0;
    for (let i = 0; i < teamId.length; i++) {
        hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

async function loadMembers() {
    const list = document.getElementById('members-list');
    if (!list) return;

    list.innerHTML = '<p style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';
    selectedMembers.clear();
    membersDataCache = [];

    try {
        // Load teams
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        teamsListCache = [];
        const teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
            teamsListCache.push({ id: d.id, name: d.data().team_name || d.id });
        });

        // Load registrations
        const regsSnap = await getDocs(collection(db, 'xtn_registrations'));
        const regsMap = {};
        regsSnap.forEach(d => {
            const r = d.data();
            regsMap[r.user_id] = r;
        });

        // Load all users (not just members)
        const snap = await getDocs(collection(db, 'xtn_users'));

        if (snap.empty) {
            list.innerHTML = '<p style="text-align:center;color:#888;">Chưa có chiến sĩ</p>';
            return;
        }

        // Cache data
        snap.forEach(d => {
            const u = d.data();
            const reg = regsMap[d.id] || {};
            membersDataCache.push({
                id: d.id,
                name: u.name || '',
                email: u.email || '',
                phone: u.phone || reg.phone || '',
                position: u.position || 'Chiến sĩ',
                role: u.role || 'member',
                team_id: u.team_id || reg.preferred_team || '',
                student_id: reg.student_id || '',
                faculty: reg.faculty || ''
            });
        });

        // Build HTML
        // Build team filter options
        let teamFilterOptions = '<option value="">Tất cả đội hình</option>';
        teamsListCache.forEach(t => {
            teamFilterOptions += `<option value="${t.id}">${t.name}</option>`;
        });

        // Sort theo chức vụ hierarchy
        const positionOrder = {
            'Chỉ huy Trưởng': 1,
            'Chỉ huy Phó Thường trực': 2,
            'Chỉ huy Phó': 3,
            'Thành viên Ban Chỉ huy': 4,
            'Đội trưởng': 5,
            'Đội phó': 6,
            'Chiến sĩ': 7
        };
        membersDataCache.sort((a, b) => {
            const orderA = positionOrder[a.position] || 99;
            const orderB = positionOrder[b.position] || 99;
            if (orderA !== orderB) return orderA - orderB;
            // Nếu cùng chức vụ, sort theo tên
            return a.name.localeCompare(b.name, 'vi');
        });

        let html = `
            <div class="members-toolbar" style="display:flex; gap:10px; margin-bottom:15px; align-items:center; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;">
                    <input type="checkbox" id="select-all-members" onchange="toggleAllMembers(this.checked)">
                    <span>Chọn tất cả</span>
                </label>
                <button class="btn btn-danger btn-sm" onclick="deleteSelectedMembers()" style="display:none;" id="btn-delete-selected">
                    <i class="fa-solid fa-trash"></i> Xóa đã chọn (<span id="selected-count">0</span>)
                </button>
                <div style="flex:1;"></div>
                <select id="members-team-filter" onchange="filterMembersByTeam()" style="padding:8px 12px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
                    ${teamFilterOptions}
                </select>
                <input type="text" id="members-search" placeholder="Tìm kiếm..." oninput="filterMembers()" style="padding:8px 12px; border:1px solid #ddd; border-radius:6px; width:180px;">
            </div>
            <div style="overflow-x:auto;">
            <table class="data-table" id="members-table">
                <thead>
                    <tr>
                        <th style="width:40px;"></th>
                        <th>Họ tên</th>
                        <th>Chức vụ</th>
                        <th>Khoa/Ngành</th>
                        <th>Email</th>
                        <th>SĐT</th>
                        <th>Đội hình</th>
                        <th style="width:100px;">Thao tác</th>
                    </tr>
                </thead>
                <tbody id="members-tbody">
        `;

        membersDataCache.forEach(m => {
            // Position badge color
            const posColor = getPositionColor(m.position);

            // Team badge
            const teamName = teamsMap[m.team_id] || 'Chưa phân đội';
            const teamColor = getTeamColor(m.team_id);

            html += `
                <tr data-id="${m.id}" data-name="${m.name.toLowerCase()}" data-email="${m.email.toLowerCase()}" data-team="${m.team_id || ''}">
                    <td><input type="checkbox" class="member-checkbox" data-id="${m.id}" onchange="toggleMemberSelection('${m.id}')"></td>
                    <td><strong>${m.name}</strong></td>
                    <td>
                        <span class="badge" style="background:${posColor}; color:white; padding:4px 10px; border-radius:12px; font-size:12px; white-space:nowrap;">
                            ${m.position}
                        </span>
                    </td>
                    <td style="font-size:13px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${m.faculty || ''}">${m.faculty || '-'}</td>
                    <td style="font-size:13px;">${m.email || '-'}</td>
                    <td>${m.phone || '-'}</td>
                    <td>
                        <span class="badge" style="background:${teamColor}; color:white; padding:4px 10px; border-radius:12px; font-size:12px; white-space:nowrap;">
                            ${teamName}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-sm btn-secondary" onclick="editMember('${m.id}')" title="Sửa" style="padding:6px 10px;">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteMember('${m.id}')" title="Xóa" style="padding:6px 10px;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        html += `<p style="margin-top:10px; color:#666; font-size:13px;">Tổng: <strong>${membersDataCache.length}</strong> thành viên</p>`;
        list.innerHTML = html;
    } catch (e) {
        console.error('Load members error:', e);
        list.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu</p>';
    }
}

// Selection helpers
window.toggleMemberSelection = function (userId) {
    if (selectedMembers.has(userId)) {
        selectedMembers.delete(userId);
    } else {
        selectedMembers.add(userId);
    }
    updateBulkActionUI();
};

window.toggleAllMembers = function (checked) {
    selectedMembers.clear();
    document.querySelectorAll('.member-checkbox').forEach(cb => {
        cb.checked = checked;
        if (checked) selectedMembers.add(cb.dataset.id);
    });
    updateBulkActionUI();
};

function updateBulkActionUI() {
    const count = selectedMembers.size;
    const btn = document.getElementById('btn-delete-selected');
    const countSpan = document.getElementById('selected-count');
    if (btn) btn.style.display = count > 0 ? 'inline-flex' : 'none';
    if (countSpan) countSpan.textContent = count;
}

window.filterMembers = function () {
    const query = document.getElementById('members-search')?.value.toLowerCase() || '';
    const teamFilter = document.getElementById('members-team-filter')?.value || '';

    document.querySelectorAll('#members-tbody tr').forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const team = row.dataset.team || '';

        const matchesSearch = name.includes(query) || email.includes(query);
        const matchesTeam = !teamFilter || team === teamFilter;

        row.style.display = (matchesSearch && matchesTeam) ? '' : 'none';
    });
};

window.filterMembersByTeam = function () {
    filterMembers(); // Reuse existing filter logic
};

// Update position → auto update role
window.updateMemberPosition = async function (userId, position) {
    const role = POSITION_TO_ROLE[position] || 'member';
    try {
        await setDoc(doc(db, 'xtn_users', userId), { position, role }, { merge: true });
        // Update cache
        const m = membersDataCache.find(x => x.id === userId);
        if (m) { m.position = position; m.role = role; }
        await showAlert(`Đã cập nhật: ${position} (${role})`, 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Update position error:', e);
        await showAlert('Lỗi cập nhật!', 'error', 'Lỗi');
    }
};

window.updateMemberTeam = async function (userId, teamId) {
    try {
        await setDoc(doc(db, 'xtn_users', userId), { team_id: teamId }, { merge: true });
        await showAlert('Đã cập nhật đội hình!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Update team error:', e);
        await showAlert('Lỗi cập nhật!', 'error', 'Lỗi');
    }
};

window.editMember = async function (userId) {
    const m = membersDataCache.find(x => x.id === userId);
    if (!m) return;

    // Build position options
    const posOptions = POSITIONS_LIST.map(p =>
        `<option value="${p}" ${m.position === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    // Build team options
    let teamOptions = '<option value="">-- Chưa phân đội --</option>';
    teamsListCache.forEach(t => {
        teamOptions += `<option value="${t.id}" ${t.id === m.team_id ? 'selected' : ''}>${t.name}</option>`;
    });

    const { value: formValues } = await Swal.fire({
        title: 'Sửa thông tin thành viên',
        html: `
            <div style="text-align:left; max-height:400px; overflow-y:auto;">
                <label style="display:block; margin-top:10px; font-weight:600;">Họ tên:</label>
                <input id="swal-name" class="swal2-input" value="${m.name}" style="margin:5px 0;">
                
                <label style="display:block; margin-top:10px; font-weight:600;">Email:</label>
                <input id="swal-email" class="swal2-input" value="${m.email}" style="margin:5px 0;">
                
                <label style="display:block; margin-top:10px; font-weight:600;">SĐT:</label>
                <input id="swal-phone" class="swal2-input" value="${m.phone}" style="margin:5px 0;">
                
                <label style="display:block; margin-top:10px; font-weight:600;">Chức vụ:</label>
                <select id="swal-position" class="swal2-select" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; margin:5px 0;">
                    ${posOptions}
                </select>
                
                <label style="display:block; margin-top:10px; font-weight:600;">Đội hình:</label>
                <select id="swal-team" class="swal2-select" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; margin:5px 0;">
                    ${teamOptions}
                </select>
            </div>
        `,
        width: 450,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        cancelButtonText: 'Hủy',
        preConfirm: () => {
            const position = document.getElementById('swal-position').value;
            const role = POSITION_TO_ROLE[position] || 'member';
            return {
                name: document.getElementById('swal-name').value,
                email: document.getElementById('swal-email').value,
                phone: document.getElementById('swal-phone').value,
                position: position,
                role: role,
                team_id: document.getElementById('swal-team').value
            };
        }
    });

    if (formValues) {
        try {
            const oldTeamId = m.team_id;
            const newTeamId = formValues.team_id;

            await setDoc(doc(db, 'xtn_users', userId), formValues, { merge: true });

            // Sync 2 chiều: cập nhật stats đội hình nếu đổi đội
            if (oldTeamId !== newTeamId) {
                await syncTeamStats(oldTeamId);
                await syncTeamStats(newTeamId);
            }

            await showAlert('Đã cập nhật thành công!', 'success', 'Hoàn thành');
            loadMembers();
        } catch (e) {
            await showAlert('Lỗi cập nhật!', 'error', 'Lỗi');
        }
    }
};

// Sync số thành viên của đội hình
async function syncTeamStats(teamId) {
    if (!teamId) return;

    try {
        // Đếm số thành viên thuộc đội này
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        let count = 0;
        usersSnap.forEach(d => {
            if (d.data().team_id === teamId) count++;
        });

        // Cập nhật vào xtn_teams
        await setDoc(doc(db, 'xtn_teams', teamId), {
            stats: {
                total_members: count,
                updated_at: new Date().toISOString()
            }
        }, { merge: true });

        console.log(`[Sync] Team ${teamId}: ${count} members`);
    } catch (e) {
        console.warn('[Sync] Team stats error:', e);
    }
}

window.deleteMember = async function (userId) {
    const m = membersDataCache.find(x => x.id === userId);
    const result = await Swal.fire({
        title: 'Xóa thành viên?',
        text: `Bạn có chắc muốn xóa "${m?.name || userId}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#dc2626'
    });

    if (result.isConfirmed) {
        try {
            const teamId = m?.team_id;
            await deleteDoc(doc(db, 'xtn_users', userId));

            // Sync stats đội hình sau khi xóa
            if (teamId) {
                await syncTeamStats(teamId);
            }

            await showAlert('Đã xóa!', 'success', 'Hoàn thành');
            loadMembers();
        } catch (e) {
            await showAlert('Lỗi xóa!', 'error', 'Lỗi');
        }
    }
};

window.deleteSelectedMembers = async function () {
    if (selectedMembers.size === 0) return;

    const result = await Swal.fire({
        title: `Xóa ${selectedMembers.size} thành viên?`,
        text: 'Hành động này không thể hoàn tác!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa tất cả',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#dc2626'
    });

    if (result.isConfirmed) {
        try {
            const promises = [...selectedMembers].map(id => deleteDoc(doc(db, 'xtn_users', id)));
            await Promise.all(promises);
            await showAlert(`Đã xóa ${selectedMembers.size} thành viên!`, 'success', 'Hoàn thành');
            loadMembers();
        } catch (e) {
            await showAlert('Lỗi xóa!', 'error', 'Lỗi');
        }
    }
};

// ============================================================
// TEAMS CRUD
// ============================================================
let selectedTeams = new Set();

async function loadTeams() {
    const container = document.getElementById('teams-list');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#888;">Đang tải...</p>';
    selectedTeams.clear();
    updateTeamsSelectedCount();

    try {
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        if (teamsSnap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có đội nào. Hãy thêm đội mới!</p>';
            return;
        }

        const membersSnap = await getDocs(query(collection(db, 'xtn_users'), where('role', '==', 'member')));
        const teamCounts = {};
        membersSnap.forEach(d => {
            const teamId = d.data().team_id;
            if (teamId) teamCounts[teamId] = (teamCounts[teamId] || 0) + 1;
        });

        let html = `<table class="data-table">
            <thead><tr>
                <th><input type="checkbox" id="select-all-teams" onchange="toggleAllTeams(this)"></th>
                <th>Tên đội</th><th>Đội trưởng</th><th>Đội phó</th><th>Chiến sĩ</th><th>Hành động</th>
            </tr></thead>
            <tbody>`;

        teamsSnap.forEach(d => {
            const team = d.data();
            const count = teamCounts[d.id] || 0;
            const captainName = team.captain?.name || team.captain_name || '-';
            const captainEmail = team.captain?.email || team.captain_email || '';
            const vice1Name = team.vice1?.name || team.vice_name || '-';

            html += `<tr>
                <td><input type="checkbox" class="team-checkbox" value="${d.id}" onchange="toggleTeamSelection('${d.id}')"></td>
                <td><strong>${team.team_name || ''}</strong></td>
                <td>${captainName}<br><small>${captainEmail}</small></td>
                <td>${vice1Name}</td>
                <td><span class="badge">${count}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editTeam('${d.id}')"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTeam('${d.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Load teams error:', e);
        container.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu</p>';
    }
}

async function handleTeamForm(e) {
    e.preventDefault();
    const editId = document.getElementById('team-edit-id').value;
    const teamName = document.getElementById('team-name').value.trim();
    const captainName = document.getElementById('team-captain-name').value.trim();
    const captainEmail = document.getElementById('team-captain-email').value.trim();
    const vice1Name = document.getElementById('team-vice1-name').value.trim();
    const vice1Email = document.getElementById('team-vice1-email').value.trim();

    if (!teamName) return;

    try {
        const teamId = editId || 'team_' + Date.now();
        const data = {
            team_name: teamName,
            captain: { name: captainName || null, email: captainEmail || null },
            vice1: { name: vice1Name || null, email: vice1Email || null },
            updated_at: new Date().toISOString()
        };
        if (!editId) data.created_at = new Date().toISOString();

        await setDoc(doc(db, 'xtn_teams', teamId), data, { merge: true });
        alert('✅ Đã lưu đội!');
        resetTeamForm();
        loadTeams();
        loadTeamsToRegisterForm();
    } catch (e) {
        console.error('Save team error:', e);
        alert('❌ Lỗi lưu đội!');
    }
}

window.editTeam = async function (teamId) {
    try {
        const teamDoc = await getDoc(doc(db, 'xtn_teams', teamId));
        if (!teamDoc.exists()) return;

        const team = teamDoc.data();
        document.getElementById('team-edit-id').value = teamId;
        document.getElementById('team-name').value = team.team_name || '';
        document.getElementById('team-captain-name').value = team.captain?.name || '';
        document.getElementById('team-captain-email').value = team.captain?.email || '';
        document.getElementById('team-vice1-name').value = team.vice1?.name || '';
        document.getElementById('team-vice1-email').value = team.vice1?.email || '';

        document.getElementById('team-form-title').innerHTML = '<i class="fa-solid fa-edit"></i> Sửa đội: ' + (team.team_name || teamId);
    } catch (e) {
        console.error('Edit team error:', e);
    }
};

window.resetTeamForm = function () {
    document.getElementById('team-form').reset();
    document.getElementById('team-edit-id').value = '';
    document.getElementById('team-form-title').innerHTML = '<i class="fa-solid fa-plus"></i> Thêm đội mới';
};

window.deleteTeam = async function (teamId) {
    const confirmed = await showConfirm('Xóa đội này?', 'Xác nhận xóa');
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'xtn_teams', teamId));
        loadTeams();
        loadTeamsToRegisterForm();
        await showAlert('Đã xóa đội!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Delete team error:', e);
        await showAlert('Lỗi xóa!', 'error', 'Lỗi');
    }
};

window.toggleTeamSelection = function (teamId) {
    if (selectedTeams.has(teamId)) selectedTeams.delete(teamId);
    else selectedTeams.add(teamId);
    updateTeamsSelectedCount();
};

window.toggleAllTeams = function (checkbox) {
    document.querySelectorAll('.team-checkbox').forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) selectedTeams.add(cb.value);
        else selectedTeams.delete(cb.value);
    });
    updateTeamsSelectedCount();
};

function updateTeamsSelectedCount() {
    const countEl = document.getElementById('teams-selected-count');
    const btnEl = document.getElementById('btn-delete-teams');
    if (countEl) countEl.textContent = selectedTeams.size;
    if (btnEl) btnEl.disabled = selectedTeams.size === 0;
}

window.deleteSelectedTeams = async function () {
    if (selectedTeams.size === 0) return;
    const confirmed = await showConfirm(`Xóa ${selectedTeams.size} đội?`, 'Xóa hàng loạt');
    if (!confirmed) return;

    try {
        for (const teamId of selectedTeams) await deleteDoc(doc(db, 'xtn_teams', teamId));
        selectedTeams.clear();
        loadTeams();
        loadTeamsToRegisterForm();
        await showAlert('Đã xóa!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Bulk delete error:', e);
        await showAlert('Lỗi!', 'error', 'Lỗi');
    }
};

// ============================================================
// QUESTIONS CRUD
// ============================================================
let selectedQuestions = new Set();

async function loadQuestions() {
    const container = document.getElementById('questions-list');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#888;">Đang tải...</p>';
    selectedQuestions.clear();
    loadTeamsToQuestionForm();

    try {
        const snap = await getDocs(collection(db, 'xtn_questions'));
        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có câu hỏi động nào.</p>';
            return;
        }

        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        const teamsMap = {};
        teamsSnap.forEach(d => teamsMap[d.id] = d.data().team_name || d.id);

        let html = `<table class="data-table">
            <thead><tr>
                <th><input type="checkbox" id="select-all-questions" onchange="toggleAllQuestions(this)"></th>
                <th>#</th><th>Câu hỏi</th><th>Đội</th><th>Bắt buộc</th><th>Hành động</th>
            </tr></thead>
            <tbody>`;

        snap.forEach(d => {
            const q = d.data();
            const teamName = q.team_id ? (teamsMap[q.team_id] || q.team_id) : '<em>Tất cả</em>';
            html += `<tr>
                <td><input type="checkbox" class="question-checkbox" value="${d.id}" onchange="toggleQuestionSelection('${d.id}')"></td>
                <td>${q.order || 1}</td>
                <td>${q.question || ''}</td>
                <td>${teamName}</td>
                <td>${q.required ? '✅' : '❌'}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="editQuestion('${d.id}')"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteQuestion('${d.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Load questions error:', e);
        container.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu</p>';
    }
}

async function handleQuestionForm(e) {
    e.preventDefault();
    const editId = document.getElementById('q-edit-id').value;
    const content = document.getElementById('q-content').value.trim();
    const teamId = document.getElementById('q-team').value;
    const required = document.getElementById('q-required').value === 'true';
    const order = parseInt(document.getElementById('q-order').value) || 1;

    if (!content) return;

    try {
        const data = { question: content, team_id: teamId || null, required, order, updated_at: new Date().toISOString() };
        if (editId) {
            await setDoc(doc(db, 'xtn_questions', editId), data, { merge: true });
        } else {
            data.created_at = new Date().toISOString();
            await addDoc(collection(db, 'xtn_questions'), data);
        }
        alert('✅ Đã lưu câu hỏi!');
        resetQuestionForm();
        loadQuestions();
    } catch (e) {
        console.error('Save question error:', e);
        alert('❌ Lỗi lưu!');
    }
}

window.editQuestion = async function (qId) {
    try {
        const qDoc = await getDoc(doc(db, 'xtn_questions', qId));
        if (!qDoc.exists()) return;
        const q = qDoc.data();
        document.getElementById('q-edit-id').value = qId;
        document.getElementById('q-content').value = q.question || '';
        document.getElementById('q-team').value = q.team_id || '';
        document.getElementById('q-required').value = q.required ? 'true' : 'false';
        document.getElementById('q-order').value = q.order || 1;
        document.getElementById('question-form-title').innerHTML = '<i class="fa-solid fa-edit"></i> Sửa câu hỏi';
    } catch (e) {
        console.error('Edit question error:', e);
    }
};

window.resetQuestionForm = function () {
    document.getElementById('question-form').reset();
    document.getElementById('q-edit-id').value = '';
    document.getElementById('question-form-title').innerHTML = '<i class="fa-solid fa-plus"></i> Thêm câu hỏi mới';
};

window.deleteQuestion = async function (qId) {
    if (!confirm('Xóa câu hỏi này?')) return;
    try {
        await deleteDoc(doc(db, 'xtn_questions', qId));
        loadQuestions();
    } catch (e) {
        console.error('Delete question error:', e);
        alert('❌ Lỗi xóa!');
    }
};

window.toggleQuestionSelection = function (qId) {
    if (selectedQuestions.has(qId)) selectedQuestions.delete(qId);
    else selectedQuestions.add(qId);
    updateQuestionsSelectedCount();
};

window.toggleAllQuestions = function (checkbox) {
    document.querySelectorAll('.question-checkbox').forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) selectedQuestions.add(cb.value);
        else selectedQuestions.delete(cb.value);
    });
    updateQuestionsSelectedCount();
};

function updateQuestionsSelectedCount() {
    const countEl = document.getElementById('questions-selected-count');
    const btnEl = document.getElementById('btn-delete-questions');
    if (countEl) countEl.textContent = selectedQuestions.size;
    if (btnEl) btnEl.disabled = selectedQuestions.size === 0;
}

window.deleteSelectedQuestions = async function () {
    if (selectedQuestions.size === 0) return;
    if (!confirm(`Xóa ${selectedQuestions.size} câu hỏi?`)) return;
    try {
        for (const qId of selectedQuestions) await deleteDoc(doc(db, 'xtn_questions', qId));
        selectedQuestions.clear();
        loadQuestions();
    } catch (e) {
        console.error('Bulk delete questions error:', e);
        alert('❌ Lỗi xóa hàng loạt!');
    }
};

// ============================================================
// LOAD TEAMS TO FORMS
// ============================================================
async function loadTeamsToRegisterForm() {
    const select = document.getElementById('reg-team');
    if (!select) return;

    select.innerHTML = '<option value="">-- Chọn đội hình --</option>';
    try {
        const snap = await getDocs(collection(db, 'xtn_teams'));
        snap.forEach(d => {
            const team = d.data();
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = team.team_name || d.id;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('Load teams to form error:', e);
    }
}

async function loadDynamicQuestionsToForm(selectedTeamId = null) {
    const container = document.getElementById('reg-dynamic-questions');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải câu hỏi...</p>';

    try {
        const snap = await getDocs(collection(db, 'xtn_questions'));
        container.innerHTML = '';

        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có câu hỏi nào.</p>';
            return;
        }

        const questions = [];
        snap.forEach(d => questions.push({ id: d.id, ...d.data() }));
        questions.sort((a, b) => (a.order || 1) - (b.order || 1));

        let displayedCount = 0;
        questions.forEach(q => {
            const isGeneral = !q.team_id || q.team_id === '';
            const isForSelectedTeam = q.team_id === selectedTeamId;

            if (isGeneral || isForSelectedTeam) {
                displayedCount++;
                const div = document.createElement('div');
                div.className = 'form-group';
                const badge = isGeneral ? '' : `<span style="color:#f59e0b;font-size:0.8em;"> (Riêng cho đội)</span>`;
                div.innerHTML = `
                    <label>${q.question}${badge} ${q.required ? '<span class="required">*</span>' : ''}</label>
                    <textarea id="reg-dq-${q.id}" rows="2" placeholder="Trả lời..." ${q.required ? 'required' : ''}></textarea>
                `;
                container.appendChild(div);
            }
        });

        if (displayedCount === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có câu hỏi nào phù hợp.</p>';
        }
    } catch (e) {
        console.error('Load dynamic questions error:', e);
        container.innerHTML = '<p style="color:red;">Lỗi tải câu hỏi</p>';
    }
}

async function loadTeamsToQuestionForm() {
    const select = document.getElementById('q-team');
    if (!select) return;

    select.innerHTML = '<option value="">-- Tất cả đội (Câu hỏi chung) --</option>';
    try {
        const snap = await getDocs(collection(db, 'xtn_teams'));
        snap.forEach(d => {
            const team = d.data();
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = team.team_name || d.id;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('Load teams to question form error:', e);
    }
}

// ============================================================
// [COMMENTED OUT - Production] DEV ROLE SWITCHER
// ============================================================
/*
function applyDevRole() {
    const select = document.getElementById('dev-role-switch');
    if (!select) return;

    const fakeRole = select.value;
    if (!fakeRole) {
        location.reload();
        return;
    }

    if (fakeRole === 'pending-submitted') {
        userData.role = 'pending';
        userData._hasSubmitted = true;
    } else {
        userData.role = fakeRole;
        userData._hasSubmitted = false;
    }

    console.log('🔧 DEV: Switched to role:', userData.role);
    setupMenuByRole();

    if (userData.role === 'pending') {
        showSection('section-avatar');
    } else {
        showSection('section-dashboard');
    }

    let roleLabel = '';
    switch (userData.role) {
        case 'pending': roleLabel = '🟡 Chờ duyệt'; break;
        case 'member': roleLabel = '🟢 Chiến sĩ'; break;
        case 'doihinh_admin': roleLabel = '🔵 BCH Đội'; break;
        case 'super_admin': roleLabel = '🟣 BCH Trường'; break;
    }
    document.getElementById('user-name').textContent = userData.name + ' ' + roleLabel;
}
*/

// ============================================================
// EXCEL IMPORT/EXPORT HANDLERS
// ============================================================
let pendingImportData = []; // Lưu tạm dữ liệu import
let teamsCache = {}; // Cache teams để export

async function handleExportExcel() {
    try {
        // Load members từ Firestore
        const membersSnapshot = await getDocs(collection(db, 'xtn_users'));
        const members = [];
        membersSnapshot.forEach(doc => {
            members.push({ id: doc.id, ...doc.data() });
        });

        // Load teams
        const teamsSnapshot = await getDocs(collection(db, 'xtn_teams'));
        const teams = {};
        teamsSnapshot.forEach(doc => {
            teams[doc.id] = doc.data();
        });

        // Export
        exportChienSi(members, teams);
        await showAlert('Đã xuất file Excel thành công!', 'success', 'Thành công');
    } catch (error) {
        console.error('[Excel] Export error:', error);
        await showAlert('Lỗi khi xuất Excel: ' + error.message, 'error', 'Lỗi');
    }
}

async function handleImportExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        // Read file
        const data = await importFromExcel(file);

        if (data.length === 0) {
            await showAlert('File Excel trống!', 'warning', 'Cảnh báo');
            return;
        }

        // Validate
        const result = validateImportData(data, ['Họ và tên', 'Email']);

        // Show preview
        showImportPreview(result);

    } catch (error) {
        console.error('[Excel] Import error:', error);
        await showAlert('Lỗi đọc file Excel: ' + error.message, 'error', 'Lỗi');
    }

    // Reset input
    e.target.value = '';
}

function showImportPreview(result) {
    pendingImportData = result.validData;

    let html = `
        <div class="import-summary" style="margin-bottom:20px;">
            <p><strong>Tổng số dòng:</strong> ${result.totalRows}</p>
            <p style="color:#16a34a;"><strong>Hợp lệ:</strong> ${result.validData.length}</p>
            ${result.errors.length > 0 ? `<p style="color:#dc2626;"><strong>Lỗi:</strong> ${result.errors.length}</p>` : ''}
        </div>
    `;

    if (result.errors.length > 0) {
        html += `
            <div class="import-errors" style="margin-bottom:20px; max-height:150px; overflow-y:auto; background:#fee; padding:10px; border-radius:8px;">
                <h4 style="color:#dc2626; margin-bottom:10px;">Các dòng lỗi:</h4>
                <ul style="margin:0; padding-left:20px;">
                    ${result.errors.map(e => `<li>Dòng ${e.row}: ${e.errors.join(', ')}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (result.validData.length > 0) {
        html += `
            <div class="import-preview-table" style="max-height:300px; overflow:auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Họ và tên</th>
                            <th>MSSV</th>
                            <th>Email</th>
                            <th>SĐT</th>
                            <th>Đội hình</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.validData.slice(0, 10).map(row => `
                            <tr>
                                <td>${row.name || ''}</td>
                                <td>${row.mssv || ''}</td>
                                <td>${row.email || ''}</td>
                                <td>${row.phone || ''}</td>
                                <td>${row.team_id || ''}</td>
                            </tr>
                        `).join('')}
                        ${result.validData.length > 10 ? `<tr><td colspan="5" style="text-align:center;color:#888;">... và ${result.validData.length - 10} dòng khác</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
        `;
    }

    document.getElementById('import-preview-content').innerHTML = html;
    document.getElementById('modal-import-preview').style.display = 'flex';
    document.getElementById('btn-confirm-import').disabled = result.validData.length === 0;
}

function closeImportPreview() {
    document.getElementById('modal-import-preview').style.display = 'none';
    pendingImportData = [];
}

async function confirmImport() {
    if (pendingImportData.length === 0) return;

    const confirmed = await showConfirm(
        `Bạn có chắc muốn import ${pendingImportData.length} chiến sĩ?`,
        'Xác nhận Import'
    );

    if (!confirmed) return;

    try {
        let successCount = 0;
        let errorCount = 0;

        for (const row of pendingImportData) {
            try {
                // Check if email exists
                const existing = await getDocs(
                    query(collection(db, 'xtn_users'), where('email', '==', row.email))
                );

                if (existing.empty) {
                    // Add new user
                    await addDoc(collection(db, 'xtn_users'), {
                        ...row,
                        role: 'member',
                        status: 'active',
                        created_at: serverTimestamp(),
                        imported: true
                    });
                    successCount++;
                } else {
                    console.log('[Import] Skipped (exists):', row.email);
                }
            } catch (err) {
                console.error('[Import] Error adding:', row.email, err);
                errorCount++;
            }
        }

        closeImportPreview();
        await showAlert(
            `Import hoàn tất!\n✅ Thành công: ${successCount}\n❌ Lỗi: ${errorCount}`,
            successCount > 0 ? 'success' : 'warning',
            'Kết quả Import'
        );

        // Reload members list
        loadMembers();

    } catch (error) {
        console.error('[Import] Error:', error);
        await showAlert('Lỗi import: ' + error.message, 'error', 'Lỗi');
    }
}

// ============================================================
// AI FEATURE HANDLERS
// ============================================================
let currentAIActivityData = null;
let cachedActivities = [];

function openAIActivityModal() {
    document.getElementById('modal-ai-activity').style.display = 'flex';
    document.getElementById('ai-activity-input').value = '';
    document.getElementById('ai-activity-result').style.display = 'none';
    document.getElementById('btn-ai-apply').style.display = 'none';
    currentAIActivityData = null;
}

function closeAIActivityModal() {
    document.getElementById('modal-ai-activity').style.display = 'none';
}

function openAIReportModal() {
    document.getElementById('modal-ai-report').style.display = 'flex';
    document.getElementById('ai-report-result').style.display = 'none';
}

function closeAIReportModal() {
    document.getElementById('modal-ai-report').style.display = 'none';
}

async function handleAIGenerateActivity() {
    const description = document.getElementById('ai-activity-input').value.trim();
    if (!description) {
        await showAlert('Vui lòng nhập mô tả hoạt động!', 'warning', 'Cảnh báo');
        return;
    }

    const btn = document.getElementById('btn-ai-generate');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const result = await aiCreateActivity(description);

        if (!result.success) {
            throw new Error(result.error);
        }

        currentAIActivityData = result.data;

        // Show preview
        const preview = document.getElementById('ai-activity-preview');
        preview.innerHTML = `
            <p><strong>Tên:</strong> ${result.data.name || 'N/A'}</p>
            <p><strong>Ngày:</strong> ${result.data.date || 'N/A'}</p>
            <p><strong>Thời gian:</strong> ${result.data.time || 'N/A'}</p>
            <p><strong>Địa điểm:</strong> ${result.data.location || 'N/A'}</p>
            <p><strong>Số người:</strong> ${result.data.estimatedParticipants || 'N/A'}</p>
            <p><strong>Mô tả:</strong> ${result.data.description || 'N/A'}</p>
        `;

        document.getElementById('ai-activity-result').style.display = 'block';
        document.getElementById('btn-ai-apply').style.display = 'inline-block';

    } catch (error) {
        console.error('[AI] Error:', error);
        await showAlert('Lỗi AI: ' + error.message, 'error', 'Lỗi');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function applyAIActivity() {
    if (!currentAIActivityData) return;

    // Fill form
    const data = currentAIActivityData;
    document.getElementById('act-name').value = data.name || '';
    document.getElementById('act-date').value = data.date || '';
    document.getElementById('act-participants').value = data.estimatedParticipants || '';
    document.getElementById('act-desc').value = data.description || '';

    closeAIActivityModal();
    showSection('section-add-activity');
    showAlert('Đã điền thông tin vào form!', 'success', 'Thành công');
}

async function handleAIGenerateReport() {
    const reportType = document.getElementById('ai-report-type').value;
    const dateRange = document.getElementById('ai-report-range').value;

    const btn = document.getElementById('btn-ai-generate-report');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';
    btn.disabled = true;

    try {
        // Load activities if not cached
        if (cachedActivities.length === 0) {
            const snapshot = await getDocs(collection(db, 'xtn_activities'));
            cachedActivities = [];
            snapshot.forEach(doc => {
                cachedActivities.push({ id: doc.id, ...doc.data() });
            });
        }

        // Filter by date range
        let filteredData = cachedActivities;
        const now = new Date();

        if (dateRange === 'week') {
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            filteredData = cachedActivities.filter(a => {
                const actDate = a.date?.toDate?.() || new Date(a.date);
                return actDate >= weekAgo;
            });
        } else if (dateRange === 'month') {
            const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            filteredData = cachedActivities.filter(a => {
                const actDate = a.date?.toDate?.() || new Date(a.date);
                return actDate >= monthAgo;
            });
        }

        const result = await aiGenerateReport(filteredData, { reportType, dateRange });

        if (!result.success) {
            throw new Error(result.error);
        }

        document.getElementById('ai-report-content').innerHTML = result.content;
        document.getElementById('ai-report-result').style.display = 'block';

    } catch (error) {
        console.error('[AI Report] Error:', error);
        await showAlert('Lỗi tạo báo cáo: ' + error.message, 'error', 'Lỗi');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function copyReportContent() {
    const content = document.getElementById('ai-report-content').innerText;
    navigator.clipboard.writeText(content).then(() => {
        showAlert('Đã copy nội dung!', 'success', 'Thành công');
    }).catch(err => {
        showAlert('Lỗi copy: ' + err.message, 'error', 'Lỗi');
    });
}

// ============================================================
// SETTINGS & BACKUP (Super Admin only)
// ============================================================
function initSettings() {
    document.getElementById('btn-backup-all')?.addEventListener('click', backupAll);
    document.getElementById('btn-backup-users')?.addEventListener('click', () => backupCollection('xtn_users', 'users'));
    document.getElementById('btn-backup-activities')?.addEventListener('click', () => backupCollection('xtn_activities', 'activities'));
    document.getElementById('btn-clear-activities')?.addEventListener('click', clearAllActivities);
}

async function backupAll() {
    try {
        showAlert('Đang tải dữ liệu...', 'info', 'Vui lòng chờ');

        const [usersSnap, teamsSnap, activitiesSnap, regsSnap] = await Promise.all([
            getDocs(collection(db, 'xtn_users')),
            getDocs(collection(db, 'xtn_teams')),
            getDocs(collection(db, 'xtn_activities')),
            getDocs(collection(db, 'xtn_registrations'))
        ]);

        const data = {
            exported_at: new Date().toISOString(),
            exported_by: userData.name || userData.email,
            users: [],
            teams: [],
            activities: [],
            registrations: []
        };

        usersSnap.forEach(d => data.users.push({ id: d.id, ...d.data() }));
        teamsSnap.forEach(d => data.teams.push({ id: d.id, ...d.data() }));
        activitiesSnap.forEach(d => data.activities.push({ id: d.id, ...d.data() }));
        regsSnap.forEach(d => data.registrations.push({ id: d.id, ...d.data() }));

        downloadJSON(data, `xtn_backup_${formatDateForFile(new Date())}.json`);
        showAlert(`Đã tải backup: ${data.users.length} users, ${data.teams.length} teams, ${data.activities.length} activities`, 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Backup error:', e);
        showAlert('Lỗi backup: ' + e.message, 'error', 'Lỗi');
    }
}

async function backupCollection(collectionName, label) {
    try {
        const snap = await getDocs(collection(db, collectionName));
        const data = {
            exported_at: new Date().toISOString(),
            collection: collectionName,
            items: []
        };
        snap.forEach(d => data.items.push({ id: d.id, ...d.data() }));
        downloadJSON(data, `xtn_${label}_${formatDateForFile(new Date())}.json`);
        showAlert(`Đã tải ${data.items.length} ${label}`, 'success', 'Hoàn thành');
    } catch (e) {
        showAlert('Lỗi: ' + e.message, 'error', 'Lỗi');
    }
}

function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function formatDateForFile(date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function clearAllActivities() {
    const result = await Swal.fire({
        title: 'XÓA TOÀN BỘ HOẠT ĐỘNG?',
        text: 'Hành động này KHÔNG THỂ hoàn tác! Tất cả hoạt động sẽ bị xóa vĩnh viễn.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa tất cả',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#dc2626',
        input: 'text',
        inputLabel: 'Nhập "XOA TAT CA" để xác nhận:',
        inputValidator: (value) => {
            if (value !== 'XOA TAT CA') return 'Nhập sai! Phải nhập chính xác "XOA TAT CA"';
        }
    });

    if (result.isConfirmed) {
        try {
            const snap = await getDocs(collection(db, 'xtn_activities'));
            const promises = [];
            snap.forEach(d => promises.push(deleteDoc(doc(db, 'xtn_activities', d.id))));
            await Promise.all(promises);
            showAlert(`Đã xóa ${snap.size} hoạt động`, 'success', 'Hoàn thành');
        } catch (e) {
            showAlert('Lỗi: ' + e.message, 'error', 'Lỗi');
        }
    }
}

// ============================================================
// ADD MEMBER MANUALLY FUNCTIONS
// ============================================================
async function openAddMemberModal() {
    const modal = document.getElementById('modal-add-member');
    if (!modal) return;

    // Load teams vào dropdown
    const teamSelect = document.getElementById('new-member-team');
    if (teamSelect) {
        try {
            const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
            teamSelect.innerHTML = '<option value="">-- Chọn đội hình --</option>';
            teamsSnap.forEach(docSnap => {
                const team = docSnap.data();
                const teamName = team.team_name || docSnap.id;
                teamSelect.innerHTML += `<option value="${docSnap.id}">${teamName}</option>`;
            });
        } catch (e) {
            console.error('[AddMember] Load teams error:', e);
        }
    }

    // Reset form
    document.getElementById('form-add-member')?.reset();

    // Show modal
    modal.style.display = 'flex';
}

function closeAddMemberModal() {
    const modal = document.getElementById('modal-add-member');
    if (modal) modal.style.display = 'none';
}

async function handleAddMember(e) {
    e.preventDefault();

    const name = document.getElementById('new-member-name')?.value?.trim();
    const mssv = document.getElementById('new-member-mssv')?.value?.trim();
    const email = document.getElementById('new-member-email')?.value?.trim();
    const phone = document.getElementById('new-member-phone')?.value?.trim();
    const teamId = document.getElementById('new-member-team')?.value;
    const role = document.getElementById('new-member-role')?.value || 'member';

    if (!name || !email) {
        showAlert('Vui lòng nhập đầy đủ họ tên và email!', 'warning', 'Thiếu thông tin');
        return;
    }

    try {
        // Check if email already exists
        const existingSnap = await getDocs(
            query(collection(db, 'xtn_users'), where('email', '==', email))
        );

        if (!existingSnap.empty) {
            showAlert('Email này đã tồn tại trong hệ thống!', 'warning', 'Trùng email');
            return;
        }

        // Add new member
        await addDoc(collection(db, 'xtn_users'), {
            name,
            mssv: mssv || '',
            email,
            phone: phone || '',
            team_id: teamId || '',
            role,
            status: 'active',
            created_at: serverTimestamp()
        });

        closeAddMemberModal();
        showAlert(`Đã thêm chiến sĩ "${name}" thành công!`, 'success', 'Thành công');

        // Reload members list if function exists
        if (typeof loadMembersSection === 'function') {
            loadMembersSection();
        }

    } catch (error) {
        console.error('[AddMember] Error:', error);
        showAlert('Có lỗi xảy ra: ' + error.message, 'error', 'Lỗi');
    }
}

// ============================================================
// GLOBAL FUNCTION EXPORTS
// ============================================================
window.viewRegistration = viewRegistration;
window.saveRegistration = saveRegistration;
window.closeRegistrationModal = closeRegistrationModal;
window.toggleRegSelection = toggleRegSelection;
window.toggleAllRegs = toggleAllRegs;
window.deleteSelectedRegs = deleteSelectedRegs;
window.deleteRegistration = deleteRegistration;
window.closeImportPreview = closeImportPreview;
window.closeAIActivityModal = closeAIActivityModal;
window.closeAIReportModal = closeAIReportModal;
window.closeAddMemberModal = closeAddMemberModal;
