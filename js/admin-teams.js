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
    const snapshot = await getDocs(collection(db, 'xtn_teams'));
    const teams = [];
    snapshot.forEach(doc => {
        teams.push({ id: doc.id, ...doc.data() });
    });
    return teams.sort((a, b) => {
        const idA = a.team_id || a.id || '';
        const idB = b.team_id || b.id || '';

        // Check if both are default format "doi-X"
        if (idA.startsWith('doi-') && idB.startsWith('doi-')) {
            const numA = parseInt(idA.replace('doi-', '')) || 0;
            const numB = parseInt(idB.replace('doi-', '')) || 0;
            return numA - numB;
        }

        // Otherwise sort by created_at desc (newest first) or name
        if (a.created_at && b.created_at) {
            return new Date(b.created_at) - new Date(a.created_at);
        }

        return (a.team_name || '').localeCompare(b.team_name || '');
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

// Render danh sách đội - Thiết kế mới với đầy đủ thông tin
export async function renderTeamsTable() {
    try {
        const teams = await getTeams();

        // Lấy tất cả users để tìm Đội trưởng, Đội phó và đếm số thành viên
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        const users = [];
        usersSnap.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

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

        for (const team of teams) {
            // Tìm Đội trưởng và Đội phó từ users
            const teamMembers = users.filter(u => u.team_id === team.id);
            const doiTruong = teamMembers.find(u => u.position === 'Đội trưởng');
            const doiPhoList = teamMembers.filter(u => u.position === 'Đội phó');
            const chienSiCount = teamMembers.length;

            // Đếm hoạt động của đội này
            const activityCount = activities.filter(a => a.team === team.team_name).length;

            // Format đội phó (có thể nhiều)
            const doiPhoNames = doiPhoList.map(u => u.name).join(', ') || '<span style="color:#999;">-</span>';

            html += `
                <tr data-id="${team.id}">
                    <td><input type="checkbox" class="team-checkbox" data-id="${team.id}" onchange="toggleTeamSelection('${team.id}')"></td>
                    <td><strong>${team.team_name}</strong></td>
                    <td>${doiTruong ? `<span style="color:#16a34a; font-weight:500;">${doiTruong.name}</span>` : '<span style="color:#999;">-</span>'}</td>
                    <td>${doiPhoNames}</td>
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
        html += `<p style="margin-top:10px; color:#666; font-size:13px;">Tổng: <strong>${teams.length}</strong> đội hình</p>`;

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

