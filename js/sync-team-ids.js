/**
 * Sync Team ID Script
 * Đồng bộ team_id từ STATIC_MEMBERS vào Firebase xtn_users
 * 
 * Cách dùng:
 * 1. Mở Dashboard, đăng nhập admin
 * 2. Mở Console (F12)
 * 3. Chạy: syncTeamIds() - để xem danh sách cần sync
 * 4. Chạy: syncTeamIds(true) - để thực hiện sync
 */

import { db } from './firebase.js';
import { collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import STATIC_MEMBERS from './members-static.js';

// Tạo map email -> member data từ STATIC_MEMBERS
const staticMemberMap = new Map();
STATIC_MEMBERS.forEach(member => {
    if (member.email) {
        staticMemberMap.set(member.email.toLowerCase().trim(), member);
    }
});

/**
 * Sync team_id từ STATIC_MEMBERS vào Firebase
 * @param {boolean} execute - true để thực hiện update, false để preview
 */
export async function syncTeamIds(execute = false) {
    console.log('🔄 [SyncTeam] Bắt đầu quét...');
    console.log('📊 [SyncTeam] STATIC_MEMBERS:', STATIC_MEMBERS.length, 'members');

    const results = {
        needSync: [],
        alreadySynced: [],
        notInStatic: [],
        errors: []
    };

    try {
        // Lấy tất cả users từ Firebase
        const usersSnap = await getDocs(collection(db, 'xtn_users'));
        console.log('📊 [SyncTeam] Firebase xtn_users:', usersSnap.size, 'records');

        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const email = userData.email?.toLowerCase().trim();

            if (!email) continue;

            // Tìm trong STATIC_MEMBERS
            const staticMember = staticMemberMap.get(email);

            if (!staticMember) {
                results.notInStatic.push({
                    id: userDoc.id,
                    name: userData.name,
                    email: email,
                    current_team_id: userData.team_id || '(trống)'
                });
                continue;
            }

            // So sánh team_id
            const firebaseTeamId = userData.team_id || '';
            const staticTeamId = staticMember.team_id || '';

            if (firebaseTeamId === staticTeamId && staticTeamId !== '') {
                results.alreadySynced.push({
                    name: userData.name,
                    email: email,
                    team_id: firebaseTeamId
                });
            } else if (staticTeamId !== '') {
                // Cần sync
                results.needSync.push({
                    id: userDoc.id,
                    name: userData.name || staticMember.name,
                    email: email,
                    old_team_id: firebaseTeamId || '(trống)',
                    new_team_id: staticTeamId,
                    new_team_name: staticMember.team_name,
                    new_position: staticMember.position,
                    new_role: staticMember.role
                });

                // Thực hiện update nếu execute = true
                if (execute) {
                    try {
                        await updateDoc(doc(db, 'xtn_users', userDoc.id), {
                            name: staticMember.name || userData.name, // Ưu tiên tên từ STATIC_MEMBERS
                            team_id: staticTeamId,
                            team_name: staticMember.team_name || '',
                            position: staticMember.position || userData.position || 'Chiến sĩ',
                            // Không update role để tránh downgrade admin
                        });
                        console.log(`✅ Updated: ${staticMember.name} → ${staticMember.team_name}`);
                    } catch (err) {
                        results.errors.push({
                            name: userData.name,
                            error: err.message
                        });
                        console.error(`❌ Error updating ${userData.name}:`, err);
                    }
                }
            }
        }

        // In kết quả
        console.log('\n========================================');
        console.log('📊 KẾT QUẢ ĐỒNG BỘ TEAM_ID');
        console.log('========================================');
        console.log(`✅ Đã đồng bộ sẵn: ${results.alreadySynced.length}`);
        console.log(`🔄 Cần đồng bộ: ${results.needSync.length}`);
        console.log(`⚠️ Không có trong STATIC_MEMBERS: ${results.notInStatic.length}`);

        if (results.errors.length > 0) {
            console.log(`❌ Lỗi: ${results.errors.length}`);
        }

        console.log('\n--- Danh sách CẦN ĐỒNG BỘ ---');
        results.needSync.forEach((m, i) => {
            console.log(`${i + 1}. ${m.name} | ${m.old_team_id} → ${m.new_team_id} (${m.new_team_name})`);
        });

        console.log('\n--- Danh sách KHÔNG CÓ TRONG STATIC ---');
        results.notInStatic.forEach((m, i) => {
            console.log(`${i + 1}. ${m.name} | Email: ${m.email} | Current: ${m.current_team_id}`);
        });

        if (!execute && results.needSync.length > 0) {
            console.log('\n💡 Để thực hiện đồng bộ, chạy: syncTeamIds(true)');
        }

        if (execute) {
            console.log('\n✅ ĐÃ HOÀN THÀNH ĐỒNG BỘ!');
            console.log('🔄 Refresh trang để thấy kết quả.');
        }

        return results;

    } catch (error) {
        console.error('❌ [SyncTeam] Lỗi:', error);
        throw error;
    }
}

/**
 * Sync cả xtn_cards collection
 */
export async function syncCardsTeamIds(execute = false) {
    console.log('🔄 [SyncCards] Bắt đầu đồng bộ team_id cho xtn_cards...');

    const cardsSnap = await getDocs(collection(db, 'xtn_cards'));
    let synced = 0;

    for (const cardDoc of cardsSnap.docs) {
        const cardData = cardDoc.data();
        const email = cardData.email?.toLowerCase().trim();

        if (!email) continue;

        const staticMember = staticMemberMap.get(email);
        if (!staticMember) continue;

        const currentTeamId = cardData.team_id || '';
        const staticTeamId = staticMember.team_id || '';

        if (currentTeamId !== staticTeamId && staticTeamId !== '') {
            console.log(`🔄 Card ${cardData.name}: ${currentTeamId || '(trống)'} → ${staticTeamId}`);

            if (execute) {
                await updateDoc(doc(db, 'xtn_cards', cardDoc.id), {
                    team_id: staticTeamId
                });
                synced++;
            }
        }
    }

    console.log(`✅ [SyncCards] Đã sync: ${synced} cards`);
    return synced;
}

// Expose to window for console access
window.syncTeamIds = syncTeamIds;
window.syncCardsTeamIds = syncCardsTeamIds;

console.log('📦 [SyncTeam] Script loaded!');
console.log('💡 Chạy syncTeamIds() để xem preview');
console.log('💡 Chạy syncTeamIds(true) để thực hiện đồng bộ');
