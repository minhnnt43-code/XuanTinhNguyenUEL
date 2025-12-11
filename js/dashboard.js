/**
 * dashboard.js - Dashboard với Sidebar
 * XTN 2026
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, addDoc, getDocs, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// DISABLED: import { initActivityModule } from './activity.js';

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let userData = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ dashboard.js loaded');
    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUser = user;

        // Lấy thông tin user từ Firestore
        const userDoc = await getDoc(doc(db, "xtn_users", user.uid));
        userData = userDoc.exists() ? userDoc.data() : { role: 'pending', name: user.displayName || user.email.split('@')[0] };

        // Hiện tên user (fix undefined)
        const displayName = userData.name || user.displayName || user.email.split('@')[0];
        document.getElementById('user-name').textContent = displayName;

        // Hiện avatar (từ Google hoặc default)
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
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
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
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);
    document.getElementById('avatar-upload')?.addEventListener('change', handleAvatarUpload);
    document.getElementById('btn-avatar-reset')?.addEventListener('click', resetAvatar);
    document.getElementById('btn-avatar-download')?.addEventListener('click', downloadAvatar);
    document.getElementById('card-form')?.addEventListener('submit', handleCardForm);
    document.getElementById('card-photo')?.addEventListener('change', handleCardPhoto);
    document.getElementById('btn-card-download')?.addEventListener('click', downloadCard);
    document.getElementById('activity-form')?.addEventListener('submit', handleActivityForm);
    document.getElementById('team-form')?.addEventListener('submit', handleTeamForm);
    document.getElementById('question-form')?.addEventListener('submit', handleQuestionForm);

    // Reload câu hỏi khi chọn đội hình khác
    document.getElementById('reg-team')?.addEventListener('change', function () {
        loadDynamicQuestionsToForm(this.value || null);
    });

    // Dev role switcher
    document.getElementById('btn-dev-apply')?.addEventListener('click', applyDevRole);
});

// ============================================================
// CUSTOM MODAL CONFIRM / ALERT - Thay thế confirm() và alert()
// ============================================================
function showConfirm(message, title = 'Xác nhận') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const msgEl = document.getElementById('modal-confirm-message');
        const titleEl = document.getElementById('modal-confirm-title');
        const okBtn = document.getElementById('modal-confirm-ok');
        const cancelBtn = document.getElementById('modal-confirm-cancel');

        titleEl.innerHTML = `<i class="fa-solid fa-question-circle"></i> ${title}`;
        msgEl.textContent = message;
        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
    });
}

function showAlert(message, type = 'info', title = 'Thông báo') {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-alert');
        const msgEl = document.getElementById('modal-alert-message');
        const titleEl = document.getElementById('modal-alert-title');
        const okBtn = document.getElementById('modal-alert-ok');

        // Icon và màu theo loại
        let icon = 'fa-info-circle';
        let color = '#3b82f6';
        if (type === 'success') { icon = 'fa-check-circle'; color = '#10b981'; }
        else if (type === 'error') { icon = 'fa-times-circle'; color = '#ef4444'; }
        else if (type === 'warning') { icon = 'fa-exclamation-triangle'; color = '#f59e0b'; }

        titleEl.innerHTML = `<i class="fa-solid ${icon}" style="color:${color}"></i> ${title}`;
        msgEl.textContent = message;
        modal.style.display = 'flex';

        const onOk = () => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            resolve();
        };

        okBtn.addEventListener('click', onOk);
    });
}
// ============================================================
// CLOCK
// ============================================================
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('vi-VN');
    document.getElementById('clock-time').textContent = time;
    document.getElementById('clock-date').textContent = date;
}

// ============================================================
// MENU
// ============================================================
function setupMenuByRole() {
    const role = userData.role || 'pending';

    // Hide all role-specific menus first
    document.getElementById('menu-dashboard')?.classList.add('hidden');
    document.getElementById('menu-tools')?.classList.add('hidden');
    document.getElementById('menu-activity')?.classList.add('hidden'); // DISABLED temporarily
    document.getElementById('menu-system')?.classList.add('hidden');
    document.getElementById('menu-register')?.classList.add('hidden');

    if (role === 'pending') {
        // Chỉ hiện đăng ký
        document.getElementById('menu-register')?.classList.remove('hidden');
    } else if (role === 'member') {
        // Chỉ hiện công cụ
        document.getElementById('menu-tools')?.classList.remove('hidden');
    } else if (role === 'doihinh_admin') {
        // BCH Đội: Tổng quan, Công cụ
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        // DISABLED: document.getElementById('menu-activity')?.classList.remove('hidden');
    } else if (role === 'super_admin') {
        // BCH Trường: Tất cả (trừ activity)
        document.getElementById('menu-dashboard')?.classList.remove('hidden');
        document.getElementById('menu-tools')?.classList.remove('hidden');
        // DISABLED: document.getElementById('menu-activity')?.classList.remove('hidden');
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
    if (sectionId === 'section-teams') loadTeams();
    if (sectionId === 'section-questions') loadQuestions();
    // DISABLED: if (sectionId === 'section-activity') initActivityModule();
}

function hideSection(sectionId) {
    document.getElementById(sectionId)?.classList.remove('active');
}

async function showDefaultSection() {
    const role = userData.role || 'pending';
    console.log('🔵 showDefaultSection, role:', role);

    if (role === 'pending') {
        const regQuery = query(collection(db, "xtn_registrations"), where("user_id", "==", currentUser.uid));
        const regSnapshot = await getDocs(regQuery);
        console.log('🔵 regSnapshot.empty:', regSnapshot.empty);

        if (regSnapshot.empty) {
            // Email - nếu có element
            const regEmailEl = document.getElementById('reg-email');
            if (regEmailEl) regEmailEl.textContent = currentUser.email;

            // Tên - fix đảo ngược (Minh Lâm Quốc → Lâm Quốc Minh)
            let rawName = userData.name || currentUser.displayName || '';
            if (rawName) {
                const parts = rawName.trim().split(/\s+/);
                if (parts.length >= 2) {
                    // Đưa tên (phần đầu) về cuối: "Minh Lâm Quốc" → "Lâm Quốc Minh"
                    const firstName = parts.shift(); // Lấy phần đầu
                    parts.push(firstName); // Đưa về cuối
                    rawName = parts.join(' ');
                }
            }
            const regNameEl = document.getElementById('reg-name');
            if (regNameEl) regNameEl.value = rawName;

            // Load teams từ Firebase vào form
            console.log('🔵 Calling loadTeamsToRegisterForm');
            await loadTeamsToRegisterForm();

            // Load câu hỏi động từ Firebase
            console.log('🔵 Calling loadDynamicQuestionsToForm');
            await loadDynamicQuestionsToForm();

            showSection('section-register');
        } else {
            showSection('section-pending');
        }
    } else {
        showSection('section-dashboard');
    }
}

// ============================================================
// DASHBOARD STATS
// ============================================================
async function loadDashboardStats() {
    try {
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        const regsSnap = await getDocs(query(collection(db, 'xtn_registrations'), where('status', '==', 'pending')));
        const activitiesSnap = await getDocs(collection(db, 'xtn_activities'));
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));

        let members = 0;
        usersSnap.forEach(d => { if (d.data().role === 'member') members++; });

        document.getElementById('stat-members').textContent = members;
        document.getElementById('stat-pending').textContent = regsSnap.size;
        document.getElementById('stat-activities').textContent = activitiesSnap.size;
        document.getElementById('stat-teams').textContent = teamsSnap.size;
    } catch (e) {
        console.error('Error loading stats:', e);
    }
}

// ============================================================
// REGISTER
// ============================================================
async function handleRegister(e) {
    e.preventDefault();

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';

    try {
        // Thu thập câu trả lời động
        const dynamicAnswers = {};
        document.querySelectorAll('#reg-dynamic-questions textarea').forEach(ta => {
            const qId = ta.id.replace('reg-dq-', '');
            dynamicAnswers[qId] = ta.value.trim();
        });

        const data = {
            user_id: currentUser.uid,
            email: currentUser.email,
            full_name: document.getElementById('reg-name').value.trim(),
            student_id: document.getElementById('reg-mssv').value.trim(),
            class_name: document.getElementById('reg-class').value.trim(),
            faculty: document.getElementById('reg-faculty').value,
            phone: document.getElementById('reg-phone').value.trim(),
            t_shirt_size: document.getElementById('reg-size').value,
            preferred_team: document.getElementById('reg-team').value || null,
            dynamic_answers: dynamicAnswers,
            status: 'pending',
            submitted_at: new Date().toISOString()
        };

        await addDoc(collection(db, "xtn_registrations"), data);

        await setDoc(doc(db, "xtn_users", currentUser.uid), {
            email: currentUser.email,
            name: data.full_name,
            avatar_url: currentUser.photoURL || null,
            role: 'pending',
            team_id: null,
            created_at: new Date().toISOString()
        }, { merge: true });

        await showAlert('Đăng ký thành công! Vui lòng chờ BCH duyệt.', 'success', '🎉 Hoàn thành');
        showSection('section-pending');

    } catch (error) {
        console.error(error);
        await showAlert('Lỗi! Vui lòng thử lại.', 'error', 'Lỗi');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi đăng ký';
    }
}

// ============================================================
// REGISTRATIONS MANAGEMENT
// ============================================================
async function loadRegistrations() {
    const container = document.getElementById('registrations-list');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';

    // Load teams for filter
    const filterTeamEl = document.getElementById('reg-filter-team');
    if (filterTeamEl && filterTeamEl.options.length <= 1) {
        try {
            const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
            teamsSnap.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.data().team_name || d.id;
                filterTeamEl.appendChild(opt);
            });
        } catch (e) { console.error(e); }
    }

    const filterTeam = document.getElementById('reg-filter-team')?.value || '';
    const filterStatus = document.getElementById('reg-filter-status')?.value || '';

    try {
        // Load teams map for display
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        const teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
        });

        const snap = await getDocs(collection(db, 'xtn_registrations'));

        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có đơn đăng ký nào.</p>';
            return;
        }

        // Filter
        const regs = [];
        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            if (filterTeam && data.preferred_team !== filterTeam) return;
            if (filterStatus && data.status !== filterStatus) return;
            regs.push(data);
        });

        if (regs.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Không có đơn nào phù hợp.</p>';
            return;
        }

        // Sort by submitted_at desc
        regs.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

        let html = `<table class="data-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-regs" onchange="toggleAllRegs(this)"></th>
                    <th>Họ tên</th>
                    <th>MSSV</th>
                    <th>Khoa</th>
                    <th>SĐT</th>
                    <th>Đội hình</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>`;

        regs.forEach(r => {
            const statusBadge = getStatusBadge(r.status);
            const teamName = r.preferred_team ? (teamsMap[r.preferred_team] || r.preferred_team) : '<em>Chưa chọn</em>';
            html += `<tr>
                <td><input type="checkbox" class="reg-checkbox" value="${r.id}" onchange="toggleRegSelection('${r.id}')"></td>
                <td><strong>${r.full_name || '-'}</strong></td>
                <td>${r.student_id || '-'}</td>
                <td>${r.faculty || '-'}</td>
                <td>${r.phone || '-'}</td>
                <td>${teamName}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewRegistration('${r.id}')"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteRegistration('${r.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Load registrations error:', e);
        container.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu</p>';
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'pass': return '<span class="status-badge status-pass">Đạt</span>';
        case 'consider': return '<span class="status-badge status-consider">Xem xét</span>';
        case 'fail': return '<span class="status-badge status-fail">Rớt</span>';
        default: return '<span class="status-badge status-pending">Chờ duyệt</span>';
    }
}

window.viewRegistration = async function (regId) {
    const modal = document.getElementById('modal-registration');
    const content = document.getElementById('modal-registration-content');
    if (!modal || !content) return;

    content.innerHTML = '<p style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';
    modal.style.display = 'flex';

    try {
        const regDoc = await getDoc(doc(db, 'xtn_registrations', regId));
        if (!regDoc.exists()) {
            content.innerHTML = '<p style="color:red;">Không tìm thấy đơn đăng ký.</p>';
            return;
        }

        const r = regDoc.data();

        // Load questions for dynamic answers
        let questionsMap = {};
        try {
            const qSnap = await getDocs(collection(db, 'xtn_questions'));
            qSnap.forEach(d => questionsMap[d.id] = d.data().question);
        } catch (e) { }

        // Build dynamic answers HTML
        let dynamicHtml = '';
        if (r.dynamic_answers && Object.keys(r.dynamic_answers).length > 0) {
            for (const [qId, answer] of Object.entries(r.dynamic_answers)) {
                const question = questionsMap[qId] || qId;
                dynamicHtml += `<div class="detail-item">
                    <label>${question}</label>
                    <p>${answer || '<em>Không trả lời</em>'}</p>
                </div>`;
            }
        }

        content.innerHTML = `
            <div class="registration-detail">
                <div class="detail-section">
                    <h3><i class="fa-solid fa-user"></i> Thông tin cá nhân</h3>
                    <div class="detail-grid">
                        <div class="detail-item"><label>Họ và tên</label><p>${r.full_name || '-'}</p></div>
                        <div class="detail-item"><label>Email</label><p>${r.email || '-'}</p></div>
                        <div class="detail-item"><label>MSSV/MSCB</label><p>${r.student_id || '-'}</p></div>
                        <div class="detail-item"><label>Lớp</label><p>${r.class_name || '-'}</p></div>
                        <div class="detail-item"><label>Khoa/Viện</label><p>${r.faculty || '-'}</p></div>
                        <div class="detail-item"><label>SĐT</label><p>${r.phone || '-'}</p></div>
                        <div class="detail-item"><label>Size áo</label><p>${r.t_shirt_size || '-'}</p></div>
                        <div class="detail-item"><label>Đội hình</label><p>${r.preferred_team || '<em>Để BCH phân công</em>'}</p></div>
                    </div>
                </div>
                
                <div class="detail-section">
                    <h3><i class="fa-solid fa-comments"></i> Câu trả lời</h3>
                    ${dynamicHtml || '<p style="color:#888;">Không có câu hỏi động.</p>'}
                </div>
                
                <div class="detail-section">
                    <h3><i class="fa-solid fa-clipboard"></i> Ghi chú phỏng vấn</h3>
                    <textarea id="reg-interview-note" rows="3" placeholder="Ghi chú sau phỏng vấn...">${r.interview_note || ''}</textarea>
                </div>
                
                <div class="detail-section">
                    <h3><i class="fa-solid fa-gavel"></i> Đánh giá</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Trạng thái</label>
                            <select id="reg-status-update">
                                <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Chờ duyệt</option>
                                <option value="pass" ${r.status === 'pass' ? 'selected' : ''}>Đạt</option>
                                <option value="consider" ${r.status === 'consider' ? 'selected' : ''}>Xem xét</option>
                                <option value="fail" ${r.status === 'fail' ? 'selected' : ''}>Rớt</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="btn-row">
                    <button class="btn btn-primary" onclick="saveRegistration('${regId}')"><i class="fa-solid fa-save"></i> Lưu</button>
                    <button class="btn btn-secondary" onclick="closeRegistrationModal()">Đóng</button>
                </div>
            </div>
        `;
    } catch (e) {
        console.error('View registration error:', e);
        content.innerHTML = '<p style="color:red;">Lỗi tải chi tiết.</p>';
    }
};

window.saveRegistration = async function (regId) {
    const note = document.getElementById('reg-interview-note')?.value.trim() || '';
    const status = document.getElementById('reg-status-update')?.value || 'pending';

    try {
        await setDoc(doc(db, 'xtn_registrations', regId), {
            interview_note: note,
            status: status,
            reviewed_at: new Date().toISOString()
        }, { merge: true });

        // If pass, update user role to member AND auto-assign team
        if (status === 'pass') {
            const regDoc = await getDoc(doc(db, 'xtn_registrations', regId));
            if (regDoc.exists()) {
                const regData = regDoc.data();
                const userId = regData.user_id;
                const preferredTeam = regData.preferred_team || null;

                // Cập nhật role = member và team_id = preferred_team
                await setDoc(doc(db, 'xtn_users', userId), {
                    role: 'member',
                    team_id: preferredTeam
                }, { merge: true });
            }
        }

        await showAlert('Đã lưu thành công!', 'success', 'Hoàn thành');
        closeRegistrationModal();
        loadRegistrations();
    } catch (e) {
        console.error('Save registration error:', e);
        await showAlert('Lỗi lưu!', 'error', 'Lỗi');
    }
};

window.closeRegistrationModal = function () {
    document.getElementById('modal-registration').style.display = 'none';
};

// Bulk delete registrations
let selectedRegs = new Set();

window.toggleRegSelection = function (regId) {
    if (selectedRegs.has(regId)) {
        selectedRegs.delete(regId);
    } else {
        selectedRegs.add(regId);
    }
    updateRegsSelectedCount();
};

window.toggleAllRegs = function (checkbox) {
    const checkboxes = document.querySelectorAll('.reg-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            selectedRegs.add(cb.value);
        } else {
            selectedRegs.delete(cb.value);
        }
    });
    updateRegsSelectedCount();
};

function updateRegsSelectedCount() {
    const countEl = document.getElementById('regs-selected-count');
    const btnEl = document.getElementById('btn-delete-regs');
    if (countEl) countEl.textContent = selectedRegs.size;
    if (btnEl) btnEl.disabled = selectedRegs.size === 0;
}

window.deleteSelectedRegs = async function () {
    if (selectedRegs.size === 0) return;
    const confirmed = await showConfirm(`Xóa ${selectedRegs.size} đơn đăng ký đã chọn?`, 'Xóa hàng loạt');
    if (!confirmed) return;

    try {
        for (const regId of selectedRegs) {
            await deleteDoc(doc(db, 'xtn_registrations', regId));
        }
        selectedRegs.clear();
        loadRegistrations();
        await showAlert('Đã xóa thành công!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Bulk delete regs error:', e);
        await showAlert('Lỗi xóa hàng loạt!', 'error', 'Lỗi');
    }
};

window.deleteRegistration = async function (regId) {
    const confirmed = await showConfirm('Xóa đơn đăng ký này?', 'Xác nhận xóa');
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'xtn_registrations', regId));
        loadRegistrations();
        await showAlert('Đã xóa đơn đăng ký!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Delete reg error:', e);
        await showAlert('Lỗi xóa!', 'error', 'Lỗi');
    }
};

// ============================================================
// AVATAR CREATOR
// ============================================================
let avatarCanvas, avatarCtx;
let avatarUserImage = null;
let avatarFrame = null;
let avatarDragging = false;
let avatarX = 0, avatarY = 0, avatarScale = 1, avatarBaseScale = 1;
let avatarStartX, avatarStartY;
let avatarUploadLabel, avatarZoomSlider, avatarDownloadBtn, avatarResetBtn;

function initAvatarCanvas() {
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

function handleAvatarUpload(e) {
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

            // Update upload label
            if (avatarUploadLabel) {
                avatarUploadLabel.innerHTML = '<i class="fa-solid fa-check-circle" style="color: #00723F;"></i><p style="color: #00723F;">Ảnh đã tải lên!</p><small>Nhấn để thay ảnh khác</small>';
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

function resetAvatarFull() {
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

function downloadAvatar() {
    if (!avatarUserImage) {
        showAlert('Vui lòng tải ảnh lên trước!', 'warning', 'Chưa có ảnh');
        return;
    }
    const link = document.createElement('a');
    link.download = 'AvatarXTN2026.png';
    link.href = avatarCanvas.toDataURL('image/png', 1.0);
    link.click();
}

// ============================================================
// CARD CREATOR
// ============================================================
let cardCanvas, cardCtx;
let cardPhoto = null;

function initCardCanvas() {
    cardCanvas = document.getElementById('card-canvas');
    if (!cardCanvas) return;
    cardCtx = cardCanvas.getContext('2d');

    document.getElementById('card-name').value = userData.name || '';
    document.getElementById('card-team').value = userData.team_id ? 'Đội ' + userData.team_id.replace('doi-', '') : 'Chưa phân đội';

    drawCardCanvas();
}

function handleCardPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        cardPhoto = new Image();
        cardPhoto.onload = () => drawCardCanvas();
        cardPhoto.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function handleCardForm(e) {
    e.preventDefault();
    drawCardCanvas();
    document.getElementById('btn-card-download').disabled = false;
}

function drawCardCanvas() {
    if (!cardCtx) return;
    const W = 800, H = 1200;

    cardCtx.fillStyle = '#ffffff';
    cardCtx.fillRect(0, 0, W, H);

    const gradient = cardCtx.createLinearGradient(0, 0, W, 0);
    gradient.addColorStop(0, '#00723F');
    gradient.addColorStop(1, '#00964F');
    cardCtx.fillStyle = gradient;
    cardCtx.fillRect(0, 0, W, 200);

    cardCtx.fillStyle = '#fff';
    cardCtx.font = 'bold 48px Montserrat, sans-serif';
    cardCtx.textAlign = 'center';
    cardCtx.fillText('THẺ CHIẾN SĨ', W / 2, 80);
    cardCtx.font = '28px Montserrat, sans-serif';
    cardCtx.fillText('XUÂN TÌNH NGUYỆN UEL 2026', W / 2, 140);

    if (cardPhoto) {
        const pX = 250, pY = 250, pW = 300, pH = 400;
        const scale = Math.max(pW / cardPhoto.width, pH / cardPhoto.height);
        const sW = cardPhoto.width * scale;
        const sH = cardPhoto.height * scale;

        cardCtx.save();
        cardCtx.beginPath();
        cardCtx.rect(pX, pY, pW, pH);
        cardCtx.clip();
        cardCtx.drawImage(cardPhoto, pX - (sW - pW) / 2, pY - (sH - pH) / 2, sW, sH);
        cardCtx.restore();

        cardCtx.strokeStyle = '#00723F';
        cardCtx.lineWidth = 4;
        cardCtx.strokeRect(pX, pY, pW, pH);
    } else {
        cardCtx.fillStyle = '#e5e7eb';
        cardCtx.fillRect(250, 250, 300, 400);
    }

    cardCtx.fillStyle = '#1f2937';
    cardCtx.textAlign = 'center';
    cardCtx.font = 'bold 36px Montserrat, sans-serif';
    cardCtx.fillText(document.getElementById('card-name')?.value || 'Họ và Tên', W / 2, 720);

    cardCtx.fillStyle = '#6b7280';
    cardCtx.font = '24px Montserrat, sans-serif';
    cardCtx.fillText(document.getElementById('card-team')?.value || 'Đội hình', W / 2, 770);

    cardCtx.fillStyle = '#FFE500';
    cardCtx.fillRect(0, H - 100, W, 100);
    cardCtx.fillStyle = '#00723F';
    cardCtx.font = 'bold 28px Montserrat, sans-serif';
    cardCtx.fillText('HỘI SINH VIÊN TRƯỜNG ĐH KINH TẾ - LUẬT', W / 2, H - 45);
}

function downloadCard() {
    const name = document.getElementById('card-name').value.replace(/\s+/g, '-') || 'the-chien-si';
    const link = document.createElement('a');
    link.download = `${name}-xtn-2026.png`;
    link.href = cardCanvas.toDataURL('image/png');
    link.click();
}

// ============================================================
// ACTIVITIES
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
// ADMIN: MEMBERS
// ============================================================
let teamsListCache = []; // Cache danh sách đội

async function loadMembers() {
    const list = document.getElementById('members-list');
    if (!list) return;

    list.innerHTML = '<p style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</p>';

    try {
        // Load teams
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        teamsListCache = [];
        const teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
            teamsListCache.push({ id: d.id, name: d.data().team_name || d.id });
        });

        // Load registrations để lấy MSSV, Khoa, preferred_team
        const regsSnap = await getDocs(collection(db, 'xtn_registrations'));
        const regsMap = {};
        regsSnap.forEach(d => {
            const r = d.data();
            regsMap[r.user_id] = {
                student_id: r.student_id || '',
                faculty: r.faculty || '',
                preferred_team: r.preferred_team || ''
            };
        });

        // Load members
        const snap = await getDocs(query(collection(db, 'xtn_users'), where('role', '==', 'member')));

        if (snap.empty) {
            list.innerHTML = '<p style="text-align:center;color:#888;">Chưa có chiến sĩ</p>';
            return;
        }

        let html = `<table class="data-table">
            <thead>
                <tr>
                    <th>Họ tên</th>
                    <th>MSSV</th>
                    <th>Khoa/Viện</th>
                    <th>Đội hình</th>
                </tr>
            </thead>
            <tbody>`;

        snap.forEach(d => {
            const u = d.data();
            const reg = regsMap[d.id] || {};

            // Đội hình: ưu tiên team_id đã lưu, nếu chưa có thì lấy preferred_team từ đăng ký
            const currentTeamId = u.team_id || reg.preferred_team || '';

            // Tạo dropdown đội hình
            let teamOptions = '<option value="">-- Chưa phân đội --</option>';
            teamsListCache.forEach(t => {
                const selected = (t.id === currentTeamId) ? 'selected' : '';
                teamOptions += `<option value="${t.id}" ${selected}>${t.name}</option>`;
            });

            html += `<tr>
                <td><strong>${u.name || ''}</strong></td>
                <td>${reg.student_id || '-'}</td>
                <td>${reg.faculty || '-'}</td>
                <td>
                    <select class="member-team-select" data-userid="${d.id}" onchange="updateMemberTeam('${d.id}', this.value)">
                        ${teamOptions}
                    </select>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
    } catch (e) {
        console.error('Load members error:', e);
        list.innerHTML = '<p style="color:red;">Lỗi tải dữ liệu</p>';
    }
}

// Cập nhật đội hình cho chiến sĩ
window.updateMemberTeam = async function (userId, teamId) {
    try {
        await setDoc(doc(db, 'xtn_users', userId), { team_id: teamId }, { merge: true });
        await showAlert('Đã cập nhật đội hình!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Update team error:', e);
        await showAlert('Lỗi cập nhật!', 'error', 'Lỗi');
    }
};

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================
window.approveReg = async (regId, userId) => {
    const confirmed = await showConfirm('Duyệt đơn này?', 'Xác nhận duyệt');
    if (!confirmed) return;
    try {
        await updateDoc(doc(db, 'xtn_registrations', regId), { status: 'approved', reviewed_at: new Date().toISOString() });
        await updateDoc(doc(db, 'xtn_users', userId), { role: 'member' });
        await showAlert('Đã duyệt thành công!', 'success', 'Hoàn thành');
        loadRegistrations();
    } catch (e) {
        console.error('Approve error:', e);
        await showAlert('Lỗi duyệt đơn!', 'error', 'Lỗi');
    }
};

window.rejectReg = async (regId) => {
    const confirmed = await showConfirm('Từ chối đơn này?', 'Xác nhận từ chối');
    if (!confirmed) return;
    try {
        await updateDoc(doc(db, 'xtn_registrations', regId), { status: 'rejected', reviewed_at: new Date().toISOString() });
        await showAlert('Đã từ chối đơn!', 'info', 'Hoàn thành');
        loadRegistrations();
    } catch (e) {
        console.error('Reject error:', e);
        await showAlert('Lỗi từ chối đơn!', 'error', 'Lỗi');
    }
};

window.initTeams = async () => {
    const confirmed = await showConfirm('Khởi tạo 20 đội hình mặc định?', 'Khởi tạo đội');
    if (!confirmed) return;
    try {
        for (let i = 1; i <= 20; i++) {
            await setDoc(doc(db, 'xtn_teams', `doi-${i}`), {
                team_id: `doi-${i}`, team_name: `Đội hình ${i}`,
                admins: { truong: null, pho_1: null, pho_2: null },
                members: [], stats: { total_members: 0 }, created_at: new Date().toISOString()
            }, { merge: true });
        }
        await showAlert('Đã khởi tạo 20 đội!', 'success', 'Hoàn thành');
        loadTeams();
    } catch (e) {
        console.error('Init teams error:', e);
        await showAlert('Lỗi khởi tạo!', 'error', 'Lỗi');
    }
};

// ============================================================
// DEV: ROLE SWITCHER
// ============================================================
async function applyDevRole() {
    const testRole = document.getElementById('dev-role-switch').value;
    if (!testRole) {
        location.reload();
        return;
    }

    if (testRole === 'pending-submitted') {
        userData.role = 'pending';
        setupMenuByRole();
        showSection('section-pending');
    } else if (testRole === 'pending') {
        // Force hiển thị form đăng ký + load teams + questions
        userData.role = 'pending';
        setupMenuByRole();
        await loadTeamsToRegisterForm();
        await loadDynamicQuestionsToForm();
        showSection('section-register');
    } else {
        userData.role = testRole;
        setupMenuByRole();
        showDefaultSection();
    }

    let roleLabel = '';
    switch (testRole) {
        case 'pending': roleLabel = '🔴 pending'; break;
        case 'pending-submitted': roleLabel = '🟡 pending (đã gửi)'; break;
        case 'member': roleLabel = '🟢 member'; break;
        case 'doihinh_admin': roleLabel = '🔵 BCH Đội'; break;
        case 'super_admin': roleLabel = '🟣 BCH Trường'; break;
    }
    document.getElementById('user-name').textContent = userData.name + ' ' + roleLabel;
}

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

        // Đếm số chiến sĩ mỗi đội
        const membersSnap = await getDocs(query(collection(db, 'xtn_users'), where('role', '==', 'member')));
        const teamCounts = {};
        membersSnap.forEach(d => {
            const teamId = d.data().team_id;
            if (teamId) teamCounts[teamId] = (teamCounts[teamId] || 0) + 1;
        });

        let html = `<table class="data-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-teams" onchange="toggleAllTeams(this)"></th>
                    <th>Tên đội</th>
                    <th>Đội trưởng</th>
                    <th>Đội phó</th>
                    <th>Chiến sĩ</th>
                    <th>Hành động</th>
                </tr>
            </thead>
            <tbody>`;

        teamsSnap.forEach(d => {
            const team = d.data();
            const count = teamCounts[d.id] || 0;

            // Get BCH info (support both old and new structure)
            const captainName = team.captain?.name || team.captain_name || '-';
            const captainEmail = team.captain?.email || team.captain_email || '';
            const vice1Name = team.vice1?.name || team.vice_name || '-';
            const vice1Email = team.vice1?.email || team.vice_email || '';
            const vice2Name = team.vice2?.name || '';
            const vice2Email = team.vice2?.email || '';

            // Build vice display
            let viceDisplay = vice1Name;
            if (vice1Email) viceDisplay += `<br><small>${vice1Email}</small>`;
            if (vice2Name && vice2Name !== '-') {
                viceDisplay += `<br>${vice2Name}`;
                if (vice2Email) viceDisplay += `<br><small>${vice2Email}</small>`;
            }
            if (team.extra_vices && team.extra_vices.length > 0) {
                team.extra_vices.forEach(v => {
                    if (v.name) viceDisplay += `<br>${v.name}`;
                });
            }

            html += `<tr>
                <td><input type="checkbox" class="team-checkbox" value="${d.id}" onchange="toggleTeamSelection('${d.id}')"></td>
                <td><strong>${team.team_name || ''}</strong></td>
                <td>${captainName}<br><small>${captainEmail}</small></td>
                <td>${viceDisplay || '-'}</td>
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
    const vice2Name = document.getElementById('team-vice2-name').value.trim();
    const vice2Email = document.getElementById('team-vice2-email').value.trim();

    if (!teamName) return;

    // Collect extra vice captains
    const extraVices = [];
    document.querySelectorAll('.extra-vice-row').forEach(row => {
        const name = row.querySelector('.extra-vice-name')?.value.trim();
        const email = row.querySelector('.extra-vice-email')?.value.trim();
        if (name || email) {
            extraVices.push({ name: name || null, email: email || null });
        }
    });

    try {
        const teamId = editId || 'team_' + Date.now();

        const data = {
            team_name: teamName,
            captain: { name: captainName || null, email: captainEmail || null },
            vice1: { name: vice1Name || null, email: vice1Email || null },
            vice2: { name: vice2Name || null, email: vice2Email || null },
            extra_vices: extraVices,
            updated_at: new Date().toISOString()
        };

        if (!editId) {
            data.created_at = new Date().toISOString();
        }

        await setDoc(doc(db, 'xtn_teams', teamId), data, { merge: true });
        alert('✅ Đã lưu đội thành công!');
        resetTeamForm();
        loadTeams();
        loadTeamsToRegisterForm();
        loadTeamsToQuestionForm();
    } catch (e) {
        console.error('Save team error:', e);
        alert('❌ Lỗi lưu đội!');
    }
}

let extraViceCount = 0;

window.addExtraVice = function () {
    extraViceCount++;
    const container = document.getElementById('extra-vice-container');
    const div = document.createElement('div');
    div.className = 'bch-member extra-vice-row';
    div.innerHTML = `
        <label class="bch-label">Đội phó ${2 + extraViceCount} 
            <button type="button" class="btn btn-danger btn-xs" onclick="this.closest('.extra-vice-row').remove()">&times;</button>
        </label>
        <div class="form-row">
            <div class="form-group">
                <input type="text" class="extra-vice-name" placeholder="Họ và tên">
            </div>
            <div class="form-group">
                <input type="email" class="extra-vice-email" placeholder="Email">
            </div>
        </div>
    `;
    container.appendChild(div);
};

window.editTeam = async function (teamId) {
    try {
        const teamDoc = await getDoc(doc(db, 'xtn_teams', teamId));
        if (!teamDoc.exists()) return;

        const team = teamDoc.data();
        document.getElementById('team-edit-id').value = teamId;
        document.getElementById('team-name').value = team.team_name || '';
        document.getElementById('team-captain-name').value = team.captain?.name || team.captain_name || '';
        document.getElementById('team-captain-email').value = team.captain?.email || team.captain_email || '';
        document.getElementById('team-vice1-name').value = team.vice1?.name || team.vice_name || '';
        document.getElementById('team-vice1-email').value = team.vice1?.email || team.vice_email || '';
        document.getElementById('team-vice2-name').value = team.vice2?.name || '';
        document.getElementById('team-vice2-email').value = team.vice2?.email || '';

        // Load extra vices
        document.getElementById('extra-vice-container').innerHTML = '';
        extraViceCount = 0;
        if (team.extra_vices && team.extra_vices.length > 0) {
            team.extra_vices.forEach(v => {
                addExtraVice();
                const rows = document.querySelectorAll('.extra-vice-row');
                const lastRow = rows[rows.length - 1];
                lastRow.querySelector('.extra-vice-name').value = v.name || '';
                lastRow.querySelector('.extra-vice-email').value = v.email || '';
            });
        }

        document.getElementById('team-form-title').innerHTML = '<i class="fa-solid fa-edit"></i> Sửa đội: ' + (team.team_name || teamId);
        document.querySelector('#team-form').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        console.error('Edit team error:', e);
    }
};

window.resetTeamForm = function () {
    document.getElementById('team-form').reset();
    document.getElementById('team-edit-id').value = '';
    document.getElementById('extra-vice-container').innerHTML = '';
    extraViceCount = 0;
    document.getElementById('team-form-title').innerHTML = '<i class="fa-solid fa-plus"></i> Thêm đội mới';
};

window.deleteTeam = async function (teamId) {
    const confirmed = await showConfirm('Xóa đội này?', 'Xác nhận xóa');
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'xtn_teams', teamId));
        loadTeams();
        loadTeamsToRegisterForm();
        loadTeamsToQuestionForm();
        await showAlert('Đã xóa đội!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Delete team error:', e);
        await showAlert('Lỗi xóa!', 'error', 'Lỗi');
    }
};

window.toggleTeamSelection = function (teamId) {
    if (selectedTeams.has(teamId)) {
        selectedTeams.delete(teamId);
    } else {
        selectedTeams.add(teamId);
    }
    updateTeamsSelectedCount();
};

window.toggleAllTeams = function (checkbox) {
    const checkboxes = document.querySelectorAll('.team-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            selectedTeams.add(cb.value);
        } else {
            selectedTeams.delete(cb.value);
        }
    });
    updateTeamsSelectedCount();
};

function updateTeamsSelectedCount() {
    const count = selectedTeams.size;
    document.getElementById('teams-selected-count').textContent = count;
    document.getElementById('btn-delete-teams').disabled = count === 0;
}

window.deleteSelectedTeams = async function () {
    if (selectedTeams.size === 0) return;
    const confirmed = await showConfirm(`Xóa ${selectedTeams.size} đội đã chọn?`, 'Xóa hàng loạt');
    if (!confirmed) return;

    try {
        for (const teamId of selectedTeams) {
            await deleteDoc(doc(db, 'xtn_teams', teamId));
        }
        selectedTeams.clear();
        loadTeams();
        loadTeamsToRegisterForm();
        loadTeamsToQuestionForm();
        await showAlert('Đã xóa thành công!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Bulk delete error:', e);
        await showAlert('Lỗi xóa hàng loạt!', 'error', 'Lỗi');
    }
};

// Load teams vào form đăng ký
async function loadTeamsToRegisterForm() {
    const select = document.getElementById('reg-team');
    console.log('🏆 loadTeamsToRegisterForm called, select:', select);
    if (!select) return;

    select.innerHTML = '<option value="">-- Chọn đội hình muốn tham gia --</option>';

    try {
        const snap = await getDocs(collection(db, 'xtn_teams'));
        console.log('🏆 Teams loaded:', snap.size);
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

// Load câu hỏi động vào form đăng ký
async function loadDynamicQuestionsToForm(selectedTeamId = null) {
    const container = document.getElementById('reg-dynamic-questions');
    if (!container) return;

    console.log('📋 Loading questions for team:', selectedTeamId || 'ALL (chung)');

    container.innerHTML = '<p style="text-align:center;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải câu hỏi...</p>';

    try {
        const snap = await getDocs(collection(db, 'xtn_questions'));
        container.innerHTML = '';

        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có câu hỏi nào.</p>';
            console.log('⚠️ No questions in Firebase');
            return;
        }

        // Sort by order
        const questions = [];
        snap.forEach(d => questions.push({ id: d.id, ...d.data() }));
        questions.sort((a, b) => (a.order || 1) - (b.order || 1));

        console.log('📋 Total questions:', questions.length);

        let displayedCount = 0;

        questions.forEach(q => {
            // Logic hiển thị:
            // - Câu hỏi chung (!team_id hoặc team_id rỗng) => luôn hiện
            // - Câu hỏi riêng (có team_id) => chỉ hiện khi đội được chọn khớp
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

        console.log('📋 Displayed questions:', displayedCount);

        if (displayedCount === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có câu hỏi nào phù hợp.</p>';
        }
    } catch (e) {
        console.error('Load dynamic questions error:', e);
        container.innerHTML = '<p style="color:red;">Lỗi tải câu hỏi</p>';
    }
}

// Load teams vào form câu hỏi
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
// QUESTIONS CRUD
// ============================================================
let selectedQuestions = new Set();

async function loadQuestions() {
    const container = document.getElementById('questions-list');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#888;">Đang tải...</p>';
    selectedQuestions.clear();
    updateQuestionsSelectedCount();

    // Load teams for form
    loadTeamsToQuestionForm();

    try {
        const snap = await getDocs(collection(db, 'xtn_questions'));
        if (snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#888;">Chưa có câu hỏi động nào.</p>';
            return;
        }

        // Get teams for mapping
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        const teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
        });

        let html = `<table class="data-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-questions" onchange="toggleAllQuestions(this)"></th>
                    <th>#</th>
                    <th>Câu hỏi</th>
                    <th>Đội</th>
                    <th>Bắt buộc</th>
                    <th>Hành động</th>
                </tr>
            </thead>
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
        const data = {
            question: content,
            team_id: teamId || null,
            required: required,
            order: order,
            updated_at: new Date().toISOString()
        };

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
        alert('❌ Lỗi lưu câu hỏi!');
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
        document.querySelector('#question-form').scrollIntoView({ behavior: 'smooth' });
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
    if (selectedQuestions.has(qId)) {
        selectedQuestions.delete(qId);
    } else {
        selectedQuestions.add(qId);
    }
    updateQuestionsSelectedCount();
};

window.toggleAllQuestions = function (checkbox) {
    const checkboxes = document.querySelectorAll('.question-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            selectedQuestions.add(cb.value);
        } else {
            selectedQuestions.delete(cb.value);
        }
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
    if (!confirm(`Xóa ${selectedQuestions.size} câu hỏi đã chọn?`)) return;

    try {
        for (const qId of selectedQuestions) {
            await deleteDoc(doc(db, 'xtn_questions', qId));
        }
        selectedQuestions.clear();
        loadQuestions();
    } catch (e) {
        console.error('Bulk delete questions error:', e);
        alert('❌ Lỗi xóa hàng loạt!');
    }
};

// ============================================================
// DEV ROLE SWITCHER - Chỉ dùng để test
// ============================================================
function applyDevRole() {
    const select = document.getElementById('dev-role-switch');
    if (!select) return;

    const fakeRole = select.value;

    if (!fakeRole) {
        // Giữ role thật - reload lại
        location.reload();
        return;
    }

    // Fake role để test UI
    if (fakeRole === 'pending-submitted') {
        userData.role = 'pending';
        userData._hasSubmitted = true;
    } else {
        userData.role = fakeRole;
        userData._hasSubmitted = false;
    }

    console.log('🔧 DEV: Switched to role:', userData.role);

    // Re-setup menu
    setupMenuByRole();

    // Show appropriate section
    if (userData.role === 'pending') {
        if (userData._hasSubmitted) {
            showSection('section-pending');
        } else {
            showSection('section-register');
        }
    } else {
        showSection('section-dashboard');
    }
}
