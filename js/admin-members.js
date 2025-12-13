/**
 * admin-members.js - Quản lý chiến sĩ
 * XTN 2026
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, updateDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;
let currentUserData = null;

// Khởi tạo Admin Panel
export async function initAdminMembers() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        currentUser = user;
        const userDoc = await getDoc(doc(db, "xtn_users", user.uid));

        if (!userDoc.exists()) {
            window.location.href = 'dashboard.html';
            return;
        }

        currentUserData = userDoc.data();

        // Kiểm tra quyền admin
        if (!['doihinh_admin', 'super_admin'].includes(currentUserData.role)) {
            window.location.href = 'dashboard.html';
            return;
        }

        // Hiện thông tin user
        renderUserInfo();

        // Render sidebar menu
        renderSidebarMenu();

        // Load đơn đăng ký chờ duyệt
        loadPendingRegistrations();
    });
}

// Hiện thông tin user
function renderUserInfo() {
    const infoEl = document.getElementById('admin-user-info');
    if (infoEl) {
        infoEl.innerHTML = `
            <span>${currentUserData.name}</span>
            <span class="badge badge-admin">${currentUserData.role === 'super_admin' ? 'BCH Trường' : 'BCH Đội hình'}</span>
        `;
    }
}

// Render menu sidebar
function renderSidebarMenu() {
    const menuEl = document.getElementById('sidebar-menu');
    if (!menuEl) return;

    let menuItems = '';

    if (currentUserData.role === 'super_admin') {
        menuItems = `
            <div class="menu-item active" data-page="dashboard">
                <i class="fa-solid fa-gauge"></i> Dashboard
            </div>
            <div class="menu-item" data-page="registrations">
                <i class="fa-solid fa-user-plus"></i> Đơn đăng ký
            </div>
            <div class="menu-item" data-page="members">
                <i class="fa-solid fa-users"></i> Chiến sĩ
            </div>
            <div class="menu-item" data-page="teams">
                <i class="fa-solid fa-people-group"></i> Đội hình
            </div>
            <div class="menu-item" data-page="gallery">
                <i class="fa-solid fa-images"></i> Gallery
            </div>
            <div class="menu-item" data-page="settings">
                <i class="fa-solid fa-gear"></i> Cài đặt
            </div>
        `;
    } else {
        menuItems = `
            <div class="menu-item active" data-page="stats">
                <i class="fa-solid fa-chart-simple"></i> Thống kê đội
            </div>
            <div class="menu-item" data-page="team-members">
                <i class="fa-solid fa-users"></i> Chiến sĩ đội
            </div>
            <div class="menu-item" data-page="reports">
                <i class="fa-solid fa-file-alt"></i> Báo cáo
            </div>
        `;
    }

    menuEl.innerHTML = menuItems;

    // Menu click events
    menuEl.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            menuEl.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            loadPage(item.dataset.page);
        });
    });
}

// Load page
function loadPage(page) {
    document.getElementById('page-title').textContent = getPageTitle(page);

    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'registrations':
            loadPendingRegistrations();
            break;
        case 'members':
            loadMembers();
            break;
        case 'teams':
            loadTeams();
            break;
        default:
            document.getElementById('admin-content').innerHTML = '<div class="alert alert-info"><i class="fa-solid fa-wrench"></i> Đang phát triển...</div>';
    }
}

function getPageTitle(page) {
    const titles = {
        'dashboard': 'Dashboard',
        'registrations': 'Đơn đăng ký',
        'members': 'Quản lý Chiến sĩ',
        'teams': 'Quản lý Đội hình',
        'gallery': 'Gallery',
        'settings': 'Cài đặt',
        'stats': 'Thống kê Đội',
        'team-members': 'Chiến sĩ trong Đội',
        'reports': 'Báo cáo'
    };
    return titles[page] || 'Admin';
}

// Load dashboard
async function loadDashboard() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải...</div>';

    try {
        // Đếm số liệu
        const usersSnapshot = await getDocs(collection(db, 'xtn_users'));
        const registrationsSnapshot = await getDocs(query(collection(db, 'xtn_registrations'), where('status', '==', 'pending')));

        let totalMembers = 0;
        usersSnapshot.forEach(doc => {
            if (doc.data().role === 'member') totalMembers++;
        });

        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <i class="fa-solid fa-users"></i>
                    <h3>${totalMembers}</h3>
                    <p>Chiến sĩ</p>
                </div>
                <div class="stat-card">
                    <i class="fa-solid fa-user-clock"></i>
                    <h3>${registrationsSnapshot.size}</h3>
                    <p>Đơn chờ duyệt</p>
                </div>
                <div class="stat-card">
                    <i class="fa-solid fa-people-group"></i>
                    <h3>20</h3>
                    <p>Đội hình</p>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = '<div class="alert alert-danger">Lỗi tải dữ liệu</div>';
    }
}

// Load đơn đăng ký
async function loadPendingRegistrations() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải...</div>';

    try {
        const q = query(collection(db, 'xtn_registrations'), where('status', '==', 'pending'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            content.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Không có đơn đăng ký mới</p></div>';
            return;
        }

        let tableRows = '';
        snapshot.forEach(docSnap => {
            const r = docSnap.data();
            tableRows += `
                <tr>
                    <td>${r.full_name}</td>
                    <td>${r.student_id}</td>
                    <td>${r.faculty}</td>
                    <td>${r.phone}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="approveRegistration('${docSnap.id}', '${r.user_id}')">
                            <i class="fa-solid fa-check"></i> Duyệt
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="rejectRegistration('${docSnap.id}')">
                            <i class="fa-solid fa-xmark"></i> Từ chối
                        </button>
                    </td>
                </tr>
            `;
        });

        content.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Họ tên</th>
                        <th>MSSV</th>
                        <th>Khoa</th>
                        <th>SĐT</th>
                        <th>Thao tác</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
    } catch (error) {
        console.error(error);
        content.innerHTML = '<div class="alert alert-danger">Lỗi tải dữ liệu</div>';
    }
}

// Load danh sách chiến sĩ
async function loadMembers() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải...</div>';

    try {
        const q = query(collection(db, 'xtn_users'), where('role', '==', 'member'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            content.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users"></i><p>Chưa có chiến sĩ được duyệt</p></div>';
            return;
        }

        let tableRows = '';
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            tableRows += `
                <tr>
                    <td>${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.team_id || 'Chưa phân đội'}</td>
                    <td><span class="badge badge-member">Chiến sĩ</span></td>
                </tr>
            `;
        });

        content.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Họ tên</th>
                        <th>Email</th>
                        <th>Đội</th>
                        <th>Trạng thái</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
    } catch (error) {
        console.error(error);
        content.innerHTML = '<div class="alert alert-danger">Lỗi tải dữ liệu</div>';
    }
}

// Load đội hình
async function loadTeams() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải...</div>';

    try {
        const snapshot = await getDocs(collection(db, 'xtn_teams'));

        let teams = [];
        if (snapshot.empty) {
            // Chưa có đội → hiện danh sách mặc định
            for (let i = 1; i <= 20; i++) {
                teams.push({ id: `doi-${i}`, name: `Đội hình ${i}`, members: 0 });
            }
        } else {
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                teams.push({
                    id: docSnap.id,
                    name: data.team_name || `Đội hình ${docSnap.id.replace('doi-', '')}`,
                    members: data.stats?.total_members || 0
                });
            });
            // Sort by team number
            teams.sort((a, b) => {
                const numA = parseInt(a.id.replace('doi-', ''));
                const numB = parseInt(b.id.replace('doi-', ''));
                return numA - numB;
            });
        }

        let tableRows = '';
        for (const team of teams) {
            tableRows += `
                <tr>
                    <td>${team.id}</td>
                    <td><input type="text" class="team-name-input" data-id="${team.id}" value="${team.name}" /></td>
                    <td>${team.members}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="saveTeamName('${team.id}')">
                            <i class="fa-solid fa-save"></i>
                        </button>
                    </td>
                </tr>
            `;
        }

        content.innerHTML = `
            <div class="alert alert-info">
                <i class="fa-solid fa-info-circle"></i>
                Đổi tên đội và click nút lưu. Tên đội có thể được cập nhật sau.
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Tên đội</th>
                        <th>Số chiến sĩ</th>
                        <th>Lưu</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
            <div style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="initializeAllTeams()">
                    <i class="fa-solid fa-database"></i> Khởi tạo 20 đội vào Firestore
                </button>
            </div>
        `;
    } catch (error) {
        console.error(error);
        content.innerHTML = '<div class="alert alert-danger">Lỗi tải dữ liệu</div>';
    }
}

// Duyệt đơn đăng ký
window.approveRegistration = async function (regId, userId) {
    const confirmed = await showConfirmModal('Duyệt đơn đăng ký này?', { title: 'Xác nhận', type: 'info', confirmText: 'Duyệt' });
    if (!confirmed) return;

    try {
        // Cập nhật đơn
        await updateDoc(doc(db, 'xtn_registrations', regId), {
            status: 'approved',
            reviewed_by: currentUser.uid,
            reviewed_at: new Date().toISOString()
        });

        // Cập nhật user role
        await updateDoc(doc(db, 'xtn_users', userId), {
            role: 'member'
        });

        showToast('Đã duyệt thành công!', 'success');
        loadPendingRegistrations();
    } catch (error) {
        console.error(error);
        showToast('Có lỗi xảy ra!', 'error');
    }
};

// Từ chối đơn
window.rejectRegistration = async function (regId) {
    const confirmed = await showConfirmModal('Từ chối đơn đăng ký này?', { title: 'Từ chối', type: 'warning', confirmText: 'Từ chối' });
    if (!confirmed) return;

    try {
        await updateDoc(doc(db, 'xtn_registrations', regId), {
            status: 'rejected',
            reviewed_by: currentUser.uid,
            reviewed_at: new Date().toISOString()
        });

        showToast('Đã từ chối đơn đăng ký.', 'success');
        loadPendingRegistrations();
    } catch (error) {
        console.error(error);
        showToast('Có lỗi xảy ra!', 'error');
    }
};

// Lưu tên đội
window.saveTeamName = async function (teamId) {
    const input = document.querySelector(`.team-name-input[data-id="${teamId}"]`);
    if (!input) return;

    const newName = input.value.trim();
    if (!newName) {
        showToast('Tên đội không được để trống', 'warning');
        return;
    }

    try {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        await setDoc(doc(db, 'xtn_teams', teamId), {
            team_id: teamId,
            team_name: newName
        }, { merge: true });

        showToast('Đã lưu tên đội!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Lỗi lưu tên đội!', 'error');
    }
};

// Khởi tạo 20 đội vào Firestore
window.initializeAllTeams = async function () {
    const confirmed = await showConfirmModal('Khởi tạo 20 đội vào Firestore?', { title: 'Khởi tạo', type: 'info', confirmText: 'Khởi tạo' });
    if (!confirmed) return;

    try {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

        for (let i = 1; i <= 20; i++) {
            await setDoc(doc(db, 'xtn_teams', `doi-${i}`), {
                team_id: `doi-${i}`,
                team_name: `Đội hình ${i}`,
                admins: { truong: null, pho_1: null, pho_2: null },
                members: [],
                stats: { total_members: 0, registered_cards: 0 },
                created_at: new Date().toISOString()
            }, { merge: true });
        }

        showToast('Đã khởi tạo 20 đội!', 'success');
        loadTeams();
    } catch (error) {
        console.error(error);
        showToast('Lỗi khởi tạo!', 'error');
    }
};

// Logout
document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
    await signOut(auth);
    window.location.href = 'login.html';
});

// Init khi DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminMembers);
} else {
    initAdminMembers();
}
