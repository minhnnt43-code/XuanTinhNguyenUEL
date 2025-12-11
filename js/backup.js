/**
 * Backup Module - Sao lưu dữ liệu XTN 2026
 * Hỗ trợ xuất JSON và Excel
 */

import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// COLLECTIONS TO BACKUP
// ============================================================
const COLLECTIONS = {
    users: 'xtn_users',
    teams: 'xtn_teams',
    activities: 'xtn_activities',
    registrations: 'xtn_registrations',
    cards: 'xtn_cards',
    reports: 'xtn_reports',
    logs: 'xtn_logs'
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return null;
    if (timestamp.toDate) {
        return timestamp.toDate().toISOString();
    }
    if (typeof timestamp === 'string') {
        return timestamp;
    }
    if (timestamp instanceof Date) {
        return timestamp.toISOString();
    }
    return null;
}

/**
 * Convert Firestore document data to plain object
 */
function docToPlainObject(docData) {
    const obj = {};
    for (const [key, value] of Object.entries(docData)) {
        if (value && typeof value === 'object' && value.toDate) {
            obj[key] = formatTimestamp(value);
        } else if (Array.isArray(value)) {
            obj[key] = value.map(item =>
                typeof item === 'object' && item.toDate
                    ? formatTimestamp(item)
                    : item
            );
        } else {
            obj[key] = value;
        }
    }
    return obj;
}

/**
 * Get current date string for filename
 */
function getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Download file
 */
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================
// FETCH DATA FROM FIRESTORE
// ============================================================

/**
 * Fetch all documents from a collection
 */
async function fetchCollection(collectionName) {
    const snapshot = await getDocs(collection(db, collectionName));
    const data = [];
    snapshot.forEach(doc => {
        data.push({
            id: doc.id,
            ...docToPlainObject(doc.data())
        });
    });
    return data;
}

/**
 * Fetch multiple collections
 */
async function fetchMultipleCollections(collectionKeys) {
    const result = {};
    for (const key of collectionKeys) {
        if (COLLECTIONS[key]) {
            result[key] = await fetchCollection(COLLECTIONS[key]);
        }
    }
    return result;
}

// ============================================================
// BACKUP TO JSON
// ============================================================

/**
 * Backup all data to JSON
 */
export async function backupAllJSON() {
    console.log('[Backup] Starting full backup to JSON...');
    const data = await fetchMultipleCollections(Object.keys(COLLECTIONS));
    const json = JSON.stringify(data, null, 2);
    const filename = `XTN2026_Backup_Full_${getDateString()}.json`;
    downloadFile(json, filename, 'application/json');
    console.log('[Backup] Full backup completed:', filename);
    return filename;
}

/**
 * Backup users to JSON
 */
export async function backupUsersJSON() {
    console.log('[Backup] Starting users backup to JSON...');
    const data = await fetchCollection(COLLECTIONS.users);
    const json = JSON.stringify({ users: data }, null, 2);
    const filename = `XTN2026_Backup_Users_${getDateString()}.json`;
    downloadFile(json, filename, 'application/json');
    console.log('[Backup] Users backup completed:', filename);
    return filename;
}

/**
 * Backup activities to JSON
 */
export async function backupActivitiesJSON() {
    console.log('[Backup] Starting activities backup to JSON...');
    const data = await fetchCollection(COLLECTIONS.activities);
    const json = JSON.stringify({ activities: data }, null, 2);
    const filename = `XTN2026_Backup_Activities_${getDateString()}.json`;
    downloadFile(json, filename, 'application/json');
    console.log('[Backup] Activities backup completed:', filename);
    return filename;
}

// ============================================================
// BACKUP TO EXCEL
// ============================================================

/**
 * Load SheetJS library if not loaded
 */
async function ensureXLSX() {
    if (window.XLSX) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Backup all data to Excel (multiple sheets)
 */
export async function backupAllExcel() {
    console.log('[Backup] Starting full backup to Excel...');
    await ensureXLSX();

    const workbook = XLSX.utils.book_new();

    // Users sheet
    const users = await fetchCollection(COLLECTIONS.users);
    const usersSheet = XLSX.utils.json_to_sheet(users.map(u => ({
        'ID': u.id,
        'Họ và Tên': u.name || '',
        'MSSV': u.mssv || '',
        'Email': u.email || '',
        'SĐT': u.phone || '',
        'Vai trò': u.role || '',
        'Đội hình ID': u.team_id || '',
        'Chức vụ': u.position || '',
        'Khoa/Ngành': u.faculty || '',
        'Link Thẻ Cấp Thành': u.city_card_link || '',
        'Ngày tạo': u.created_at || ''
    })));
    XLSX.utils.book_append_sheet(workbook, usersSheet, 'Thành viên');

    // Teams sheet
    const teams = await fetchCollection(COLLECTIONS.teams);
    const teamsSheet = XLSX.utils.json_to_sheet(teams.map(t => ({
        'ID': t.id,
        'Tên đội': t.team_name || '',
        'Mô tả': t.description || '',
        'Số thành viên': t.stats?.total_members || 0,
        'Ngày tạo': t.created_at || ''
    })));
    XLSX.utils.book_append_sheet(workbook, teamsSheet, 'Đội hình');

    // Activities sheet
    const activities = await fetchCollection(COLLECTIONS.activities);
    const activitiesSheet = XLSX.utils.json_to_sheet(activities.map(a => ({
        'ID': a.id,
        'Tên hoạt động': a.title || '',
        'Ngày': a.date || '',
        'Giờ bắt đầu': a.start_time || '',
        'Giờ kết thúc': a.end_time || '',
        'Đội hình ID': a.team_id || '',
        'Địa điểm': a.location || '',
        'Mô tả': a.description || '',
        'Số tham gia': a.participants?.length || 0,
        'Ngày tạo': a.created_at || ''
    })));
    XLSX.utils.book_append_sheet(workbook, activitiesSheet, 'Hoạt động');

    // Reports sheet
    const reports = await fetchCollection(COLLECTIONS.reports);
    const reportsSheet = XLSX.utils.json_to_sheet(reports.map(r => ({
        'ID': r.id,
        'Tiêu đề': r.title || '',
        'Nội dung': r.content || '',
        'Link ảnh': r.image_link || '',
        'Link bài viết': r.post_link || '',
        'Đội hình ID': r.team_id || '',
        'Hoạt động ID': r.linkedActivityId || '',
        'Ngày tạo': r.created_at || ''
    })));
    XLSX.utils.book_append_sheet(workbook, reportsSheet, 'Báo cáo');

    // Cards sheet
    const cards = await fetchCollection(COLLECTIONS.cards);
    const cardsSheet = XLSX.utils.json_to_sheet(cards.map(c => ({
        'ID': c.id,
        'User ID': c.user_id || '',
        'Tên': c.name || '',
        'MSSV': c.mssv || '',
        'Link Drive': c.drive_link || '',
        'Ngày tạo': c.created_at || ''
    })));
    XLSX.utils.book_append_sheet(workbook, cardsSheet, 'Thẻ chiến sĩ');

    // Registrations sheet
    const registrations = await fetchCollection(COLLECTIONS.registrations);
    const regsSheet = XLSX.utils.json_to_sheet(registrations.map(r => ({
        'ID': r.id,
        'Họ và Tên': r.name || '',
        'MSSV': r.mssv || '',
        'Email': r.email || '',
        'SĐT': r.phone || '',
        'Câu hỏi phỏng vấn': r.interview_notes || '',
        'Trạng thái': r.status || '',
        'Ngày tạo': r.created_at || ''
    })));
    XLSX.utils.book_append_sheet(workbook, regsSheet, 'Đăng ký');

    const filename = `XTN2026_Backup_Full_${getDateString()}.xlsx`;
    XLSX.writeFile(workbook, filename);
    console.log('[Backup] Full Excel backup completed:', filename);
    return filename;
}

/**
 * Backup users to Excel
 */
export async function backupUsersExcel() {
    console.log('[Backup] Starting users backup to Excel...');
    await ensureXLSX();

    const users = await fetchCollection(COLLECTIONS.users);
    const worksheet = XLSX.utils.json_to_sheet(users.map(u => ({
        'ID': u.id,
        'Họ và Tên': u.name || '',
        'MSSV': u.mssv || '',
        'Email': u.email || '',
        'SĐT': u.phone || '',
        'Vai trò': u.role || '',
        'Đội hình ID': u.team_id || '',
        'Chức vụ': u.position || '',
        'Khoa/Ngành': u.faculty || '',
        'Link Thẻ Cấp Thành': u.city_card_link || '',
        'Ngày tạo': u.created_at || ''
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Thành viên');

    const filename = `XTN2026_Backup_Users_${getDateString()}.xlsx`;
    XLSX.writeFile(workbook, filename);
    console.log('[Backup] Users Excel backup completed:', filename);
    return filename;
}

/**
 * Backup activities to Excel
 */
export async function backupActivitiesExcel() {
    console.log('[Backup] Starting activities backup to Excel...');
    await ensureXLSX();

    const activities = await fetchCollection(COLLECTIONS.activities);
    const worksheet = XLSX.utils.json_to_sheet(activities.map(a => ({
        'ID': a.id,
        'Tên hoạt động': a.title || '',
        'Ngày': a.date || '',
        'Giờ bắt đầu': a.start_time || '',
        'Giờ kết thúc': a.end_time || '',
        'Đội hình ID': a.team_id || '',
        'Địa điểm': a.location || '',
        'Mô tả': a.description || '',
        'Số tham gia': a.participants?.length || 0,
        'Ngày tạo': a.created_at || ''
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hoạt động');

    const filename = `XTN2026_Backup_Activities_${getDateString()}.xlsx`;
    XLSX.writeFile(workbook, filename);
    console.log('[Backup] Activities Excel backup completed:', filename);
    return filename;
}
