/**
 * Script dọn dẹp duplicate members
 * Chạy trong Console của dashboard (F12 > Console)
 * 
 * Cách dùng:
 * 1. Mở dashboard với quyền Super Admin
 * 2. F12 > Console
 * 3. Copy paste toàn bộ code này rồi Enter
 */

(async function cleanDuplicates() {
    console.log('🧹 Bắt đầu dọn dẹp duplicate...');

    // Import Firebase (đã có sẵn từ dashboard)
    if (!window.db) {
        console.error('❌ Không tìm thấy Firebase db. Hãy chạy trên dashboard.');
        return;
    }

    // Helper giống trong dashboard-core.js
    function emailToDocId(email) {
        if (!email) return null;
        return email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    }

    // Load tất cả users
    const { collection, getDocs, doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    const usersSnap = await getDocs(collection(db, 'xtn_users'));

    console.log(`📊 Tổng số documents: ${usersSnap.docs.length}`);

    // Nhóm theo email
    const emailGroups = {};
    usersSnap.docs.forEach(d => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        if (!email) return;

        if (!emailGroups[email]) emailGroups[email] = [];
        emailGroups[email].push({
            id: d.id,
            data: data,
            hasUid: !!data.uid,
            hasPhone: !!data.phone,
            isEmailDocId: d.id === emailToDocId(email)
        });
    });

    // Tìm duplicates
    const duplicates = [];
    for (const [email, docs] of Object.entries(emailGroups)) {
        if (docs.length > 1) {
            duplicates.push({ email, docs });
        }
    }

    if (duplicates.length === 0) {
        console.log('✅ Không có duplicate! Database sạch.');
        return;
    }

    console.log(`⚠️ Tìm thấy ${duplicates.length} email có duplicate:`);

    // Phân tích và đề xuất xóa
    const toDelete = [];
    duplicates.forEach(dup => {
        console.log(`\n📧 ${dup.email}:`);

        // Ưu tiên giữ: 1) Doc có email-based ID, 2) Doc có uid, 3) Doc có phone
        dup.docs.sort((a, b) => {
            if (a.isEmailDocId !== b.isEmailDocId) return a.isEmailDocId ? -1 : 1;
            if (a.hasUid !== b.hasUid) return a.hasUid ? -1 : 1;
            if (a.hasPhone !== b.hasPhone) return a.hasPhone ? -1 : 1;
            return 0;
        });

        const keep = dup.docs[0];
        const deleteList = dup.docs.slice(1);

        console.log(`  ✅ Giữ: ${keep.id} (emailDocId=${keep.isEmailDocId}, uid=${keep.hasUid}, phone=${keep.hasPhone})`);
        deleteList.forEach(d => {
            console.log(`  ❌ Xóa: ${d.id} (emailDocId=${d.isEmailDocId}, uid=${d.hasUid}, phone=${d.hasPhone})`);
            toDelete.push(d.id);
        });
    });

    if (toDelete.length === 0) {
        console.log('\n✅ Không có document nào cần xóa.');
        return;
    }

    console.log(`\n🗑️ Sẽ xóa ${toDelete.length} documents.`);

    // Hỏi xác nhận
    const confirm = window.confirm(`Bạn có chắc muốn xóa ${toDelete.length} documents trùng lặp?`);
    if (!confirm) {
        console.log('❌ Đã hủy.');
        return;
    }

    // Xóa
    let deleted = 0;
    for (const docId of toDelete) {
        try {
            await deleteDoc(doc(db, 'xtn_users', docId));
            deleted++;
            console.log(`  Đã xóa: ${docId}`);
        } catch (e) {
            console.error(`  Lỗi xóa ${docId}:`, e);
        }
    }

    console.log(`\n✅ Hoàn tất! Đã xóa ${deleted}/${toDelete.length} documents.`);
    console.log('🔄 Reload trang để xem kết quả.');
})();
