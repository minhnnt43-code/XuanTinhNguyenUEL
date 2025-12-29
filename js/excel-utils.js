/**
 * excel-utils.js - Excel Import/Export Utilities
 * XTN 2026
 * Using SheetJS (xlsx) library
 */

// SheetJS loaded from CDN in HTML

// ============================================================
// EXPORT TO EXCEL
// ============================================================
export function exportToExcel(data, filename = 'xtn_data.xlsx', sheetName = 'Data') {
    if (!window.XLSX) {
        showToast('Thư viện Excel chưa được tải. Vui lòng thử lại.', 'warning');
        return;
    }

    try {
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);

        // Auto-size columns
        const colWidths = [];
        if (data.length > 0) {
            Object.keys(data[0]).forEach((key, i) => {
                const maxLen = Math.max(
                    key.length,
                    ...data.map(row => String(row[key] || '').length)
                );
                colWidths.push({ wch: Math.min(maxLen + 2, 50) });
            });
            ws['!cols'] = colWidths;
        }

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Save file
        XLSX.writeFile(wb, filename);
        console.log('[Excel] Exported:', filename);
        return true;
    } catch (error) {
        console.error('[Excel] Export error:', error);
        showToast('Lỗi khi xuất Excel: ' + error.message, 'error');
        return false;
    }
}

// ============================================================
// IMPORT FROM EXCEL
// ============================================================
export function importFromExcel(file) {
    return new Promise((resolve, reject) => {
        if (!window.XLSX) {
            reject(new Error('Thư viện Excel chưa được tải'));
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Get first sheet
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                console.log('[Excel] Imported:', jsonData.length, 'rows');
                resolve(jsonData);
            } catch (error) {
                console.error('[Excel] Import error:', error);
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Lỗi đọc file'));
        reader.readAsArrayBuffer(file);
    });
}

// ============================================================
// EXPORT CHIEN SI (specific format)
// ============================================================
export function exportChienSi(members, teams = {}) {
    const data = members.map((m, index) => ({
        'STT': index + 1,
        'Họ và tên': m.name || '',
        'MSSV': m.mssv || '',
        'Email': m.email || '',
        'Số điện thoại': m.phone || '',
        'Khoa/Viện': m.faculty || '',
        'Chức vụ': m.position || 'Chiến sĩ',
        'Đội hình': teams[m.team_id]?.name || m.team_id || 'Chưa phân đội',
        'Vai trò': getRoleName(m.role),
        'Ngày tham gia': formatDate(m.created_at),
        'Trạng thái': m.status || 'active'
    }));

    const today = new Date().toISOString().slice(0, 10);
    exportToExcel(data, `XTN_DanhSachChienSi_${today}.xlsx`, 'Danh sách Chiến sĩ');
}

// ============================================================
// VALIDATE IMPORT DATA
// ============================================================
export function validateImportData(data, requiredFields = ['name', 'email']) {
    const errors = [];
    const validData = [];

    data.forEach((row, index) => {
        const rowNum = index + 2; // Excel row (header = 1)
        const rowErrors = [];

        // Check required fields
        requiredFields.forEach(field => {
            const value = row[field] || row[field.toLowerCase()] || row[capitalizeFirst(field)];
            if (!value || String(value).trim() === '') {
                rowErrors.push(`Thiếu ${field}`);
            }
        });

        // Validate email format
        const email = row.email || row.Email || row['Email'];
        if (email && !isValidEmail(email)) {
            rowErrors.push('Email không hợp lệ');
        }

        if (rowErrors.length > 0) {
            errors.push({ row: rowNum, errors: rowErrors });
        } else {
            validData.push(normalizeRow(row));
        }
    });

    return { validData, errors, totalRows: data.length };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function getRoleName(role) {
    const roles = {
        'super-admin': 'Super Admin',
        'admin': 'Admin',
        'bch-doi': 'BCH Đội',
        'member': 'Chiến sĩ',
        'pending': 'Chờ duyệt'
    };
    return roles[role] || role || 'Chiến sĩ';
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('vi-VN');
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeRow(row) {
    // Map Vietnamese column names to English
    return {
        name: row['Họ và tên'] || row['name'] || row['Name'] || '',
        mssv: row['MSSV'] || row['mssv'] || '',
        email: row['Email'] || row['email'] || '',
        phone: row['Số điện thoại'] || row['phone'] || row['Phone'] || '',
        faculty: row['Khoa/Viện'] || row['faculty'] || '',
        position: row['Chức vụ'] || row['position'] || 'Chiến sĩ',
        team_id: row['Đội hình'] || row['team_id'] || '',
        role: 'member',
        status: 'active'
    };
}

// ============================================================
// DOWNLOAD TEMPLATE
// ============================================================
export function downloadImportTemplate() {
    const template = [
        {
            'Họ và tên': 'Nguyễn Văn A',
            'MSSV': 'K224141000',
            'Email': 'example@st.uel.edu.vn',
            'Số điện thoại': '0901234567',
            'Khoa/Viện': 'Kinh tế',
            'Chức vụ': 'Chiến sĩ',
            'Đội hình': 'Đội hình 1'
        }
    ];
    exportToExcel(template, 'XTN_MauImport.xlsx', 'Mẫu Import');
}
