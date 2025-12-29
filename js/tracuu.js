/**
 * tracuu.js - Tra Cứu Kết Quả Logic
 * XTN 2026
 */

import { db } from './firebase.js';
import { collection, query, where, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { log as activityLog } from './activity-logger.js';

// Messages
const PASS_MESSAGE = `Chúc mừng bạn đã chính thức trở thành Chiến sĩ của <strong>{{TEAM_NAME}}</strong>! 
Hành trình Xuân Tình Nguyện UEL 2026 đang chờ đón bạn. Hãy tham gia ngay nhóm Zalo để cập nhật những thông tin mới nhất nhé!`;

const FAIL_MESSAGE = `Ban Chỉ huy Chiến dịch Xuân Tình Nguyện UEL 2026 rất cảm ơn sự quan tâm và tình cảm mà bạn đã dành cho chiến dịch. Dù chưa thể đồng hành cùng nhau trong màu áo chiến sĩ năm nay, nhưng hy vọng bạn vẫn sẽ giữ vững ngọn lửa nhiệt huyết ấy đối với các hoạt động của Đoàn - Hội Trường. Chúc bạn một năm mới bình an, hạnh phúc và hẹn gặp lại bạn ở các hoạt động sau! ❤️`;

// Main search function
async function traCuu() {
    const input = document.getElementById('mssv-input');
    const resultArea = document.getElementById('result-area');
    const loading = document.getElementById('loading');
    const btn = document.getElementById('btn-search');

    const mssv = input.value.trim().toUpperCase();

    if (!mssv) {
        showToast('Vui lòng nhập MSSV!', 'warning');
        input.focus();
        return;
    }

    // Validate MSSV format: must be 10 characters, start with K
    if (mssv.length !== 10 || !mssv.startsWith('K')) {
        showErrorResult(resultArea, 'Mã số sinh viên không hợp lệ!', 'MSSV phải có đúng 10 ký tự và bắt đầu bằng chữ K.<br>Ví dụ: K235042524');
        input.focus();
        input.select();
        return;
    }

    // Show loading
    loading.classList.remove('hidden');
    resultArea.classList.add('hidden');
    btn.disabled = true;

    try {
        // Query user by MSSV
        const usersRef = collection(db, 'xtn_users');
        const q = query(usersRef, where('mssv', '==', mssv));
        const snapshot = await getDocs(q);

        let found = false;
        if (snapshot.empty) {
            // Not found
            showFailResult(resultArea);
        } else {
            // Found - check if is member
            const userData = snapshot.docs[0].data();
            const role = userData.role || 'pending';

            if (role === 'pending') {
                // Still pending, treat as not passed
                showFailResult(resultArea);
            } else {
                // Passed! Get team info
                const teamId = userData.team_id;
                let teamName = 'Xuân Tình Nguyện';
                let zaloLink = '';

                if (teamId) {
                    try {
                        const teamDoc = await getDoc(doc(db, 'xtn_teams', teamId));
                        if (teamDoc.exists()) {
                            const teamData = teamDoc.data();
                            teamName = teamData.team_name || teamName;
                            zaloLink = teamData.zalo_link || '';
                        }
                    } catch (e) {
                        console.warn('Could not fetch team:', e);
                    }
                }

                showSuccessResult(resultArea, userData.name, userData.position || 'Chiến sĩ', teamName, zaloLink);
                found = true;
            }
        }

        // Log search activity
        activityLog.search(mssv, found);
    } catch (error) {
        console.error('Search error:', error);
        showToast('Đã xảy ra lỗi khi tra cứu. Vui lòng thử lại!', 'error');
    } finally {
        loading.classList.add('hidden');
        btn.disabled = false;
    }
}

function showSuccessResult(container, name, position, teamName, zaloLink) {
    // Trigger confetti
    if (window.confetti) {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
    }

    const message = PASS_MESSAGE.replace('{{TEAM_NAME}}', teamName);

    let zaloButton = '';
    if (zaloLink) {
        zaloButton = `
            <a href="${zaloLink}" target="_blank" class="zalo-btn">
                <i class="fa-solid fa-comments"></i>
                Tham gia nhóm Zalo ${teamName}
            </a>
        `;
    }

    container.innerHTML = `
        <div class="result-card success">
            <div class="result-icon">
                <i class="fa-solid fa-check"></i>
            </div>
            <h2 class="result-title">🎉 Chúc mừng ${name}!</h2>
            <p class="result-message">${message}</p>
            <div class="team-name">
                <i class="fa-solid fa-users"></i> ${teamName} - ${position}
            </div>
            ${zaloButton}
        </div>
    `;
    container.classList.remove('hidden');
}

function showFailResult(container) {
    container.innerHTML = `
        <div class="result-card fail">
            <div class="result-icon">
                <i class="fa-solid fa-heart"></i>
            </div>
            <h2 class="result-title">Thông báo</h2>
            <p class="result-message">${FAIL_MESSAGE}</p>
            <div class="social-links">
                <a href="https://www.facebook.com/xuantinhnguyenuel" target="_blank">
                    <i class="fa-brands fa-facebook"></i> Theo dõi Fanpage Xuân tình nguyện UEL
                </a>
            </div>
        </div>
    `;
    container.classList.remove('hidden');
}

function showErrorResult(container, title, message) {
    container.innerHTML = `
        <div class="result-card error">
            <div class="result-icon">
                <i class="fa-solid fa-circle-exclamation"></i>
            </div>
            <h2 class="result-title">${title}</h2>
            <p class="result-message">${message}</p>
        </div>
    `;
    container.classList.remove('hidden');
}

// Export for global access (onclick in HTML)
window.traCuu = traCuu;

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('mssv-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                traCuu();
            }
        });
    }
});
