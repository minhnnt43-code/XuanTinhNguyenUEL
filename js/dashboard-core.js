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
import './admin-teams.js'; // Import to register window functions
import { renderTeamsTable } from './admin-teams.js';
// Activity Logging
import { log as activityLog } from './activity-logger.js';
import { initActivityLogs, renderActivityLogsSection } from './dashboard-activity-logs.js';
// Media Management
import { initMediaManager, renderMediaManagerHTML } from './dashboard-media.js';

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let userData = null;

// Danh sách email được phép xem Quản lý Tài khoản và Lịch sử hoạt động
const SUPER_OWNER_EMAILS = [
    'minhlq23504b@st.uel.edu.vn',
    'mynnk25402b@st.uel.edu.vn'
];

// Danh sách Khoa/Viện UEL
const FACULTIES_LIST = [
    'Kinh tế',
    'Kinh tế đối ngoại',
    'Quản trị kinh doanh',
    'Hệ thống thông tin',
    'Tài chính - Ngân hàng',
    'Kế toán - Kiểm toán',
    'Luật',
    'Luật Kinh tế',
    'Toán Kinh tế',
    'Viện Quốc tế'
];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ dashboard-core.js loaded');

    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    // Mobile menu toggle
    setupMobileMenu();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUser = user;
        setRegCurrentUser(user);

        // ============================================================
        // DANH SÁCH SUPER ADMIN - TẢI TỪ FIRESTORE (FALLBACK HARDCODE)
        // Các vai trò trong hệ thống:
        // - super_admin    : BCH Trường (Super Admin) - Toàn quyền
        // - kysutet_admin  : Đội trưởng/Đội phó Ký sự Tết - Quyền ngang Super Admin
        // - doihinh_admin  : BCH Đội (Đội trưởng/Đội phó) - Quản lý đội hình
        // - member         : Chiến sĩ - Xem thông tin, tạo avatar/thẻ
        // - pending        : Chờ duyệt - Mới đăng ký, chưa được duyệt
        // ============================================================

        // Hardcode fallback (dùng khi không load được từ Firestore)
        const HARDCODED_SUPER_ADMINS = [
            'minhlq23504b@st.uel.edu.vn',  // Lâm Quốc Minh - Web Admin
            'hoisinhvien@uel.edu.vn',      // Email Ban Chỉ huy Chiến dịch
        ];

        // Load danh sách super admin từ Firestore (xtn_settings/super_admins)
        let SUPER_ADMIN_EMAILS = [...HARDCODED_SUPER_ADMINS];
        try {
            const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'super_admins'));
            if (settingsDoc.exists()) {
                const emails = settingsDoc.data().emails || [];
                // Merge với hardcoded (không trùng)
                SUPER_ADMIN_EMAILS = [...new Set([...HARDCODED_SUPER_ADMINS, ...emails])];
                console.log('🔐 [Auth] Loaded super admin list from Firestore:', SUPER_ADMIN_EMAILS.length, 'emails');
            }
        } catch (e) {
            console.warn('🔐 [Auth] Could not load super admin list from Firestore, using hardcoded:', e);
        }

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
                    const oldDocId = emailQuery.docs[0].id;
                    const existingData = emailQuery.docs[0].data();
                    console.log('🔐 [Auth] Found user by email (doc ID:', oldDocId, '), role:', existingData.role);

                    // Tạo document MỚI theo UID với data đã có
                    await setDoc(doc(db, "xtn_users", user.uid), {
                        ...existingData,
                        name: user.displayName || existingData.name || user.email.split('@')[0],
                        last_login: new Date().toISOString()
                    });

                    // XÓA document cũ (theo email/auto-id) để tránh trùng lặp
                    if (oldDocId !== user.uid) {
                        await deleteDoc(doc(db, 'xtn_users', oldDocId));
                        console.log('🗑️ [Auth] Deleted old duplicate doc:', oldDocId);
                    }

                    userData = existingData;
                    console.log('✅ Migrated user to UID-based doc:', user.uid);
                } else {
                    // Không tìm thấy - tạo mới với role pending
                    userData = { role: 'pending', name: user.displayName || user.email.split('@')[0] };
                    console.log('🔐 [Auth] New user, role: pending');
                }
            } else {
                userData = userDoc.data();
            }

            // Check và auto-upgrade Super Admin
            const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email);
            console.log('🔐 [Auth] Email:', user.email, '| Current role:', userData.role, '| Should be super_admin:', shouldBeSuperAdmin);

            if (shouldBeSuperAdmin && userData.role !== 'super_admin') {
                console.log('🔐 [Auth] Upgrading to super_admin...');
                await setDoc(doc(db, "xtn_users", user.uid), { role: 'super_admin' }, { merge: true });
                userData.role = 'super_admin';
                console.log('✅ Auto-upgraded to super_admin:', user.email);
            } else if (!shouldBeSuperAdmin && userData.role === 'super_admin') {
                // HẠ CẤP: User có role super_admin nhưng không nằm trong danh sách
                console.log('🔐 [Auth] Downgrading from super_admin to member...');
                await setDoc(doc(db, "xtn_users", user.uid), { role: 'member' }, { merge: true });
                userData.role = 'member';
                console.log('⚠️ Auto-downgraded to member:', user.email);
            }
        } catch (e) {
            console.error('Error loading user data:', e);
            userData = { role: 'pending', name: user.displayName || user.email.split('@')[0] };
        }

        // Pass helpers to modules
        setAvatarShowAlert(showAlert);
        setRegHelpers(showAlert, showConfirm);
        // Add uid and email to userData for card module
        setCardUserData({ ...userData, uid: user.uid, email: user.email, photoURL: user.photoURL });
        setCardsAdminHelpers(showAlert, showConfirm);

        // Hiện tên user
        const displayName = userData.name || user.displayName || user.email.split('@')[0];
        document.getElementById('user-name').textContent = displayName;

        // Hiện chức vụ (position)
        const positionEl = document.getElementById('user-position');
        if (positionEl) {
            // Hiển thị chức danh cụ thể (position) thay vì role
            // Position: Chỉ huy Trưởng, Chỉ huy Phó Thường trực, Chỉ huy Phó, 
            //           Thành viên Ban Chỉ huy, Đội trưởng, Đội phó, Chiến sĩ
            const displayPosition = userData.position ||
                (userData.role === 'pending' ? 'Sinh viên' : 'Chiến sĩ');
            positionEl.textContent = displayPosition;

            // Map position to CSS class cho màu badge
            const positionClassMap = {
                'Chỉ huy Trưởng': 'pos-commander',
                'Chỉ huy Phó Thường trực': 'pos-vice-standing',
                'Chỉ huy Phó': 'pos-vice',
                'Thành viên Thường trực Ban Chỉ huy': 'pos-standing-member',
                'Thành viên Ban Chỉ huy': 'pos-member-bch',
                'Đội trưởng': 'pos-team-leader',
                'Đội phó': 'pos-team-vice',
                'Chiến sĩ': 'pos-soldier',
                'Sinh viên': 'pos-student'
            };
            const posClass = positionClassMap[displayPosition] || 'pos-student';
            positionEl.className = 'user-role-badge ' + posClass;
        }

        // Hiện đội hình (team)
        const teamEl = document.getElementById('user-team');
        if (teamEl && userData.team_id) {
            // Lấy team_name từ xtn_teams nếu có
            try {
                const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
                let teamName = '';
                teamsSnap.forEach(docSnap => {
                    if (docSnap.id === userData.team_id || docSnap.data().team_id === userData.team_id) {
                        teamName = docSnap.data().team_name || userData.team_id;
                    }
                });
                teamEl.textContent = teamName || userData.team_id || '';
            } catch (e) {
                teamEl.textContent = userData.team_id || '';
            }
        } else if (teamEl) {
            teamEl.textContent = '';
        }

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

        // Init AI Dashboard (cho tất cả roles trừ pending)
        if (userData.role && userData.role !== 'pending') {
            initAIDashboard();
        }

        // Log login activity
        activityLog.login();

        // Check if user needs to confirm profile info (first time)
        checkProfileOnFirstLogin();
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        activityLog.logout();
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

// ============================================================
// MOBILE MENU TOGGLE
// ============================================================
function setupMobileMenu() {
    const toggle = document.getElementById('mobile-menu-toggle');
    const dropdown = document.getElementById('mobile-dropdown-menu');
    const overlay = document.getElementById('sidebar-overlay');

    console.log('[Mobile] Setup (dropdown):', { toggle: !!toggle, dropdown: !!dropdown, overlay: !!overlay });

    if (!toggle || !dropdown || !overlay) {
        console.warn('[Mobile] Missing elements, retrying in 500ms...');
        setTimeout(setupMobileMenu, 500);
        return;
    }

    // Toggle dropdown menu
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[Mobile] Toggle clicked!');

        dropdown.classList.toggle('active');
        overlay.classList.toggle('active');

        // Change icon
        const icon = toggle.querySelector('i');
        if (dropdown.classList.contains('active')) {
            icon.className = 'fa-solid fa-times';
        } else {
            icon.className = 'fa-solid fa-bars';
        }
    });

    // Close when clicking overlay
    overlay.addEventListener('click', () => {
        dropdown.classList.remove('active');
        overlay.classList.remove('active');
        toggle.querySelector('i').className = 'fa-solid fa-bars';
    });

    // Handle dropdown menu item clicks
    dropdown.querySelectorAll('.menu-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = item.getAttribute('data-section');
            if (sectionId) {
                // Close menu
                dropdown.classList.remove('active');
                overlay.classList.remove('active');
                toggle.querySelector('i').className = 'fa-solid fa-bars';

                // Show section
                document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                document.getElementById(sectionId)?.classList.add('active');
            }
        });
    });

    // Mobile logout
    document.getElementById('mobile-logout')?.addEventListener('click', async () => {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
        const { auth } = await import('./firebase.js');
        await signOut(auth);
        window.location.href = 'login.html';
    });

    console.log('[Mobile] Dropdown menu setup complete!');
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
    const email = userData.email || '';

    // Xóa các admin class
    document.body.classList.remove('is-super-admin', 'is-doihinh-admin');

    // Hide all role-specific menus first
    document.getElementById('menu-dashboard')?.classList.add('hidden');
    document.getElementById('menu-tools')?.classList.add('hidden');
    document.getElementById('menu-activity')?.classList.add('hidden');
    document.getElementById('menu-system')?.classList.add('hidden');
    document.getElementById('menu-register')?.classList.add('hidden');

    // Hide super-admin-only items by default
    document.querySelectorAll('.super-admin-only').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.kysutet-team-only').forEach(el => el.classList.add('hidden'));

    // Hide owner-only items (Quản lý Tài khoản, Lịch sử hoạt động) by default
    document.querySelectorAll('.owner-only').forEach(el => el.classList.add('hidden'));

    // Check if user is in Ký sự Tết team (check multiple possible values)
    const teamId = (userData.team_id || '').toLowerCase();
    const isKySuTetTeam = teamId.includes('ky-su-tet') || teamId.includes('kysutet') || teamId.includes('ky_su_tet') || teamId === 'kst';
    console.log('[Menu] team_id:', userData.team_id, '| isKySuTetTeam:', isKySuTetTeam);

    // Check if user is super owner (can see accounts + activity logs)
    const isSuperOwner = SUPER_OWNER_EMAILS.includes(email);

    if (role === 'pending') {
        document.getElementById('menu-register')?.classList.remove('hidden');
    } else if (role === 'member') {
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        // Show media manager for Ký sự Tết members
        if (isKySuTetTeam) {
            document.querySelectorAll('.kysutet-team-only').forEach(el => el.classList.remove('hidden'));
        }
    } else if (role === 'doihinh_admin') {
        document.body.classList.add('is-doihinh-admin'); // CHỈ thấy activity
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        document.getElementById('menu-activity')?.classList.remove('hidden');
        // Show media manager for Ký sự Tết team leaders
        if (isKySuTetTeam) {
            document.querySelectorAll('.kysutet-team-only').forEach(el => el.classList.remove('hidden'));
        }
    } else if (role === 'super_admin' || role === 'kysutet_admin') {
        document.body.classList.add('is-super-admin'); // Thấy TẤT CẢ
        // kysutet_admin có quyền ngang super_admin
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        document.getElementById('menu-activity')?.classList.remove('hidden');
        document.getElementById('menu-system')?.classList.remove('hidden');
        // Show super-admin-only items (e.g., Activity Logs)
        document.querySelectorAll('.super-admin-only').forEach(el => el.classList.remove('hidden'));
        // Show kysutet-team-only items (e.g., Media Manager)
        document.querySelectorAll('.kysutet-team-only').forEach(el => el.classList.remove('hidden'));
    }

    // Owner-only items: chỉ hiện cho 2 email đặc biệt
    if (isSuperOwner) {
        document.querySelectorAll('.owner-only').forEach(el => el.classList.remove('hidden'));
    }
}

function setActiveMenuItem(item) {
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');

    // Save to localStorage for persistence
    try {
        localStorage.setItem('xtn_last_section', sectionId);
    } catch (e) {
        console.warn('Cannot save section to localStorage');
    }

    // Log section view
    activityLog.view(sectionId);

    // Load data for specific sections
    if (sectionId === 'section-dashboard') loadDashboardStats();
    if (sectionId === 'section-avatar') initAvatarCanvas();
    if (sectionId === 'section-card') initCardCanvas();
    if (sectionId === 'section-registrations') loadRegistrations();
    if (sectionId === 'section-members') loadMembers();
    if (sectionId === 'section-accounts') loadAccounts();
    if (sectionId === 'section-activities') loadActivities();
    if (sectionId === 'section-activity') initActivityModule();
    if (sectionId === 'section-teams') loadTeams();
    if (sectionId === 'section-questions') loadQuestions();
    if (sectionId === 'section-cards-admin') initCardsAdmin();
    if (sectionId === 'section-profile') loadProfileSection();
    if (sectionId === 'section-settings') initSettings();
    if (sectionId === 'section-activity-logs') {
        // Render section HTML and init
        const section = document.getElementById('section-activity-logs');
        if (section && !section.hasAttribute('data-initialized')) {
            section.innerHTML = renderActivityLogsSection();
            section.setAttribute('data-initialized', 'true');
        }
        initActivityLogs();
    }
    if (sectionId === 'section-media-manager') {
        // Render section HTML and init
        const section = document.getElementById('section-media-manager');
        if (section && !section.hasAttribute('data-initialized')) {
            section.innerHTML = renderMediaManagerHTML();
            section.setAttribute('data-initialized', 'true');
        }
        initMediaManager();
    }
}

function hideSection(sectionId) {
    document.getElementById(sectionId)?.classList.remove('active');
}

async function loadTeams() {
    try {
        const list = document.getElementById('teams-list');
        if (list) {
            list.innerHTML = '<p style="text-align:center;color:#888;">Đang tải dữ liệu đội hình...</p>';
            list.innerHTML = await renderTeamsTable();
        }
    } catch (e) {
        console.error('Load teams error:', e);
    }
}

async function showDefaultSection() {
    const role = userData.role || 'pending';
    console.log('� showDefaultSection, role:', role);

    // Check localStorage for last section
    try {
        const lastSection = localStorage.getItem('xtn_last_section');
        if (lastSection && document.getElementById(lastSection)) {
            // Validate user has access to this section based on role
            const adminSections = ['section-dashboard', 'section-members', 'section-accounts', 'section-teams', 'section-registrations', 'section-questions', 'section-settings', 'section-cards-admin', 'section-activity-logs', 'section-media-manager'];
            const isAdminSection = adminSections.includes(lastSection);
            const isAdmin = role === 'super_admin' || role === 'kysutet_admin';
            const isDoihinhAdmin = role === 'doihinh_admin';

            // If it's an admin section, check permission
            if (isAdminSection && !isAdmin) {
                // Don't allow non-admins to access admin sections
            } else if (lastSection === 'section-activity' && !isAdmin && !isDoihinhAdmin) {
                // Activity section needs at least doihinh_admin
            } else {
                console.log('🟢 Restoring last section:', lastSection);
                showSection(lastSection);
                return;
            }
        }
    } catch (e) {
        console.warn('Cannot read localStorage');
    }

    // Fallback to role-based defaults
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
        const [membersSnap, teamsSnap, activitiesSnap] = await Promise.all([
            getDocs(collection(db, 'xtn_users')),  // Load ALL users
            getDocs(collection(db, 'xtn_teams')),
            getDocs(collection(db, 'xtn_activities'))  // Load activities
        ]);

        const statMembers = document.getElementById('stat-members');
        const statTeams = document.getElementById('stat-teams');
        const statActivities = document.getElementById('stat-activities');

        if (statMembers) statMembers.textContent = membersSnap.size;
        if (statTeams) statTeams.textContent = teamsSnap.size;
        if (statActivities) statActivities.textContent = activitiesSnap.size;
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

function getFacultyColor(faculty) {
    const colors = {
        'Kinh tế': '#0891b2',              // Cyan
        'Kinh tế đối ngoại': '#0d9488',   // Teal
        'Quản trị kinh doanh': '#7c3aed', // Purple
        'Hệ thống thông tin': '#2563eb',   // Blue
        'Tài chính - Ngân hàng': '#059669', // Emerald
        'Kế toán - Kiểm toán': '#ca8a04',  // Yellow
        'Luật': '#dc2626',                  // Red
        'Luật Kinh tế': '#e11d48',         // Rose
        'Toán Kinh tế': '#9333ea',          // Violet
        'Viện Quốc tế': '#ea580c'          // Orange
    };
    return colors[faculty] || '#6b7280'; // Default gray
}

async function loadMembers() {
    const list = document.getElementById('members-list');
    if (!list) return;

    list.innerHTML = '<p style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';
    selectedMembers.clear();
    membersDataCache = [];
    membersDataCache.length = 0; // Đảm bảo clear hoàn toàn

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

        // Cache data - kiểm tra duplicate trước khi push
        snap.forEach(d => {
            // Skip nếu đã có trong cache (tránh trùng lặp)
            if (membersDataCache.some(m => m.id === d.id)) return;

            const u = d.data();
            const reg = regsMap[d.id] || {};
            membersDataCache.push({
                id: d.id,
                name: u.name || '',
                mssv: u.mssv || reg.student_id || '',
                email: u.email || '',
                phone: u.phone || reg.phone || '',
                faculty: u.faculty || reg.faculty || '',
                position: u.position || 'Chiến sĩ',
                role: u.role || 'member',
                team_id: u.team_id || reg.preferred_team || ''
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
                <button class="btn btn-warning btn-sm" onclick="filterDuplicateMembers()" title="Tìm và xóa các bản ghi trùng lặp (cùng email hoặc MSSV)">
                    <i class="fa-solid fa-filter-circle-xmark"></i> Lọc trùng
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
                        <th>MSSV</th>
                        <th>Chức vụ</th>
                        <th>Khoa/Viện</th>
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
                    <td style="font-size:13px; color:#0369a1;">${m.mssv || '-'}</td>
                    <td>
                        <span class="badge" style="background:${posColor}; color:white; padding:4px 10px; border-radius:12px; font-size:12px; white-space:nowrap;">
                            ${m.position}
                        </span>
                    </td>
                    <td style="font-size:13px; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${m.faculty || ''}">
                        ${m.faculty ? `<span class="badge" style="background:${getFacultyColor(m.faculty)}; color:white; padding:4px 10px; border-radius:12px; font-size:11px; white-space:nowrap;">${m.faculty}</span>` : '<span style="color:#9ca3af;">-</span>'}
                    </td>
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
        html += `<p id="members-count-display" style="margin-top:10px; color:#666; font-size:13px;">Tổng: <strong id="visible-members-count">${membersDataCache.length}</strong> Chiến sĩ</p>`;
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

    let visibleCount = 0;
    document.querySelectorAll('#members-tbody tr').forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const team = row.dataset.team || '';

        const matchesSearch = name.includes(query) || email.includes(query);
        const matchesTeam = !teamFilter || team === teamFilter;

        const isVisible = matchesSearch && matchesTeam;
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    });

    // Update count display
    const countEl = document.getElementById('visible-members-count');
    if (countEl) countEl.textContent = visibleCount;
};

window.filterMembersByTeam = function () {
    filterMembers(); // Reuse existing filter logic
};

// Lọc và xóa các bản ghi trùng lặp (cùng email hoặc MSSV)
window.filterDuplicateMembers = async function () {
    const emailMap = {};
    const mssvMap = {};
    const duplicates = [];

    // Tìm duplicates
    membersDataCache.forEach(m => {
        // Check email duplicate
        if (m.email && m.email.trim()) {
            const emailKey = m.email.toLowerCase().trim();
            if (emailMap[emailKey]) {
                duplicates.push({ id: m.id, reason: 'email', value: m.email, name: m.name });
            } else {
                emailMap[emailKey] = m.id;
            }
        }

        // Check MSSV duplicate
        if (m.mssv && m.mssv.trim()) {
            const mssvKey = m.mssv.toUpperCase().trim();
            if (mssvMap[mssvKey]) {
                duplicates.push({ id: m.id, reason: 'mssv', value: m.mssv, name: m.name });
            } else {
                mssvMap[mssvKey] = m.id;
            }
        }
    });

    if (duplicates.length === 0) {
        await showAlert('Không tìm thấy bản ghi trùng lặp!', 'success', 'Hoàn thành');
        return;
    }

    // Hiển thị danh sách trùng
    const listHtml = duplicates.map(d =>
        `• <strong>${d.name}</strong> (${d.reason}: ${d.value})`
    ).join('<br>');

    const confirmed = await Swal.fire({
        title: `<i class="fa-solid fa-exclamation-triangle" style="color:#f59e0b;"></i> Tìm thấy ${duplicates.length} bản ghi trùng`,
        html: `
            <p style="margin-bottom:15px; color:#6b7280;">Các bản ghi sau bị trùng email/MSSV sẽ bị xóa:</p>
            <div style="text-align:left; max-height:200px; overflow-y:auto; background:#fef3c7; padding:15px; border-radius:8px; font-size:13px;">
                ${listHtml}
            </div>
            <p style="margin-top:15px; color:#dc2626; font-weight:600;">⚠️ Thao tác này không thể hoàn tác!</p>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-trash"></i> Xóa tất cả trùng',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#dc2626',
        width: 500
    });

    if (!confirmed.isConfirmed) return;

    // Xóa từng bản ghi trùng
    let deletedCount = 0;
    for (const dup of duplicates) {
        try {
            await deleteDoc(doc(db, 'xtn_users', dup.id));
            deletedCount++;
        } catch (e) {
            console.error('Delete duplicate error:', e);
        }
    }

    await showAlert(`Đã xóa ${deletedCount}/${duplicates.length} bản ghi trùng!`, 'success', 'Hoàn thành');

    // Reload danh sách
    loadMembers();
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
        title: '<i class="fa-solid fa-user-pen" style="color:#16a34a;"></i> Sửa thông tin Chiến sĩ',
        html: `
            <style>
                .edit-member-form {
                    text-align: left;
                    max-height: 500px;
                    overflow-y: auto;
                    padding: 10px 0;
                }
                .edit-member-form .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-bottom: 15px;
                }
                .edit-member-form .form-group {
                    margin-bottom: 12px;
                }
                .edit-member-form label {
                    display: block;
                    font-weight: 600;
                    font-size: 13px;
                    color: #374151;
                    margin-bottom: 6px;
                }
                .edit-member-form input, .edit-member-form select {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .edit-member-form input:focus, .edit-member-form select:focus {
                    outline: none;
                    border-color: #16a34a;
                    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
                }
                .edit-member-form .section-title {
                    font-size: 12px;
                    font-weight: 700;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin: 20px 0 10px 0;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #e5e7eb;
                }
            </style>
            <div class="edit-member-form">
                <div class="section-title"><i class="fa-solid fa-id-card"></i> Thông tin cơ bản</div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Họ và tên</label>
                        <input id="swal-name" value="${m.name || ''}" placeholder="Nguyễn Văn A">
                    </div>
                    <div class="form-group">
                        <label>MSSV</label>
                        <input id="swal-mssv" value="${m.mssv || ''}" placeholder="K224141000">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Email</label>
                        <input id="swal-email" value="${m.email || ''}" placeholder="email@st.uel.edu.vn">
                    </div>
                    <div class="form-group">
                        <label>Số điện thoại</label>
                        <input id="swal-phone" value="${m.phone || ''}" placeholder="0912345678">
                    </div>
                </div>
                <div class="form-group">
                    <label>Khoa/Viện</label>
                    <select id="swal-faculty">
                        <option value="">-- Chọn Khoa/Viện --</option>
                        ${FACULTIES_LIST.map(f => `<option value="${f}" ${m.faculty === f ? 'selected' : ''}>${f}</option>`).join('')}
                    </select>
                </div>
                
                <div class="section-title"><i class="fa-solid fa-sitemap"></i> Phân công</div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Chức vụ</label>
                        <select id="swal-position">
                            ${posOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Đội hình</label>
                        <select id="swal-team">
                            ${teamOptions}
                        </select>
                    </div>
                </div>
            </div>
        `,
        width: 550,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-check"></i> Lưu thay đổi',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#16a34a',
        preConfirm: () => {
            const position = document.getElementById('swal-position').value;
            const role = POSITION_TO_ROLE[position] || 'member';
            return {
                name: document.getElementById('swal-name').value.trim(),
                mssv: document.getElementById('swal-mssv').value.trim(),
                email: document.getElementById('swal-email').value.trim(),
                phone: document.getElementById('swal-phone').value.trim(),
                faculty: document.getElementById('swal-faculty').value.trim(),
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
            const memberEmail = m?.email;

            // Xóa document chính
            await deleteDoc(doc(db, 'xtn_users', userId));

            // Xóa tất cả documents có cùng email (đề phòng trùng lặp giữa UID và emailDocId)
            if (memberEmail) {
                try {
                    const emailQuery = await getDocs(
                        query(collection(db, 'xtn_users'), where('email', '==', memberEmail))
                    );
                    for (const docSnap of emailQuery.docs) {
                        if (docSnap.id !== userId) {
                            console.log(`[DeleteMember] Xóa document trùng email: ${docSnap.id}`);
                            await deleteDoc(doc(db, 'xtn_users', docSnap.id));
                        }
                    }
                } catch (e) {
                    console.warn('[DeleteMember] Error cleaning duplicate emails:', e);
                }
            }

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
            // Thu thập email của các member được chọn
            const emailsToClean = new Set();
            [...selectedMembers].forEach(id => {
                const m = membersDataCache.find(x => x.id === id);
                if (m?.email) emailsToClean.add(m.email);
            });

            // Xóa các document chính
            const promises = [...selectedMembers].map(id => deleteDoc(doc(db, 'xtn_users', id)));
            await Promise.all(promises);

            // Xóa sạch các documents trùng email (đề phòng UID và emailDocId)
            for (const email of emailsToClean) {
                try {
                    const emailQuery = await getDocs(
                        query(collection(db, 'xtn_users'), where('email', '==', email))
                    );
                    for (const docSnap of emailQuery.docs) {
                        console.log(`[BulkDelete] Xóa document trùng email: ${docSnap.id}`);
                        await deleteDoc(doc(db, 'xtn_users', docSnap.id));
                    }
                } catch (e) {
                    console.warn(`[BulkDelete] Error cleaning email ${email}:`, e);
                }
            }

            await showAlert(`Đã xóa ${selectedMembers.size} thành viên!`, 'success', 'Hoàn thành');
            loadMembers();
        } catch (e) {
            await showAlert('Lỗi xóa!', 'error', 'Lỗi');
        }
    }
};

// ============================================================
// TEAMS CRUD - MOVED TO admin-teams.js
// ============================================================
// Code has been migrated to admin-teams.js module


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
        showToast('Đã lưu câu hỏi!', 'success');
        resetQuestionForm();
        loadQuestions();
    } catch (e) {
        console.error('Save question error:', e);
        showToast('Lỗi lưu!', 'error');
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
    const confirmed = await showConfirmModal('Xóa câu hỏi này?', { title: 'Xóa câu hỏi', type: 'danger', confirmText: 'Xóa' });
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'xtn_questions', qId));
        loadQuestions();
    } catch (e) {
        console.error('Delete question error:', e);
        showToast('Lỗi xóa!', 'error');
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
    const confirmed = await showConfirmModal(`Xóa ${selectedQuestions.size} câu hỏi?`, { title: 'Xóa nhiều câu hỏi', type: 'danger', confirmText: 'Xóa tất cả' });
    if (!confirmed) return;
    try {
        for (const qId of selectedQuestions) await deleteDoc(doc(db, 'xtn_questions', qId));
        selectedQuestions.clear();
        loadQuestions();
    } catch (e) {
        console.error('Bulk delete questions error:', e);
        showToast('Lỗi xóa hàng loạt!', 'error');
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
                    // Add new user với email làm document ID (để login có thể migrate)
                    // Dùng email làm ID vì chưa biết UID cho đến khi user login
                    const emailDocId = row.email.replace(/[.#$[\]]/g, '_');
                    await setDoc(doc(db, 'xtn_users', emailDocId), {
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
// BACKUP FUNCTIONS (Super Admin only)
// ============================================================

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
            // Hỏi admin có muốn ghi đè không
            const confirmOverwrite = await Swal.fire({
                title: '<i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;margin-right:8px;"></i> Email đã tồn tại',
                html: `
                    <div style="text-align:left; padding:15px 0;">
                        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding:15px; border-radius:12px; margin-bottom:15px; border-left:4px solid #f59e0b;">
                            <p style="margin:0; color:#92400e; font-size:14px;">
                                <i class="fa-solid fa-envelope" style="margin-right:8px;"></i>
                                <strong>${email}</strong>
                            </p>
                        </div>
                        <p style="color:#4b5563; margin:0; font-size:14px; line-height:1.6;">
                            Email này đã có trong hệ thống. Bạn có muốn <strong style="color:#dc2626;">xóa record cũ</strong> và thêm chiến sĩ mới không?
                        </p>
                    </div>
                `,
                icon: null,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-rotate"></i> Thay thế',
                cancelButtonText: '<i class="fa-solid fa-xmark"></i> Hủy',
                confirmButtonColor: '#16a34a',
                cancelButtonColor: '#6b7280',
                customClass: {
                    popup: 'swal-email-exists',
                    title: 'swal-title-left',
                    htmlContainer: 'swal-html-container'
                }
            });

            if (!confirmOverwrite.isConfirmed) {
                return;
            }

            // Xóa tất cả documents có email này
            console.log('[AddMember] Đang xóa documents cũ với email:', email);
            for (const docSnap of existingSnap.docs) {
                await deleteDoc(doc(db, 'xtn_users', docSnap.id));
                console.log('[AddMember] Đã xóa document:', docSnap.id);
            }
        }

        // Add new member với email làm document ID (khi user login, UID doc sẽ merge từ đây)
        const emailDocId = email.replace(/[.#$[\]]/g, '_');
        await setDoc(doc(db, 'xtn_users', emailDocId), {
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

        // Reload members list
        loadMembers();

    } catch (error) {
        console.error('[AddMember] Error:', error);
        showAlert('Có lỗi xảy ra: ' + error.message, 'error', 'Lỗi');
    }
}

// ============================================================
// SETTINGS MANAGEMENT - SUPER ADMIN & DOMAIN WHITELIST
// ============================================================
let settingsInitialized = false;

async function initSettings() {
    if (settingsInitialized) {
        console.log('[Settings] Already initialized, refreshing...');
    }

    console.log('[Settings] Initializing settings section...');

    // Load & render Super Admin list
    await loadAndRenderSuperAdmins();

    // Load & render Allowed Domains list
    await loadAndRenderAllowedDomains();

    // Load AI status (for owner-only toggle)
    loadAIStatus();

    // Setup event listeners
    document.getElementById('btn-add-super-admin')?.addEventListener('click', addSuperAdminEmail);
    document.getElementById('btn-add-domain')?.addEventListener('click', addAllowedDomain);

    // Enter key support
    document.getElementById('new-super-admin-email')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addSuperAdminEmail();
    });
    document.getElementById('new-email-domain')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addAllowedDomain();
    });

    // Backup buttons (from section-backup)
    document.getElementById('btn-backup-all')?.addEventListener('click', backupAll);
    document.getElementById('btn-backup-users')?.addEventListener('click', () => backupCollection('xtn_users', 'users'));
    document.getElementById('btn-backup-activities')?.addEventListener('click', () => backupCollection('xtn_activities', 'activities'));
    document.getElementById('btn-clear-activities')?.addEventListener('click', clearAllActivities);

    settingsInitialized = true;
    console.log('[Settings] Initialized successfully');
}

// ===== SUPER ADMIN MANAGEMENT =====
async function loadAndRenderSuperAdmins() {
    const container = document.getElementById('super-admin-list');
    if (!container) return;

    container.innerHTML = '<p style="color:#888; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'super_admins'));
        const emails = settingsDoc.exists() ? (settingsDoc.data().emails || []) : [];

        // Hardcoded emails (always shown but not deletable)
        const hardcodedEmails = [
            'minhlq23504b@st.uel.edu.vn',
            'hoisinhvien@uel.edu.vn'
        ];

        if (emails.length === 0 && hardcodedEmails.length === 0) {
            container.innerHTML = '<p style="color:#888; text-align:center;">Chưa có Super Admin nào được thêm.</p>';
            return;
        }

        container.innerHTML = '';

        // Render hardcoded emails (not deletable)
        hardcodedEmails.forEach(email => {
            container.innerHTML += `
                <div style="display:flex; align-items:center; gap:10px; padding:12px 15px; background:#f1f5f9; border-radius:8px; border-left:4px solid #dc2626;">
                    <i class="fa-solid fa-user-shield" style="color:#dc2626;"></i>
                    <span style="flex:1;">${email}</span>
                    <span style="font-size:12px; color:#888; background:#e2e8f0; padding:2px 8px; border-radius:4px;">Mặc định</span>
                </div>
            `;
        });

        // Render dynamic emails (deletable)
        emails.forEach(email => {
            // Skip if already in hardcoded
            if (hardcodedEmails.includes(email)) return;

            container.innerHTML += `
                <div style="display:flex; align-items:center; gap:10px; padding:12px 15px; background:#fef2f2; border-radius:8px; border-left:4px solid #f87171;">
                    <i class="fa-solid fa-user-shield" style="color:#f87171;"></i>
                    <span style="flex:1;">${email}</span>
                    <button class="btn btn-sm btn-danger" onclick="removeSuperAdminEmail('${email}')" style="padding:5px 10px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
    } catch (error) {
        console.error('[Settings] Load super admins error:', error);
        container.innerHTML = '<p style="color:#dc2626;">❌ Lỗi tải danh sách: ' + error.message + '</p>';
    }
}

async function addSuperAdminEmail() {
    const input = document.getElementById('new-super-admin-email');
    const email = input?.value?.trim();

    if (!email) {
        showAlert('Vui lòng nhập email!', 'warning', 'Thiếu thông tin');
        return;
    }

    if (!email.includes('@')) {
        showAlert('Email không hợp lệ!', 'warning', 'Lỗi định dạng');
        return;
    }

    try {
        // Get current list
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'super_admins'));
        const emails = settingsDoc.exists() ? (settingsDoc.data().emails || []) : [];

        // Check if already exists
        if (emails.includes(email)) {
            showAlert('Email đã có trong danh sách!', 'warning', 'Trùng lặp');
            return;
        }

        // Add email
        emails.push(email);
        await setDoc(doc(db, 'xtn_settings', 'super_admins'), { emails }, { merge: true });

        input.value = '';
        await loadAndRenderSuperAdmins();
        showAlert(`Đã thêm ${email} vào Super Admin!`, 'success', 'Thành công');
    } catch (error) {
        console.error('[Settings] Add super admin error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
}

window.removeSuperAdminEmail = async function (email) {
    const confirmed = await showConfirm(`Xóa "${email}" khỏi Super Admin?`, 'Xác nhận xóa');
    if (!confirmed) return;

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'super_admins'));
        const emails = settingsDoc.exists() ? (settingsDoc.data().emails || []) : [];

        const newEmails = emails.filter(e => e !== email);
        await setDoc(doc(db, 'xtn_settings', 'super_admins'), { emails: newEmails }, { merge: true });

        await loadAndRenderSuperAdmins();
        showAlert(`Đã xóa ${email} khỏi Super Admin!`, 'success', 'Thành công');
    } catch (error) {
        console.error('[Settings] Remove super admin error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
};

// ===== DOMAIN WHITELIST MANAGEMENT =====
async function loadAndRenderAllowedDomains() {
    const container = document.getElementById('allowed-domains-list');
    if (!container) return;

    container.innerHTML = '<p style="color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'allowed_domains'));
        const domains = settingsDoc.exists() ? (settingsDoc.data().domains || []) : [];

        if (domains.length === 0) {
            container.innerHTML = '<p style="color:#888;">Chưa có domain nào (cho phép tất cả email).</p>';
            return;
        }

        container.innerHTML = '';
        domains.forEach(domain => {
            container.innerHTML += `
                <div style="display:flex; align-items:center; gap:8px; padding:8px 15px; background:#dcfce7; border-radius:20px; font-size:14px;">
                    <i class="fa-solid fa-at" style="color:#22c55e;"></i>
                    <span>${domain}</span>
                    <button onclick="removeAllowedDomain('${domain}')" 
                            style="background:none; border:none; color:#ef4444; cursor:pointer; padding:2px;">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `;
        });
    } catch (error) {
        console.error('[Settings] Load allowed domains error:', error);
        container.innerHTML = '<p style="color:#dc2626;">❌ Lỗi tải danh sách: ' + error.message + '</p>';
    }
}

async function addAllowedDomain() {
    const input = document.getElementById('new-email-domain');
    let domain = input?.value?.trim();

    if (!domain) {
        showAlert('Vui lòng nhập domain!', 'warning', 'Thiếu thông tin');
        return;
    }

    // Normalize domain (remove @ if present at start)
    if (domain.startsWith('@')) domain = domain.slice(1);

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'allowed_domains'));
        const domains = settingsDoc.exists() ? (settingsDoc.data().domains || []) : [];

        if (domains.includes(domain)) {
            showAlert('Domain đã có trong danh sách!', 'warning', 'Trùng lặp');
            return;
        }

        domains.push(domain);
        await setDoc(doc(db, 'xtn_settings', 'allowed_domains'), { domains }, { merge: true });

        input.value = '';
        await loadAndRenderAllowedDomains();
        showAlert(`Đã thêm domain "${domain}"!`, 'success', 'Thành công');
    } catch (error) {
        console.error('[Settings] Add domain error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
}

window.removeAllowedDomain = async function (domain) {
    const confirmed = await showConfirm(`Xóa domain "${domain}"?`, 'Xác nhận');
    if (!confirmed) return;

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'allowed_domains'));
        const domains = settingsDoc.exists() ? (settingsDoc.data().domains || []) : [];

        const newDomains = domains.filter(d => d !== domain);
        await setDoc(doc(db, 'xtn_settings', 'allowed_domains'), { domains: newDomains }, { merge: true });

        await loadAndRenderAllowedDomains();
        showAlert(`Đã xóa domain "${domain}"!`, 'success', 'Thành công');
    } catch (error) {
        console.error('[Settings] Remove domain error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
};

// ============================================================
// AI TOGGLE - OWNER ONLY
// ============================================================
async function loadAIStatus() {
    const badge = document.getElementById('ai-status-badge');
    const btn = document.getElementById('btn-toggle-ai');
    if (!badge || !btn) return;

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'ai_config'));
        const enabled = settingsDoc.exists() ? settingsDoc.data().enabled !== false : true;

        if (enabled) {
            badge.innerHTML = '<i class="fa-solid fa-check-circle"></i> AI đang BẬT';
            badge.style.background = '#dcfce7';
            badge.style.color = '#16a34a';
            btn.innerHTML = '<i class="fa-solid fa-power-off"></i> Tắt AI';
            btn.className = 'btn btn-warning';
        } else {
            badge.innerHTML = '<i class="fa-solid fa-times-circle"></i> AI đang TẮT';
            badge.style.background = '#fee2e2';
            badge.style.color = '#dc2626';
            btn.innerHTML = '<i class="fa-solid fa-power-off"></i> Bật AI';
            btn.className = 'btn btn-success';
        }
    } catch (error) {
        console.error('[AI Toggle] Load status error:', error);
    }
}

document.getElementById('btn-toggle-ai')?.addEventListener('click', async function () {
    // Check owner permission
    if (!SUPER_OWNER_EMAILS.includes(userData?.email)) {
        showAlert('Bạn không có quyền thực hiện thao tác này!', 'error', 'Không có quyền');
        return;
    }

    try {
        const settingsDoc = await getDoc(doc(db, 'xtn_settings', 'ai_config'));
        const currentEnabled = settingsDoc.exists() ? settingsDoc.data().enabled !== false : true;
        const newEnabled = !currentEnabled;

        const confirmed = await showConfirm(
            newEnabled
                ? 'Bạn có chắc muốn BẬT AI? Tất cả users sẽ có thể sử dụng.'
                : 'Bạn có chắc muốn TẮT AI? Tất cả users sẽ không thể sử dụng.',
            'Xác nhận'
        );
        if (!confirmed) return;

        await setDoc(doc(db, 'xtn_settings', 'ai_config'), {
            enabled: newEnabled,
            updated_at: serverTimestamp(),
            updated_by: userData?.email
        }, { merge: true });

        showAlert(
            newEnabled ? 'Đã BẬT AI!' : 'Đã TẮT AI!',
            'success',
            'Thành công'
        );

        activityLog.update('settings', 'ai_config');
        loadAIStatus();

    } catch (error) {
        console.error('[AI Toggle] Error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
});

// ============================================================
// CHECK PROFILE ON FIRST LOGIN - Yêu cầu kiểm tra thông tin lần đầu
// ============================================================
async function checkProfileOnFirstLogin() {
    if (!userData || !currentUser) return;

    // Skip if already confirmed
    if (userData.profile_confirmed) {
        console.log('[ProfileCheck] Already confirmed, skipping');
        return;
    }

    // Convert name suggestion
    const currentName = userData.name || '';
    const suggestedName = convertNameToVN(currentName);
    const needsConversion = suggestedName !== currentName;

    const { value: formResult } = await Swal.fire({
        title: '<i class="fa-solid fa-user-check"></i> Kiểm tra thông tin',
        html: `
            <div style="text-align:left; font-size:14px;">
                <p style="color:#666; margin-bottom:15px;">
                    Vui lòng kiểm tra và cập nhật thông tin cá nhân của bạn trước khi sử dụng hệ thống.
                </p>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block; margin-bottom:5px; font-weight:600;">📧 Email</label>
                    <input type="text" value="${userData.email}" readonly 
                           style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; background:#f3f4f6;">
                </div>

                <div style="margin-bottom:12px;">
                    <label style="display:block; margin-bottom:5px; font-weight:600;">👤 Họ và tên <span style="color:red;">*</span></label>
                    <input type="text" id="swal-check-name" value="${needsConversion ? suggestedName : currentName}" 
                           placeholder="Nguyễn Văn A"
                           style="width:100%; padding:10px; border:1px solid ${needsConversion ? '#f59e0b' : '#ddd'}; border-radius:8px; background:${needsConversion ? '#fef3c7' : 'white'};">
                    ${needsConversion ? `<small style="color:#f59e0b; display:block; margin-top:5px;">💡 Đã đổi từ "${currentName}"</small>` : ''}
                </div>

                <div style="display:flex; gap:10px; margin-bottom:12px;">
                    <div style="flex:1;">
                        <label style="display:block; margin-bottom:5px; font-weight:600;">🎓 MSSV</label>
                        <input type="text" id="swal-check-mssv" value="${userData.mssv || ''}" 
                               placeholder="K21000001"
                               style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px;">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block; margin-bottom:5px; font-weight:600;">📱 SĐT</label>
                        <input type="text" id="swal-check-phone" value="${userData.phone || ''}" 
                               placeholder="0901234567"
                               style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px;">
                    </div>
                </div>

                <div style="background:#f0fdf4; padding:10px; border-radius:8px; border:1px solid #86efac;">
                    <small style="color:#16a34a;">
                        <i class="fa-solid fa-shield-check"></i> 
                        Thông tin này sẽ được sử dụng để tạo thẻ Chiến sĩ và liên lạc khi cần.
                    </small>
                </div>
            </div>
        `,
        width: 480,
        showCancelButton: false,
        confirmButtonText: '<i class="fa-solid fa-check"></i> Xác nhận thông tin',
        confirmButtonColor: '#10b981',
        allowOutsideClick: false,
        allowEscapeKey: false,
        preConfirm: () => {
            const name = document.getElementById('swal-check-name').value.trim();
            if (!name) {
                Swal.showValidationMessage('Vui lòng nhập họ tên!');
                return false;
            }
            return {
                name: name,
                mssv: document.getElementById('swal-check-mssv').value.trim(),
                phone: document.getElementById('swal-check-phone').value.trim()
            };
        }
    });

    if (formResult) {
        try {
            await setDoc(doc(db, 'xtn_users', currentUser.uid), {
                name: formResult.name,
                mssv: formResult.mssv,
                phone: formResult.phone,
                profile_confirmed: true,
                profile_confirmed_at: serverTimestamp()
            }, { merge: true });

            // Update local data
            userData.name = formResult.name;
            userData.mssv = formResult.mssv;
            userData.phone = formResult.phone;
            userData.profile_confirmed = true;

            // Update sidebar
            document.getElementById('user-name').textContent = formResult.name;

            showAlert('Đã lưu thông tin!', 'success', 'Thành công');

        } catch (error) {
            console.error('[ProfileCheck] Save error:', error);
            showAlert('Lỗi lưu thông tin: ' + error.message, 'error', 'Lỗi');
        }
    }
}

// ============================================================
// PROFILE MANAGEMENT - THÔNG TIN CÁ NHÂN
// ============================================================

// Danh sách họ Việt Nam (duplicate từ auth.js để dùng client-side)
const VN_FAMILY_NAMES = [
    'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ',
    'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đoàn', 'Đinh',
    'Lương', 'Trương', 'Chu', 'Mai', 'Tô', 'Cao', 'Lưu', 'Hà', 'Tạ',
    'Từ', 'La', 'Thái', 'Tăng', 'Đào', 'Quách', 'Triệu', 'Lâm', 'Phùng'
];

function removeVNTones(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function isVNFamilyName(word) {
    if (!word) return false;
    return VN_FAMILY_NAMES.some(name =>
        name.toLowerCase() === word.toLowerCase() ||
        removeVNTones(name).toLowerCase() === removeVNTones(word).toLowerCase()
    );
}

function convertNameToVN(name) {
    if (!name) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;

    // Already correct format
    if (isVNFamilyName(parts[0])) return name;

    // Need conversion
    if (isVNFamilyName(parts[parts.length - 1])) {
        const familyName = parts.pop();
        return familyName + ' ' + parts.join(' ');
    }
    return name;
}

async function loadProfileSection() {
    if (!userData) return;

    // Fill form with current data
    document.getElementById('profile-email').value = userData.email || '';
    document.getElementById('profile-name').value = userData.name || '';
    document.getElementById('profile-mssv').value = userData.mssv || '';
    document.getElementById('profile-phone').value = userData.phone || '';
    document.getElementById('profile-faculty').value = userData.faculty || '';

    // Load team name
    if (userData.team_id) {
        try {
            const teamDoc = await getDoc(doc(db, 'xtn_teams', userData.team_id));
            document.getElementById('profile-team').value = teamDoc.exists()
                ? teamDoc.data().team_name
                : 'Chưa xác định';
        } catch (e) {
            document.getElementById('profile-team').value = 'Chưa xác định';
        }
    } else {
        document.getElementById('profile-team').value = 'Chưa được phân đội';
    }

    // Check if name needs suggestion
    checkNameSuggestion();
}

function checkNameSuggestion() {
    const currentName = document.getElementById('profile-name').value;
    const originalGoogleName = userData.original_google_name;

    const suggestionBox = document.getElementById('profile-name-suggestion');
    const suggestionText = document.getElementById('profile-suggestion-text');

    // If name is still Google format (not converted)
    if (originalGoogleName && currentName === originalGoogleName) {
        const convertedName = convertNameToVN(originalGoogleName);
        if (convertedName !== originalGoogleName) {
            suggestionText.textContent = `Gợi ý: Tên của bạn có thể là "${convertedName}"`;
            suggestionBox.style.display = 'block';

            // Store for accept button
            suggestionBox.dataset.suggestedName = convertedName;
        } else {
            suggestionBox.style.display = 'none';
        }
    } else {
        suggestionBox.style.display = 'none';
    }
}

// Handle suggestion buttons
document.getElementById('btn-accept-suggestion')?.addEventListener('click', function () {
    const suggestionBox = document.getElementById('profile-name-suggestion');
    const suggestedName = suggestionBox.dataset.suggestedName;
    if (suggestedName) {
        document.getElementById('profile-name').value = suggestedName;
        suggestionBox.style.display = 'none';
        showAlert('Đã cập nhật tên!', 'success', 'Thành công');
    }
});

document.getElementById('btn-reject-suggestion')?.addEventListener('click', function () {
    document.getElementById('profile-name-suggestion').style.display = 'none';
});

// Handle profile form submit
document.getElementById('form-profile')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const name = document.getElementById('profile-name').value.trim();
    const mssv = document.getElementById('profile-mssv').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const faculty = document.getElementById('profile-faculty').value;

    if (!name) {
        showAlert('Vui lòng nhập họ tên!', 'warning', 'Thiếu thông tin');
        return;
    }

    // Auto-convert name if needed
    const convertedName = convertNameToVN(name);

    try {
        await setDoc(doc(db, 'xtn_users', currentUser.uid), {
            name: convertedName,
            mssv,
            phone,
            faculty,
            updated_at: serverTimestamp()
        }, { merge: true });

        // Update local data
        userData.name = convertedName;
        userData.mssv = mssv;
        userData.phone = phone;
        userData.faculty = faculty;

        // Update sidebar
        document.getElementById('user-name').textContent = convertedName;

        showAlert('Đã lưu thông tin thành công!', 'success', 'Thành công');
        activityLog.update('user', currentUser.uid);

        // If name was converted, show message
        if (convertedName !== name) {
            showAlert(`Tên đã được chuyển thành "${convertedName}"`, 'info', 'Chuyển đổi tên');
            document.getElementById('profile-name').value = convertedName;
        }

        // Hide suggestion if visible
        document.getElementById('profile-name-suggestion').style.display = 'none';

    } catch (error) {
        console.error('[Profile] Save error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
});

// ============================================================
// ACCOUNT MANAGEMENT - QUẢN LÝ TÀI KHOẢN ĐĂNG NHẬP
// ============================================================
let accountsDataCache = [];
let selectedAccounts = new Set();

// Role display config
const ROLE_CONFIG = {
    'pending': { label: 'Chờ duyệt', color: '#f59e0b', icon: '🟡' },
    'member': { label: 'Chiến sĩ', color: '#10b981', icon: '🟢' },
    'doihinh_admin': { label: 'BCH Đội', color: '#3b82f6', icon: '🔵' },
    'kysutet_admin': { label: 'Ký sự Tết', color: '#8b5cf6', icon: '🟣' },
    'super_admin': { label: 'Super Admin', color: '#ef4444', icon: '🔴' }
};

async function loadAccounts() {
    const tbody = document.getElementById('accounts-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    selectedAccounts.clear();
    accountsDataCache = [];

    try {
        // Load teams map
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        const teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
        });

        // Load promote team dropdown
        const promoteTeamSelect = document.getElementById('promote-team');
        if (promoteTeamSelect) {
            promoteTeamSelect.innerHTML = '<option value="">-- Chọn đội hình --</option>';
            teamsSnap.forEach(d => {
                promoteTeamSelect.innerHTML += `<option value="${d.id}">${d.data().team_name || d.id}</option>`;
            });
        }

        // Load all users (filter later on client-side to handle undefined roles)
        const filterRole = document.getElementById('accounts-filter-role')?.value || '';
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        let pendingCount = 0;

        usersSnap.forEach(d => {
            const data = d.data();
            const userRole = data.role && data.role !== '' ? data.role : 'pending';

            // Client-side filter
            if (filterRole && userRole !== filterRole) {
                // Skip users that don't match filter
                // Special case: "pending" filter should include undefined/empty roles
                if (filterRole === 'pending' && (data.role === undefined || data.role === '' || data.role === null)) {
                    // Include this user
                } else {
                    return;
                }
            }

            accountsDataCache.push({
                id: d.id,
                name: data.name || 'Chưa có tên',
                email: data.email || '',
                role: userRole,
                team_id: data.team_id || '',
                team_name: teamsMap[data.team_id] || '',
                mssv: data.mssv || '',
                phone: data.phone || '',
                created_at: data.created_at
            });
            if (userRole === 'pending') pendingCount++;
        });

        // Update stats
        document.getElementById('accounts-total-count').textContent = accountsDataCache.length;
        document.getElementById('accounts-pending-count').textContent = pendingCount;

        // Render table
        renderAccountsTable();

    } catch (error) {
        console.error('[Accounts] Load error:', error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Lỗi tải dữ liệu</td></tr>';
    }
}

function renderAccountsTable() {
    const tbody = document.getElementById('accounts-list');
    if (!tbody) return;

    if (accountsDataCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Không có tài khoản nào</td></tr>';
        return;
    }

    tbody.innerHTML = accountsDataCache.map(acc => {
        // Normalize role (treat undefined, null, empty as 'pending')
        const normalizedRole = acc.role && acc.role !== '' ? acc.role : 'pending';
        const roleConfig = ROLE_CONFIG[normalizedRole] || ROLE_CONFIG['pending'];

        // Determine if user needs promotion (no role, pending, or no team)
        const needsPromotion = normalizedRole === 'pending' || !acc.team_id;
        const isActive = normalizedRole !== 'pending' && acc.team_id;

        const teamBadge = acc.team_name
            ? `<span style="background:#10b981; color:white; padding:4px 10px; border-radius:12px; font-size:12px;">${acc.team_name}</span>`
            : '<span style="background:#fef3c7; color:#92400e; padding:4px 10px; border-radius:12px; font-size:12px;">⚠️ Chưa phân đội</span>';

        const createdAt = acc.created_at?.toDate?.()
            ? acc.created_at.toDate().toLocaleDateString('vi-VN')
            : '-';

        // Role dropdown
        const roleOptions = Object.keys(ROLE_CONFIG).map(r =>
            `<option value="${r}" ${normalizedRole === r ? 'selected' : ''}>${ROLE_CONFIG[r].label}</option>`
        ).join('');

        // Row background color based on status
        const rowBg = needsPromotion ? 'background:#fff7ed;' : '';

        // Action buttons
        let actionBtns = '';

        // Promote button - show for pending OR users without team
        if (needsPromotion) {
            actionBtns += `<button class="btn btn-success btn-sm" onclick="openPromoteModal('${acc.id}')" title="Chuyển thành Chiến sĩ" style="margin-right:5px;">
                <i class="fa-solid fa-user-plus"></i> Duyệt
            </button>`;
        }

        // Edit button - show for all
        actionBtns += `<button class="btn btn-secondary btn-sm" onclick="openEditAccountModal('${acc.id}')" title="Sửa thông tin" style="margin-right:5px;">
            <i class="fa-solid fa-edit"></i>
        </button>`;

        // Delete button
        actionBtns += `<button class="btn btn-danger btn-sm" onclick="deleteAccount('${acc.id}')" title="Xóa">
            <i class="fa-solid fa-trash"></i>
        </button>`;

        return `
            <tr data-id="${acc.id}" data-name="${acc.name.toLowerCase()}" data-email="${acc.email.toLowerCase()}" style="${rowBg}">
                <td><input type="checkbox" class="account-checkbox" data-id="${acc.id}" onchange="toggleAccountSelection('${acc.id}')"></td>
                <td>
                    <strong>${acc.name}</strong>
                    ${needsPromotion ? '<span style="display:block;font-size:11px;color:#f59e0b;">⏳ Chờ duyệt</span>' : ''}
                </td>
                <td style="font-size:13px;">${acc.email}</td>
                <td>
                    <select class="role-select" onchange="changeUserRole('${acc.id}', this.value)" 
                            style="padding:6px 10px; border-radius:8px; border:1px solid ${needsPromotion ? '#f59e0b' : '#ddd'}; 
                                   font-size:12px; background:${needsPromotion ? '#fef3c7' : 'white'};">
                        ${roleOptions}
                    </select>
                </td>
                <td>${teamBadge}</td>
                <td style="font-size:12px; color:#6b7280;">${createdAt}</td>
                <td style="white-space:nowrap;">${actionBtns}</td>
            </tr>
        `;
    }).join('');
}

window.filterAccountsTable = function () {
    const searchTerm = document.getElementById('accounts-search')?.value.toLowerCase() || '';
    document.querySelectorAll('#accounts-list tr').forEach(row => {
        const name = row.dataset.name || '';
        const email = row.dataset.email || '';
        const matches = name.includes(searchTerm) || email.includes(searchTerm);
        row.style.display = matches ? '' : 'none';
    });
};

window.toggleSelectAllAccounts = function () {
    const checked = document.getElementById('accounts-select-all').checked;
    selectedAccounts.clear();
    document.querySelectorAll('.account-checkbox').forEach(cb => {
        cb.checked = checked;
        if (checked) selectedAccounts.add(cb.dataset.id);
    });
    updateAccountsBulkUI();
};

window.toggleAccountSelection = function (id) {
    if (selectedAccounts.has(id)) {
        selectedAccounts.delete(id);
    } else {
        selectedAccounts.add(id);
    }
    updateAccountsBulkUI();
};

function updateAccountsBulkUI() {
    const count = selectedAccounts.size;
    document.getElementById('accounts-selected-count').textContent = count;
    document.getElementById('btn-delete-accounts').disabled = count === 0;
}

window.changeUserRole = async function (userId, newRole) {
    try {
        await setDoc(doc(db, 'xtn_users', userId), { role: newRole }, { merge: true });
        showAlert(`Đã đổi vai trò thành "${ROLE_CONFIG[newRole]?.label}"`, 'success', 'Thành công');

        // Log activity
        activityLog.update('user', userId);

        // Reload to update stats
        loadAccounts();
    } catch (error) {
        console.error('[Accounts] Change role error:', error);
        showAlert('Lỗi đổi vai trò: ' + error.message, 'error', 'Lỗi');
    }
};

window.openPromoteModal = function (userId) {
    const acc = accountsDataCache.find(a => a.id === userId);
    if (!acc) return;

    document.getElementById('promote-user-id').value = userId;
    document.getElementById('promote-name').value = acc.name;
    document.getElementById('promote-email').value = acc.email;
    document.getElementById('promote-mssv').value = acc.mssv || '';
    document.getElementById('promote-phone').value = acc.phone || '';
    document.getElementById('promote-team').value = acc.team_id || '';

    document.getElementById('modal-promote-member').style.display = 'flex';
};

window.closePromoteModal = function () {
    document.getElementById('modal-promote-member').style.display = 'none';
};

// Edit account modal using SweetAlert2
window.openEditAccountModal = async function (userId) {
    const acc = accountsDataCache.find(a => a.id === userId);
    if (!acc) return;

    // Load teams for dropdown
    const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
    let teamOptions = '<option value="">-- Chưa phân đội --</option>';
    teamsSnap.forEach(d => {
        const isSelected = d.id === acc.team_id ? 'selected' : '';
        teamOptions += `<option value="${d.id}" ${isSelected}>${d.data().team_name || d.id}</option>`;
    });

    // Position options (chức vụ) - tự động tính role
    const posOptions = POSITIONS_LIST.map(p =>
        `<option value="${p}" ${acc.position === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    // Role options (chỉ hiển thị, được tính từ position)
    const roleOptions = Object.keys(ROLE_CONFIG).map(r =>
        `<option value="${r}" ${acc.role === r ? 'selected' : ''}>${ROLE_CONFIG[r].label}</option>`
    ).join('');

    const { value: formValues } = await Swal.fire({
        title: '<i class="fa-solid fa-user-edit"></i> Sửa thông tin tài khoản',
        html: `
            <div style="text-align:left;">
                <div class="form-group" style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Họ và tên</label>
                    <input type="text" id="swal-name" class="swal2-input" value="${acc.name}" style="width:100%;margin:0;">
                </div>
                <div class="form-group" style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Email</label>
                    <input type="email" id="swal-email" class="swal2-input" value="${acc.email}" style="width:100%;margin:0;" readonly>
                </div>
                <div style="display:flex;gap:15px;margin-bottom:15px;">
                    <div style="flex:1;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">MSSV</label>
                        <input type="text" id="swal-mssv" class="swal2-input" value="${acc.mssv || ''}" placeholder="K21000001" style="width:100%;margin:0;">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">SĐT</label>
                        <input type="tel" id="swal-phone" class="swal2-input" value="${acc.phone || ''}" placeholder="0901234567" style="width:100%;margin:0;">
                    </div>
                </div>
                <div style="display:flex;gap:15px;margin-bottom:15px;">
                    <div style="flex:1;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Chức vụ <span style="color:#10b981;font-size:11px;">(quyết định vai trò)</span></label>
                        <select id="swal-position" class="swal2-input" style="width:100%;margin:0;" onchange="updateRoleFromPosition()">${posOptions}</select>
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Vai trò <span style="color:#6b7280;font-size:11px;">(tự động)</span></label>
                        <select id="swal-role" class="swal2-input" style="width:100%;margin:0;background:#f3f4f6;" disabled>${roleOptions}</select>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Đội hình</label>
                    <select id="swal-team" class="swal2-input" style="width:100%;margin:0;">${teamOptions}</select>
                </div>
            </div>
        `,
        width: 550,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-save"></i> Lưu',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#10b981',
        focusConfirm: false,
        didOpen: () => {
            // Initial role calculation
            window.updateRoleFromPosition = function () {
                const pos = document.getElementById('swal-position').value;
                const role = POSITION_TO_ROLE[pos] || 'member';
                document.getElementById('swal-role').value = role;
            };
            updateRoleFromPosition();
        },
        preConfirm: () => {
            const position = document.getElementById('swal-position').value;
            const role = POSITION_TO_ROLE[position] || 'member';
            return {
                name: document.getElementById('swal-name').value.trim(),
                mssv: document.getElementById('swal-mssv').value.trim(),
                phone: document.getElementById('swal-phone').value.trim(),
                position: position,
                role: role,
                team_id: document.getElementById('swal-team').value
            };
        }
    });

    if (formValues) {
        try {
            await setDoc(doc(db, 'xtn_users', userId), formValues, { merge: true });
            showAlert('Đã cập nhật thông tin!', 'success', 'Thành công');
            activityLog.update('user', userId);
            loadAccounts();
        } catch (error) {
            showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
        }
    }
};

// Handle promote form submit
document.getElementById('form-promote-member')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const userId = document.getElementById('promote-user-id').value;
    const teamId = document.getElementById('promote-team').value;
    const mssv = document.getElementById('promote-mssv').value.trim();
    const phone = document.getElementById('promote-phone').value.trim();

    if (!teamId) {
        showAlert('Vui lòng chọn đội hình!', 'warning', 'Thiếu thông tin');
        return;
    }

    try {
        await setDoc(doc(db, 'xtn_users', userId), {
            role: 'member',
            team_id: teamId,
            mssv: mssv,
            phone: phone,
            promoted_at: serverTimestamp()
        }, { merge: true });

        closePromoteModal();
        showAlert('Đã chuyển thành Chiến sĩ thành công!', 'success', 'Hoàn thành');

        // Sync team stats
        await syncTeamStats(teamId);

        // Log activity
        activityLog.update('user', userId);

        loadAccounts();
    } catch (error) {
        console.error('[Accounts] Promote error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
});

window.deleteAccount = async function (userId) {
    // Prevent deleting own account
    if (userId === currentUser.uid) {
        showAlert('Không thể xóa tài khoản của chính bạn!', 'warning', 'Không được phép');
        return;
    }

    const acc = accountsDataCache.find(a => a.id === userId);
    const result = await Swal.fire({
        title: 'Xóa tài khoản?',
        text: `Bạn có chắc muốn xóa "${acc?.name || userId}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#dc2626'
    });

    if (result.isConfirmed) {
        try {
            await deleteDoc(doc(db, 'xtn_users', userId));
            showAlert('Đã xóa tài khoản!', 'success', 'Hoàn thành');
            activityLog.delete('user', userId);
            loadAccounts();
        } catch (error) {
            showAlert('Lỗi xóa: ' + error.message, 'error', 'Lỗi');
        }
    }
};

window.deleteSelectedAccounts = async function () {
    if (selectedAccounts.size === 0) return;

    const result = await Swal.fire({
        title: `Xóa ${selectedAccounts.size} tài khoản?`,
        text: 'Hành động này không thể hoàn tác!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa tất cả',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#dc2626'
    });

    if (result.isConfirmed) {
        try {
            // Remove current user from selected list to prevent self-deletion
            const idsToDelete = [...selectedAccounts].filter(id => id !== currentUser.uid);
            if (idsToDelete.length < selectedAccounts.size) {
                showAlert('Đã bỏ qua tài khoản của bạn khỏi danh sách xóa!', 'info', 'Lưu ý');
            }

            for (const id of idsToDelete) {
                await deleteDoc(doc(db, 'xtn_users', id));
            }
            showAlert(`Đã xóa ${idsToDelete.length} tài khoản!`, 'success', 'Hoàn thành');
            activityLog.delete('user', 'bulk_' + idsToDelete.length);
            loadAccounts();
        } catch (error) {
            showAlert('Lỗi xóa: ' + error.message, 'error', 'Lỗi');
        }
    }
};

window.bulkChangeRole = async function () {
    const newRole = document.getElementById('bulk-role-change')?.value;
    if (!newRole || selectedAccounts.size === 0) {
        showAlert('Vui lòng chọn vai trò và ít nhất 1 tài khoản!', 'warning', 'Thiếu thông tin');
        return;
    }

    const confirmed = await showConfirm(`Đổi vai trò ${selectedAccounts.size} tài khoản thành "${ROLE_CONFIG[newRole]?.label}"?`, 'Xác nhận');
    if (!confirmed) return;

    try {
        for (const id of selectedAccounts) {
            await setDoc(doc(db, 'xtn_users', id), { role: newRole }, { merge: true });
        }
        showAlert(`Đã đổi vai trò ${selectedAccounts.size} tài khoản!`, 'success', 'Hoàn thành');
        activityLog.update('user', 'bulk_' + selectedAccounts.size);
        document.getElementById('bulk-role-change').value = '';
        loadAccounts();
    } catch (error) {
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
};

// Bulk convert names for all users (Admin function)
window.bulkConvertAllNames = async function () {
    const confirmed = await showConfirm('Bạn có chắc muốn chuyển đổi tên TẤT CẢ users sang format Việt Nam?\n\nVí dụ: "My Nhật Nguyễn" → "Nguyễn Nhật My"', 'Xác nhận');
    if (!confirmed) return;

    try {
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        let converted = 0;
        let skipped = 0;

        for (const userDoc of usersSnap.docs) {
            const data = userDoc.data();
            const currentName = data.name;

            if (!currentName) {
                skipped++;
                continue;
            }

            const convertedName = convertNameToVN(currentName);

            if (convertedName !== currentName) {
                await setDoc(doc(db, 'xtn_users', userDoc.id), {
                    name: convertedName,
                    original_google_name: data.original_google_name || currentName
                }, { merge: true });
                converted++;
                console.log(`[BulkConvert] ${currentName} → ${convertedName}`);
            } else {
                skipped++;
            }
        }

        showAlert(`Đã chuyển đổi ${converted} tên! (${skipped} bỏ qua vì đã chuẩn)`, 'success', 'Hoàn thành');
        loadAccounts();
    } catch (error) {
        console.error('[BulkConvert] Error:', error);
        showAlert('Lỗi: ' + error.message, 'error', 'Lỗi');
    }
};

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
