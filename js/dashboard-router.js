/**
 * dashboard-router.js - Điều hướng Dashboard theo Role
 * XTN 2026
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Lấy thông tin người dùng từ Firestore
async function getUserData(uid) {
    const userDoc = await getDoc(doc(db, "xtn_users", uid));
    return userDoc.exists() ? userDoc.data() : null;
}

// Điều hướng theo role
function routeByRole(role, teamId) {
    switch (role) {
        case 'pending':
            // Chưa được duyệt → Form đăng ký
            window.location.href = 'register.html';
            break;

        case 'member':
            // Chiến sĩ → Hiện menu Avatar + Thẻ
            showMemberDashboard();
            break;

        case 'doihinh_admin':
            // BCH Đội hình → Trang quản trị đội
            window.location.href = 'admin-panel.html?scope=team&team=' + teamId;
            break;

        case 'super_admin':
            // BCH Trường → Trang quản trị toàn bộ
            window.location.href = 'admin-panel.html?scope=all';
            break;

        default:
            window.location.href = 'login.html';
    }
}

// Hiện dashboard cho member
function showMemberDashboard() {
    const content = document.getElementById('dashboard-content');
    if (!content) return;

    content.innerHTML = `
        <div class="member-menu">
            <h2>Chào mừng bạn đến XTN 2026!</h2>
            <p>Chọn chức năng bên dưới:</p>
            <div class="menu-cards">
                <a href="create-avatar.html" class="menu-card">
                    <i class="fa-solid fa-image"></i>
                    <h3>Tạo Avatar</h3>
                    <p>Tạo ảnh đại diện với khung XTN</p>
                </a>
                <a href="create-card.html" class="menu-card">
                    <i class="fa-solid fa-id-card"></i>
                    <h3>Tạo Thẻ Chiến Sĩ</h3>
                    <p>Tạo thẻ chiến sĩ tình nguyện</p>
                </a>
            </div>
        </div>
    `;
}

// Khởi tạo Dashboard
export function initDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userData = await getUserData(user.uid);

            if (userData) {
                // Hiện thông tin user
                const userInfo = document.getElementById('user-info');
                if (userInfo) {
                    userInfo.innerHTML = `
                        <span>${userData.name || user.displayName}</span>
                        <span class="badge badge-${userData.role}">${userData.role}</span>
                    `;
                }

                // Điều hướng theo role
                routeByRole(userData.role, userData.team_id);
            } else {
                // User mới → pending
                routeByRole('pending', null);
            }
        } else {
            // Chưa đăng nhập
            window.location.href = 'login.html';
        }
    });
}

// Auto init khi load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
