/**
 * admin-teams.js - Quản lý Đội hình
 * XTN 2026
 */

import { db } from './firebase.js';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Danh sách 20 đội hình mặc định
const DEFAULT_TEAMS = [
    { id: 'doi-1', name: 'Đội hình 1' },
    { id: 'doi-2', name: 'Đội hình 2' },
    { id: 'doi-3', name: 'Đội hình 3' },
    { id: 'doi-4', name: 'Đội hình 4' },
    { id: 'doi-5', name: 'Đội hình 5' },
    { id: 'doi-6', name: 'Đội hình 6' },
    { id: 'doi-7', name: 'Đội hình 7' },
    { id: 'doi-8', name: 'Đội hình 8' },
    { id: 'doi-9', name: 'Đội hình 9' },
    { id: 'doi-10', name: 'Đội hình 10' },
    { id: 'doi-11', name: 'Đội hình 11' },
    { id: 'doi-12', name: 'Đội hình 12' },
    { id: 'doi-13', name: 'Đội hình 13' },
    { id: 'doi-14', name: 'Đội hình 14' },
    { id: 'doi-15', name: 'Đội hình 15' },
    { id: 'doi-16', name: 'Đội hình 16' },
    { id: 'doi-17', name: 'Đội hình 17' },
    { id: 'doi-18', name: 'Đội hình 18' },
    { id: 'doi-19', name: 'Đội hình 19' },
    { id: 'doi-20', name: 'Đội hình 20' }
];

// Khởi tạo 20 đội hình (chỉ chạy 1 lần)
export async function initializeTeams() {
    for (const team of DEFAULT_TEAMS) {
        await setDoc(doc(db, 'xtn_teams', team.id), {
            team_id: team.id,
            team_name: team.name,
            admins: {
                truong: null,
                pho_1: null,
                pho_2: null
            },
            members: [],
            stats: {
                total_members: 0,
                registered_cards: 0
            },
            zalo_link: '',
            created_at: new Date().toISOString()
        }, { merge: true });
    }
    console.log('✅ Đã khởi tạo 20 đội hình!');
}

// Lấy danh sách đội
export async function getTeams() {
    // Thứ tự đội hình chuẩn
    const TEAM_ORDER = {
        'ban-chi-huy-chien-dich': 0,
        'xuan-tu-hao': 1,
        'xuan-ban-sac': 2,
        'xuan-se-chia': 3,
        'xuan-gan-ket': 4,
        'xuan-chien-si': 5,
        'tet-van-minh': 6,
        'tu-van-giang-day-phap-luat': 7,
        'giai-dieu-mua-xuan': 8,
        'vien-chuc-tre': 9,
        'hau-can': 10,
        'ky-su-tet': 11
    };

    const snapshot = await getDocs(collection(db, 'xtn_teams'));
    const teams = [];
    snapshot.forEach(doc => {
        teams.push({ id: doc.id, ...doc.data() });
    });
    return teams.sort((a, b) => {
        const idA = a.team_id || a.id || '';
        const idB = b.team_id || b.id || '';

        // Sắp xếp theo TEAM_ORDER chuẩn
        const orderA = TEAM_ORDER[idA] ?? 999;
        const orderB = TEAM_ORDER[idB] ?? 999;
        if (orderA !== orderB) return orderA - orderB;

        // Fallback: theo tên
        return (a.team_name || '').localeCompare(b.team_name || '', 'vi');
    });
}

// Cập nhật đội
export async function updateTeam(teamId, data) {
    await updateDoc(doc(db, 'xtn_teams', teamId), data);
}

// Phân công BCH đội
export async function assignTeamAdmin(teamId, position, userId) {
    const updateData = {};
    updateData[`admins.${position}`] = userId;
    await updateDoc(doc(db, 'xtn_teams', teamId), updateData);

    // Cập nhật role của user
    await updateDoc(doc(db, 'xtn_users', userId), {
        role: 'doihinh_admin',
        team_id: teamId,
        team_position: position
    });
}

// Thêm chiến sĩ vào đội
export async function addMemberToTeam(teamId, userId) {
    await updateDoc(doc(db, 'xtn_users', userId), {
        team_id: teamId
    });
}

// Render danh sách đội - Dùng STATIC list thay vì Firebase xtn_teams
export async function renderTeamsTable() {
    try {
        // STATIC 12 đội hình cố định - ĐỒNG BỘ với các file khác
        const STATIC_TEAMS = [
            { id: 'ban-chi-huy-chien-dich', team_name: 'Ban Chỉ huy Chiến dịch' },
            { id: 'xuan-tu-hao', team_name: 'Đội hình Xuân tự hào' },
            { id: 'xuan-ban-sac', team_name: 'Đội hình Xuân bản sắc' },
            { id: 'xuan-se-chia', team_name: 'Đội hình Xuân sẻ chia' },
            { id: 'xuan-gan-ket', team_name: 'Đội hình Xuân gắn kết' },
            { id: 'xuan-chien-si', team_name: 'Đội hình Xuân chiến sĩ' },
            { id: 'tet-van-minh', team_name: 'Đội hình Tết văn minh' },
            { id: 'tu-van-giang-day-phap-luat', team_name: 'Đội hình Tư vấn và giảng dạy pháp luật cộng đồng' },
            { id: 'giai-dieu-mua-xuan', team_name: 'Đội hình Giai điệu mùa xuân' },
            { id: 'vien-chuc-tre', team_name: 'Đội hình Viên chức trẻ' },
            { id: 'hau-can', team_name: 'Đội hình Hậu cần' },
            { id: 'ky-su-tet', team_name: 'Đội hình Ký sự Tết' }
        ];

        // Lấy tất cả users để tìm Đội trưởng, Đội phó và đếm số thành viên
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        const users = [];
        usersSnap.forEach(doc => {
            const data = doc.data();
            // Chỉ đếm members đã approved (không pending, không deleted)
            if (data.role !== 'pending' && !data.deleted) {
                users.push({ id: doc.id, ...data });
            }
        });

        console.log('[Teams] Total approved users:', users.length);

        // Lấy tất cả hoạt động để đếm
        const activitiesSnap = await getDocs(collection(db, 'xtn_activities'));
        const activities = [];
        activitiesSnap.forEach(doc => activities.push({ id: doc.id, ...doc.data() }));

        let html = `
            <div style="overflow-x:auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:40px;"><input type="checkbox" id="select-all-teams" onchange="toggleAllTeams(this.checked)"></th>
                        <th>Tên đội hình</th>
                        <th>Đội trưởng</th>
                        <th>Đội phó</th>
                        <th style="text-align:center;">Số Chiến sĩ</th>
                        <th style="text-align:center;">Số hoạt động</th>
                        <th style="width:80px;">Thao tác</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const team of STATIC_TEAMS) {
            // team.id là slug như 'ky-su-tet'
            const teamId = team.id;
            const teamName = team.team_name || '';

            // Tìm Đội trưởng và Đội phó từ users 
            const teamMembers = users.filter(u => u.team_id === teamId);
            const doiTruong = teamMembers.find(u => u.position === 'Đội trưởng');
            const doiPhoList = teamMembers.filter(u => u.position === 'Đội phó');
            const chienSiCount = teamMembers.length;

            // Đếm hoạt động của đội này - check cả team_id VÀ team_name
            const activityCount = activities.filter(a =>
                a.team === teamName ||
                a.team === teamId ||
                a.team_id === teamId ||
                (teamName && a.team && a.team.includes(teamName.replace('Đội hình ', '')))
            ).length;

            // Format đội trưởng với badge đẹp
            const doiTruongHtml = doiTruong
                ? `<span class="leader-badge truong">${doiTruong.name}</span>`
                : '<span style="color:#ccc;">-</span>';

            // Format đội phó (có thể nhiều) với badge
            const doiPhoHtml = doiPhoList.length > 0
                ? doiPhoList.map(u => `<span class="leader-badge pho">${u.name}</span>`).join(' ')
                : '<span style="color:#ccc;">-</span>';

            html += `
                <tr data-id="${team.id}">
                    <td><input type="checkbox" class="team-checkbox" data-id="${team.id}" onchange="toggleTeamSelection('${team.id}')"></td>
                    <td><strong>${team.team_name}</strong></td>
                    <td>${doiTruongHtml}</td>
                    <td>${doiPhoHtml}</td>
                    <td style="text-align:center;"><span class="badge-count">${chienSiCount}</span></td>
                    <td style="text-align:center;"><span class="badge-count activity">${activityCount}</span></td>
                    <td>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-sm btn-secondary" onclick="editTeam('${team.id}')" title="Sửa" style="padding:6px 10px;">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="deleteTeam('${team.id}')" title="Xóa" style="padding:6px 10px;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        html += `<p style="margin-top:10px; color:#666; font-size:13px;">Tổng: <strong>${STATIC_TEAMS.length}</strong> đội hình</p>`;

        // Add CSS for badges
        html += `
            <style>
                .badge-count {
                    display: inline-block;
                    min-width: 28px;
                    padding: 4px 10px;
                    background: linear-gradient(135deg, #3b82f6, #60a5fa);
                    color: white;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 13px;
                }
                .badge-count.activity {
                    background: linear-gradient(135deg, #f59e0b, #fbbf24);
                }
                .leader-badge {
                    display: inline-block;
                    padding: 6px 14px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    margin: 3px 4px 3px 0;
                    white-space: nowrap;
                }
                .leader-badge.truong {
                    background: linear-gradient(135deg, #d1fae5, #a7f3d0);
                    color: #065f46;
                    border: 1.5px solid #6ee7b7;
                    box-shadow: 0 1px 3px rgba(16, 185, 129, 0.15);
                }
                .leader-badge.pho {
                    background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
                    color: #3730a3;
                    border: 1.5px solid #a5b4fc;
                    box-shadow: 0 1px 3px rgba(99, 102, 241, 0.15);
                }
            </style>
        `;

        return html;
    } catch (error) {
        console.error('renderTeamsTable error:', error);
        return '<p style="color:red;">Lỗi tải danh sách đội hình</p>';
    }
}

// Export for global access
window.initializeTeams = initializeTeams;

// Selection state
let selectedTeams = new Set();

// Toggle single team selection
window.toggleTeamSelection = function (teamId) {
    if (selectedTeams.has(teamId)) {
        selectedTeams.delete(teamId);
    } else {
        selectedTeams.add(teamId);
    }
    updateTeamSelectionUI();
};

// Toggle all teams
window.toggleAllTeams = function (checked) {
    selectedTeams.clear();
    document.querySelectorAll('.team-checkbox').forEach(cb => {
        cb.checked = checked;
        if (checked) selectedTeams.add(cb.dataset.id);
    });
    updateTeamSelectionUI();
};

function updateTeamSelectionUI() {
    const countEl = document.getElementById('teams-selected-count');
    const btn = document.getElementById('btn-delete-teams');
    if (countEl) countEl.textContent = selectedTeams.size;
    if (btn) btn.disabled = selectedTeams.size === 0;
}

// Open modal for Add or Edit
window.openTeamModal = async function (teamId = null) {
    document.getElementById('team-modal')?.remove();

    let title = 'Thêm Đội hình mới';
    let nameValue = '';
    let btnLabel = 'Lưu';
    let icon = 'plus';

    let zaloLinkValue = '';

    if (teamId) {
        title = 'Sửa Đội hình';
        btnLabel = 'Cập nhật';
        icon = 'pen';
        try {
            const docSnap = await getDoc(doc(db, 'xtn_teams', teamId));
            if (docSnap.exists()) {
                const data = docSnap.data();
                nameValue = data.team_name || data.name || '';
                zaloLinkValue = data.zalo_link || '';
            }
        } catch (e) {
            console.error(e);
            showToast('Lỗi tải dữ liệu đội hình', 'error');
            return;
        }
    }

    const modalHtml = `
        <div class="activity-modal active" id="team-modal" style="z-index:99999;">
            <div class="activity-modal-content" style="max-width:400px; margin-top:100px;">
                <div class="activity-modal-header">
                    <h3><i class="fa-solid fa-${icon}"></i> ${title}</h3>
                    <button class="close-btn" onclick="document.getElementById('team-modal')?.remove()">&times;</button>
                </div>
                <div class="activity-modal-body">
                    <input type="hidden" id="editing-team-id" value="${teamId || ''}">
                    <div class="form-group">
                        <label>Tên đội hình <span class="required">*</span></label>
                        <input type="text" id="new-team-name" required placeholder="VD: Đội hình Xuân sẻ chia" value="${nameValue}">
                    </div>
                    
                    <div class="form-group">
                        <label>Link nhóm Zalo</label>
                        <input type="text" id="new-team-zalo" placeholder="https://zalo.me/g/..." value="${zaloLinkValue}">
                    </div>
                    
                    <div style="margin-top:15px; padding:12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; font-size:13px; color:#0369a1;">
                        <i class="fa-solid fa-circle-info"></i> 
                        <strong>Lưu ý:</strong> Đội trưởng và Đội phó sẽ được <u>cập nhật tự động</u> khi bạn phân công chức vụ ở mục "Quản lý Chiến sĩ".
                    </div>
                </div>
                <div class="activity-modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('team-modal')?.remove()">Hủy</button>
                    <button class="btn btn-primary" onclick="saveTeam()">
                        <i class="fa-solid fa-save"></i> ${btnLabel}
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('new-team-name')?.focus();
};

// Aliases for compatibility
window.openAddTeamModal = function () {
    openTeamModal(null);
};

window.editTeam = function (teamId) {
    openTeamModal(teamId);
};

// Unified Save Function
window.saveTeam = async function () {
    const teamId = document.getElementById('editing-team-id').value;
    const nameInput = document.getElementById('new-team-name');
    const name = nameInput?.value.trim();
    const zaloLink = document.getElementById('new-team-zalo')?.value.trim();

    if (!name) {
        showToast('Vui lòng nhập tên đội hình!', 'warning');
        return;
    }

    const btn = document.querySelector('#team-modal .btn-primary');
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

    try {
        if (teamId) {
            // Update existing
            await updateDoc(doc(db, 'xtn_teams', teamId), {
                team_name: name,
                zalo_link: zaloLink
            });
            showToast('Đã cập nhật đội hình!', 'success');
        } else {
            // Create new
            const newId = 'team-' + Date.now();
            await setDoc(doc(db, 'xtn_teams', newId), {
                team_id: newId,
                team_name: name,
                zalo_link: zaloLink,
                created_at: new Date().toISOString(),
                admins: { truong: null, pho_1: null, pho_2: null },
                members: [],
                stats: { total_members: 0 }
            });
            showToast('Đã thêm đội hình mới!', 'success');
        }

        document.getElementById('team-modal')?.remove();

        // Refresh table
        const list = document.getElementById('teams-list');
        if (list) {
            list.innerHTML = await renderTeamsTable();
        }
    } catch (error) {
        console.error('Save team error:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    }
};

// Delete single team
window.deleteTeam = async function (teamId) {
    const confirmed = await showConfirmModal('Bạn có chắc muốn xóa đội hình này?', { title: 'Xóa đội hình', type: 'danger', confirmText: 'Xóa' });
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'xtn_teams', teamId));
        showToast('Đã xóa đội hình', 'success');

        // Refresh table
        const list = document.getElementById('teams-list');
        if (list) {
            list.innerHTML = await renderTeamsTable();
        }
    } catch (error) {
        console.error('Delete team error:', error);
        showToast('Lỗi: ' + error.message, 'error');
    }
};

// Delete selected teams
window.deleteSelectedTeams = async function () {
    if (selectedTeams.size === 0) return;
    const confirmed = await showConfirmModal(`Bạn có chắc muốn xóa ${selectedTeams.size} đội hình?`, { title: 'Xóa nhiều đội', type: 'danger', confirmText: 'Xóa tất cả' });
    if (!confirmed) return;

    try {
        for (const teamId of selectedTeams) {
            await deleteDoc(doc(db, 'xtn_teams', teamId));
        }
        selectedTeams.clear();
        updateTeamSelectionUI();

        showToast('Đã xóa các đội hình đã chọn', 'success');

        // Refresh table
        const list = document.getElementById('teams-list');
        if (list) {
            list.innerHTML = await renderTeamsTable();
        }
    } catch (error) {
        console.error('Delete teams error:', error);
        showToast('Lỗi: ' + error.message, 'error');
    }
};

