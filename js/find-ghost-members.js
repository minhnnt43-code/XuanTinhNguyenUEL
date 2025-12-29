/**
 * Script để tìm 2 người "ma" trong Firebase nhưng không có trong STATIC_MEMBERS
 * Chạy trong Console của Dashboard
 */

import STATIC_MEMBERS from './members-static.js';
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export async function findGhostMembers() {
    console.log('[Ghost Finder] 🔍 Starting search...');

    // Tạo Set email từ STATIC_MEMBERS
    const staticEmails = new Set();
    STATIC_MEMBERS.forEach(m => {
        if (m.email) {
            staticEmails.add(m.email.toLowerCase().trim());
        }
    });

    console.log('[Ghost Finder] 📋 STATIC_MEMBERS:', STATIC_MEMBERS.length);

    // Lấy tất cả từ Firebase
    const usersSnap = await getDocs(collection(db, 'xtn_users'));
    const ghosts = [];

    usersSnap.forEach(doc => {
        const data = doc.data();
        const email = data.email?.toLowerCase().trim();

        // Bỏ qua pending và deleted
        if (!email || data.deleted || data.role === 'pending') return;

        // Tìm người KHÔNG có trong static
        if (!staticEmails.has(email)) {
            ghosts.push({
                id: doc.id,
                name: data.name,
                email: data.email,
                mssv: data.mssv,
                team: data.team_name || data.team_id,
                position: data.position
            });
        }
    });

    console.log('[Ghost Finder] 👻 Found ghosts:', ghosts.length);
    console.table(ghosts);

    if (ghosts.length > 0) {
        console.log('\n🔴 Để xóa các "ma" này, chạy:');
        console.log('deleteGhostMembers()');
    }

    return ghosts;
}

export async function deleteGhostMembers() {
    const ghosts = await findGhostMembers();

    if (ghosts.length === 0) {
        console.log('✅ Không có "ma" nào!');
        return;
    }

    const confirm = window.confirm(`Xóa ${ghosts.length} người "ma"?\n\n` + ghosts.map(g => `${g.name} (${g.email})`).join('\n'));

    if (!confirm) {
        console.log('❌ Đã hủy');
        return;
    }

    // Xóa từng người
    for (const ghost of ghosts) {
        try {
            await db.collection('xtn_users').doc(ghost.id).delete();
            console.log('✅ Đã xóa:', ghost.name, ghost.email);
        } catch (err) {
            console.error('❌ Lỗi xóa:', ghost.name, err);
        }
    }

    console.log('🎉 Hoàn thành! Refresh trang để cập nhật.');
}

// Auto-run khi load
findGhostMembers();
