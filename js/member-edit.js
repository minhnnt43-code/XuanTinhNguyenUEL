/**
 * Edit Member - Cho phép sửa email, SĐT (KHÔNG cho sửa tên)
 */
window.editMember = async function (memberId) {
    const member = membersDataCache.find(m => m.id === memberId);
    if (!member) {
        await showAlert('Không tìm thấy chiến sĩ', 'error');
        return;
    }

    // Tạo modal edit
    const modalHTML = `
        <div id="modal-edit-member" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div style="background:white; padding:30px; border-radius:16px; max-width:500px; width:90%;">
                <h3 style="margin:0 0 20px; color:#16a34a;">Chỉnh Sửa Thông Tin</h3>
                
                <div style="margin-bottom:15px;">
                    <label style="display:block; margin-bottom:5px; font-weight:600; color:#4b5563;">Họ và tên (Không thể sửa)</label>
                    <input type="text" id="edit-name" value="${member.name}" readonly style="width:100%; padding:10px; border:2px solid #d1d5db; border-radius:8px; background:#f3f4f6; cursor:not-allowed; color:#6b7280;">
                </div>

                <div style="margin-bottom:15px;">
                    <label style="display:block; margin-bottom:5px; font-weight:600; color:#4b5563;">Email</label>
                    <input type="email" id="edit-email" value="${member.email}" style="width:100%; padding:10px; border:2px solid #d1d5db; border-radius:8px;">
                </div>

                <div style="margin-bottom:20px;">
                    <label style="display:block; margin-bottom:5px; font-weight:600; color:#4b5563;">Số điện thoại</label>
                    <input type="tel" id="edit-phone" value="${member.phone || ''}" placeholder="0xxxxxxxxx" style="width:100%; padding:10px; border:2px solid #d1d5db; border-radius:8px;">
                </div>

                <div style="display:flex; gap:10px;">
                    <button onclick="saveEditMember('${memberId}')" style="flex:1; padding:12px; background:linear-gradient(135deg, #16a34a, #22c55e); color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer;">
                        <i class="fa-solid fa-save"></i> Lưu
                    </button>
                    <button onclick="closeEditMember()" style="flex:1; padding:12px; background:#dc2626; color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer;">
                        <i class="fa-solid fa-times"></i> Hủy
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

window.closeEditMember = function () {
    const modal = document.getElementById('modal-edit-member');
    if (modal) modal.remove();
};

window.saveEditMember = async function (memberId) {
    const email = document.getElementById('edit-email').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();

    if (!email) {
        await showAlert('Email không được để trống', 'error');
        return;
    }

    if (!email.includes('@')) {
        await showAlert('Email không hợp lệ', 'error');
        return;
    }

    try {
        // Update Firebase
        await updateDoc(doc(db, 'xtn_users', memberId), {
            email: email,
            phone: phone,
            updated_at: serverTimestamp()
        });

        await showAlert('Cập nhật thành công!', 'success');
        closeEditMember();
        loadMembers(); // Reload
    } catch (error) {
        console.error('[Edit Member] Error:', error);
        await showAlert('Lỗi cập nhật: ' + error.message, 'error');
    }
};

/**
 * Delete Member
 */
window.deleteMember = async function (memberId) {
    const member = membersDataCache.find(m => m.id === memberId);
    if (!member) return;

    const confirmed = await showConfirm(
        `Bạn có chắc muốn xóa chiến sĩ "${member.name}"?`,
        'Xác nhận xóa'
    );

    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'xtn_users', memberId));
        await showAlert('Đã xóa thành công!', 'success');
        loadMembers();
    } catch (error) {
        console.error('[Delete Member] Error:', error);
        await showAlert('Lỗi xóa: ' + error.message, 'error');
    }
};
