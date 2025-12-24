/**
 * Script kiểm tra và import CSV tự động
 * Đặt trong console để chạy thủ công
 */

async function autoImportCSV() {
    console.log('[Auto Import] Starting...');

    // Đọc file CSV (cần user chọn file thủ công)
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log('[Auto Import] Reading file:', file.name, file.size, 'bytes');

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());

        console.log('[Auto Import] Total lines:', lines.length);
        console.log('[Auto Import] Header:', lines[0]);
        console.log('[Auto Import] First data row:', lines[1]);
        console.log('[Auto Import] Last data row:', lines[lines.length - 1]);

        // Parse CSV
        const headers = lines[0].split(',');
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((h, idx) => {
                row[h.trim()] = values[idx] ? values[idx].trim() : '';
            });

            // Check if has email
            const email = row['Email'] || row['email'];
            const name = row['Họ và tên'] || row['name'] || row['Họ v� t�n']; // UTF-8 variants

            if (!email || !name) {
                console.warn(`[Auto Import] Row ${i + 1} missing email/name:`, row);
            } else {
                data.push({
                    name: name,
                    mssv: row['MSSV'] || '',
                    email: email,
                    phone: row['Số điện thoại'] || row['S? ?i?n tho?i'] || '',
                    faculty: row['Khoa/Viện'] || row['Khoa/Vi?n'] || '',
                    position: row['Chức vụ'] || row['Ch?c v?'] || 'Chiến sĩ',
                    team_id: row['Đội hình'] || row['??i h?nh'] || ''
                });
            }
        }

        console.log(`[Auto Import] Valid data: ${data.length} / ${lines.length - 1}`);
        console.log('[Auto Import] Sample data:', data.slice(0, 3));

        // Confirm
        if (!confirm(`Import ${data.length} người?`)) return;

        // Import (giả lập - cần Firebase auth)
        alert(`Cần login vào dashboard rồi chạy script này!\n\nData đã parse: ${data.length} người`);
        window.csvParsedData = data; // Lưu vào window để dùng sau
    };

    input.click();
}

// Gọi hàm
// autoImportCSV();
