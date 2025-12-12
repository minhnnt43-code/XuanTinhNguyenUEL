/**
 * dashboard-registrations.js - Registrations Management Module
 * XTN 2026
 */

import { db } from './firebase.js';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// STATE
// ============================================================
let selectedRegs = new Set();
let showAlertFn = (msg) => alert(msg);
let showConfirmFn = async (msg) => confirm(msg);
let currentUser = null;

export function setHelpers(alertFn, confirmFn) {
    showAlertFn = alertFn;
    showConfirmFn = confirmFn;
}

export function setCurrentUser(user) {
    currentUser = user;
}

// ============================================================
// REGISTER FORM
// ============================================================
export async function handleRegister(e, showSectionFn) {
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

        await showAlertFn('Đăng ký thành công! Vui lòng chờ BCH duyệt.', 'success', '🎉 Hoàn thành');
        showSectionFn('section-pending');

    } catch (error) {
        console.error(error);
        await showAlertFn('Lỗi! Vui lòng thử lại.', 'error', 'Lỗi');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi đăng ký';
    }
}

// ============================================================
// LOAD REGISTRATIONS
// ============================================================
export async function loadRegistrations() {
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

// ============================================================
// VIEW REGISTRATION
// ============================================================
export async function viewRegistration(regId) {
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
}

// ============================================================
// SAVE REGISTRATION
// ============================================================
export async function saveRegistration(regId) {
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

                await setDoc(doc(db, 'xtn_users', userId), {
                    role: 'member',
                    team_id: preferredTeam
                }, { merge: true });
            }
        }

        await showAlertFn('Đã lưu thành công!', 'success', 'Hoàn thành');
        closeRegistrationModal();
        loadRegistrations();
    } catch (e) {
        console.error('Save registration error:', e);
        await showAlertFn('Lỗi lưu!', 'error', 'Lỗi');
    }
}

export function closeRegistrationModal() {
    document.getElementById('modal-registration').style.display = 'none';
}

// ============================================================
// BULK DELETE
// ============================================================
export function toggleRegSelection(regId) {
    if (selectedRegs.has(regId)) {
        selectedRegs.delete(regId);
    } else {
        selectedRegs.add(regId);
    }
    updateRegsSelectedCount();
}

export function toggleAllRegs(checkbox) {
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
}

function updateRegsSelectedCount() {
    const countEl = document.getElementById('regs-selected-count');
    const btnEl = document.getElementById('btn-delete-regs');
    if (countEl) countEl.textContent = selectedRegs.size;
    if (btnEl) btnEl.disabled = selectedRegs.size === 0;
}

export async function deleteSelectedRegs() {
    if (selectedRegs.size === 0) return;
    const confirmed = await showConfirmFn(`Xóa ${selectedRegs.size} đơn đăng ký đã chọn?`, 'Xóa hàng loạt');
    if (!confirmed) return;

    try {
        for (const regId of selectedRegs) {
            await deleteDoc(doc(db, 'xtn_registrations', regId));
        }
        selectedRegs.clear();
        loadRegistrations();
        await showAlertFn('Đã xóa thành công!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Bulk delete regs error:', e);
        await showAlertFn('Lỗi xóa hàng loạt!', 'error', 'Lỗi');
    }
}

export async function deleteRegistration(regId) {
    const confirmed = await showConfirmFn('Xóa đơn đăng ký này?', 'Xác nhận xóa');
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'xtn_registrations', regId));
        loadRegistrations();
        await showAlertFn('Đã xóa đơn đăng ký!', 'success', 'Hoàn thành');
    } catch (e) {
        console.error('Delete reg error:', e);
        await showAlertFn('Lỗi xóa!', 'error', 'Lỗi');
    }
}
