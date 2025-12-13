/**
 * dashboard-activity-logs.js - Activity Logs Viewer
 * XTN 2026
 * 
 * Chỉ super_admin mới xem được
 */

import { queryLogs, getLogStats, cleanupOldLogs, ACTION_TYPES, TARGETS } from './activity-logger.js';

// ============================================================
// STATE
// ============================================================
let currentPage = 1;
let lastDoc = null;
let isLoading = false;
let filters = {
    action: '',
    email: '',
    dateFrom: '',
    dateTo: ''
};

// ============================================================
// INIT
// ============================================================
export function initActivityLogs() {
    console.log('[ActivityLogs] Initializing...');

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    loadLogs(true);

    // Cleanup old logs khi init
    cleanupOldLogs();
}

function setupEventListeners() {
    // Filter action
    document.getElementById('logs-filter-action')?.addEventListener('change', (e) => {
        filters.action = e.target.value;
        loadLogs(true);
    });

    // Filter email
    document.getElementById('logs-search-email')?.addEventListener('input', debounce((e) => {
        filters.email = e.target.value.trim();
        loadLogs(true);
    }, 500));

    // Date filters
    document.getElementById('logs-date-from')?.addEventListener('change', (e) => {
        filters.dateFrom = e.target.value;
        loadLogs(true);
    });

    document.getElementById('logs-date-to')?.addEventListener('change', (e) => {
        filters.dateTo = e.target.value;
        loadLogs(true);
    });

    // Refresh button
    document.getElementById('btn-refresh-logs')?.addEventListener('click', () => {
        loadLogs(true);
    });

    // Load more button
    document.getElementById('btn-load-more-logs')?.addEventListener('click', () => {
        loadLogs(false);
    });

    // Export button
    document.getElementById('btn-export-logs')?.addEventListener('click', exportLogsToExcel);

    // Cleanup button
    document.getElementById('btn-cleanup-logs')?.addEventListener('click', async () => {
        const count = await cleanupOldLogs();
        showToast(`Đã xóa ${count} logs cũ`, 'success');
        loadLogs(true);
    });
}

// ============================================================
// LOAD LOGS
// ============================================================
async function loadLogs(reset = false) {
    if (isLoading) return;
    isLoading = true;

    const tbody = document.getElementById('logs-table-body');
    const loadMoreBtn = document.getElementById('btn-load-more-logs');
    const statsDiv = document.getElementById('logs-stats');

    if (reset) {
        lastDoc = null;
        currentPage = 1;
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    }

    try {
        // Load logs
        const result = await queryLogs(filters, 50, reset ? null : lastDoc);
        lastDoc = result.lastDoc;

        // Load stats
        const stats = await getLogStats();
        if (statsDiv) {
            statsDiv.innerHTML = `
                <span><i class="fa-solid fa-chart-line"></i> 24h qua: <strong>${stats.total24h}</strong> hoạt động</span>
                ${Object.entries(stats.byAction).slice(0, 3).map(([k, v]) =>
                `<span class="badge badge-secondary">${getActionLabel(k)}: ${v}</span>`
            ).join('')}
            `;
        }

        // Render logs
        if (reset) {
            if (tbody) tbody.innerHTML = '';
        }

        if (result.logs.length === 0 && reset) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Không có logs nào</td></tr>';
        } else {
            result.logs.forEach(log => {
                if (tbody) tbody.innerHTML += renderLogRow(log);
            });
        }

        // Load more button
        if (loadMoreBtn) {
            loadMoreBtn.style.display = result.hasMore ? 'inline-flex' : 'none';
        }

    } catch (error) {
        console.error('[ActivityLogs] Load error:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Lỗi tải dữ liệu</td></tr>';
    } finally {
        isLoading = false;
    }
}

// ============================================================
// RENDER
// ============================================================
function renderLogRow(log) {
    const time = log.timestamp?.toDate?.()
        ? log.timestamp.toDate().toLocaleString('vi-VN')
        : 'N/A';

    const actionBadge = getActionBadge(log.action);
    const details = log.details ? JSON.parse(log.details) : {};
    const detailsStr = formatDetails(log.action, details);

    return `
        <tr>
            <td><small>${time}</small></td>
            <td>
                <span title="${log.email || 'Anonymous'}">${log.email?.split('@')[0] || 'Ẩn danh'}</span>
            </td>
            <td>${actionBadge}</td>
            <td>${formatTarget(log.target)}</td>
            <td><small>${detailsStr}</small></td>
            <td><span class="badge badge-${log.device === 'mobile' ? 'warning' : 'secondary'}">${getDeviceLabel(log.device)}</span></td>
        </tr>
    `;
}

// Format details thành text dễ hiểu
// Format details thành text dễ hiểu (Natural Language)
function formatDetails(action, details) {
    if (!details || Object.keys(details).length === 0) return '-';

    // Tra cứu MSSV
    if (action === ACTION_TYPES.SEARCH) {
        const query = details.query || '';
        const found = details.found;
        return found
            ? `<span class="text-success"><i class="fa-solid fa-check"></i> Đã tìm thấy: <strong>${query}</strong></span>`
            : `<span class="text-danger"><i class="fa-solid fa-xmark"></i> Không tìm thấy: <strong>${query}</strong></span>`;
    }

    // Xem section
    if (action === ACTION_TYPES.SECTION_VIEW && details.section) {
        return `Đang xem mục: <strong>${getSectionLabel(details.section)}</strong>`;
    }

    // Login/Logout
    if (action === ACTION_TYPES.LOGIN) return `Đăng nhập thành công`;
    if (action === ACTION_TYPES.LOGOUT) return `Đăng xuất khỏi hệ thống`;
    if (action === ACTION_TYPES.REGISTER) return `Đăng ký tài khoản mới`;

    // Media Management (Mới thêm)
    if (action === 'media_add' || action === 'media_bulk_add') {
        return `Đã thêm <strong>${details.count || 1}</strong> hình ảnh vào <strong>${getMediaLabel(details.type)}</strong>`;
    }
    if (action === 'media_delete') {
        return `Đã xóa 1 hình ảnh khỏi <strong>${getMediaLabel(details.type)}</strong>`;
    }
    if (action === 'media_toggle') {
        return `Đã ${details.active ? 'hiện' : 'ẩn'} hình ảnh trong <strong>${getMediaLabel(details.type)}</strong>`;
    }

    // Tạo/Sửa/Xóa Generic
    if (details.id) return `ID đối tượng: <code>${details.id}</code>`;

    // Fallback
    return Object.entries(details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
}

// Helper: Tên loại media
function getMediaLabel(type) {
    const map = {
        'hero': 'Slideshow Trang chủ',
        'jd': 'Background mô tả',
        'gallery': 'Gieo sắc Xuân sang',
        'teams': 'Đội hình'
    };
    return map[type] || type;
}

// Map section ID thành tên tiếng Việt
function getSectionLabel(sectionId) {
    const labels = {
        'section-dashboard': 'Tổng quan',
        'section-avatar': 'Tạo Avatar',
        'section-card': 'Tạo Thẻ Chiến sĩ',
        'section-activity': 'Quản lý Hoạt động',
        'section-members': 'Danh sách Chiến sĩ',
        'section-teams': 'Đội hình',
        'section-registrations': 'Đơn đăng ký',
        'section-questions': 'Câu hỏi',
        'section-settings': 'Cài đặt',
        'section-cards-admin': 'Quản trị Thẻ',
        'section-activity-logs': 'Lịch sử hoạt động'
    };
    return labels[sectionId] || sectionId;
}

// Map target thành tiếng Việt
function formatTarget(target) {
    if (!target) return '-';

    const labels = {
        'user': 'Thành viên',
        'team': 'Đội hình',
        'activity': 'Hoạt động',
        'report': 'Báo cáo',
        'card': 'Thẻ',
        'registration': 'Đơn đăng ký',
        'question': 'Câu hỏi',
        'gallery': 'Thư viện',
        'message': 'Tin nhắn'
    };
    return `<code>${labels[target] || target}</code>`;
}

// Map device thành tiếng Việt
function getDeviceLabel(device) {
    const labels = {
        'desktop': 'Máy tính',
        'mobile': 'Điện thoại',
        'tablet': 'Máy tính bảng'
    };
    return labels[device] || device;
}

function getActionBadge(action) {
    const badges = {
        [ACTION_TYPES.LOGIN]: '<span class="badge badge-success"><i class="fa-solid fa-right-to-bracket"></i> Đăng nhập</span>',
        [ACTION_TYPES.LOGOUT]: '<span class="badge badge-secondary"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</span>',
        [ACTION_TYPES.SECTION_VIEW]: '<span class="badge badge-info"><i class="fa-solid fa-eye"></i> Xem trang</span>',
        [ACTION_TYPES.SEARCH]: '<span class="badge badge-primary"><i class="fa-solid fa-search"></i> Tra cứu</span>',
        [ACTION_TYPES.CREATE]: '<span class="badge badge-success"><i class="fa-solid fa-plus"></i> Tạo mới</span>',
        [ACTION_TYPES.UPDATE]: '<span class="badge badge-warning"><i class="fa-solid fa-pen"></i> Cập nhật</span>',
        [ACTION_TYPES.DELETE]: '<span class="badge badge-danger"><i class="fa-solid fa-trash"></i> Xóa</span>',
        [ACTION_TYPES.EXPORT]: '<span class="badge badge-info"><i class="fa-solid fa-download"></i> Xuất file</span>',
        [ACTION_TYPES.IMPORT]: '<span class="badge badge-info"><i class="fa-solid fa-upload"></i> Nhập file</span>'
    };
    return badges[action] || `<span class="badge">${action}</span>`;
}

function getActionLabel(action) {
    const labels = {
        [ACTION_TYPES.LOGIN]: 'Đăng nhập',
        [ACTION_TYPES.LOGOUT]: 'Đăng xuất',
        [ACTION_TYPES.SECTION_VIEW]: 'Xem trang',
        [ACTION_TYPES.SEARCH]: 'Tra cứu',
        [ACTION_TYPES.CREATE]: 'Tạo mới',
        [ACTION_TYPES.UPDATE]: 'Cập nhật',
        [ACTION_TYPES.DELETE]: 'Xóa',
        [ACTION_TYPES.EXPORT]: 'Xuất file',
        [ACTION_TYPES.IMPORT]: 'Nhập file'
    };
    return labels[action] || action;
}

function truncate(str, len) {
    if (!str) return '-';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

// ============================================================
// EXPORT TO EXCEL
// ============================================================
async function exportLogsToExcel() {
    try {
        showToast('Đang xuất Excel...', 'info');

        // Load all logs (limit 1000)
        const result = await queryLogs(filters, 1000);

        if (result.logs.length === 0) {
            showToast('Không có dữ liệu để xuất', 'warning');
            return;
        }

        const data = result.logs.map((log, idx) => ({
            'STT': idx + 1,
            'Thời gian': log.timestamp?.toDate?.()?.toLocaleString('vi-VN') || 'N/A',
            'Email': log.email || 'Ẩn danh',
            'Hành động': getActionLabel(log.action),
            'Đối tượng': log.target || '-',
            'Chi tiết': log.details || '-',
            'Thiết bị': log.device,
            'Session': log.session
        }));

        // Use XLSX if available
        if (window.XLSX) {
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
            XLSX.writeFile(wb, `XTN_ActivityLogs_${new Date().toISOString().slice(0, 10)}.xlsx`);
            showToast(`Đã xuất ${data.length} logs`, 'success');
        } else {
            showToast('Thư viện Excel chưa tải', 'error');
        }
    } catch (error) {
        console.error('[ActivityLogs] Export error:', error);
        showToast('Lỗi xuất Excel', 'error');
    }
}

// ============================================================
// UTILITIES
// ============================================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ============================================================
// RENDER SECTION HTML
// ============================================================
export function renderActivityLogsSection() {
    return `
        <div class="section-header">
            <h2><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử hoạt động</h2>
            <p>Theo dõi toàn bộ hoạt động trên hệ thống (lưu 90 ngày)</p>
        </div>

        <div class="logs-stats-bar" id="logs-stats">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải thống kê...
        </div>

        <div class="logs-toolbar">
            <div class="logs-filters">
                <select id="logs-filter-action" class="form-control">
                    <option value="">-- Tất cả hành động --</option>
                    <option value="login">Đăng nhập</option>
                    <option value="logout">Đăng xuất</option>
                    <option value="search">Tra cứu</option>
                    <option value="create">Tạo mới</option>
                    <option value="update">Cập nhật</option>
                    <option value="delete">Xóa</option>
                    <option value="export">Xuất dữ liệu</option>
                </select>
                <input type="text" id="logs-search-email" placeholder="Tìm theo email..." class="form-control">
            </div>
            <div class="logs-actions">
                <button id="btn-refresh-logs" class="btn btn-secondary">
                    <i class="fa-solid fa-sync"></i> Làm mới
                </button>
                <button id="btn-export-logs" class="btn btn-success">
                    <i class="fa-solid fa-file-excel"></i> Xuất Excel
                </button>
                <button id="btn-cleanup-logs" class="btn btn-warning" title="Xóa logs quá 90 ngày">
                    <i class="fa-solid fa-broom"></i> Dọn dẹp
                </button>
            </div>
        </div>

        <div class="table-container">
            <table class="data-table logs-table">
                <thead>
                    <tr>
                        <th style="width:140px">Thời gian</th>
                        <th style="width:120px">Người dùng</th>
                        <th style="width:100px">Hành động</th>
                        <th style="width:100px">Đối tượng</th>
                        <th>Chi tiết</th>
                        <th style="width:80px">Thiết bị</th>
                    </tr>
                </thead>
                <tbody id="logs-table-body">
                    <tr><td colspan="6" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>
                </tbody>
            </table>
        </div>

        <div class="logs-footer">
            <button id="btn-load-more-logs" class="btn btn-outline" style="display:none;">
                <i class="fa-solid fa-chevron-down"></i> Tải thêm
            </button>
        </div>

        <style>
            .logs-stats-bar {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                margin-bottom: 16px;
                display: flex;
                gap: 15px;
                align-items: center;
                flex-wrap: wrap;
            }
            .logs-stats-bar .badge {
                background: rgba(255,255,255,0.2);
                color: white;
            }
            .logs-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                gap: 16px;
                flex-wrap: wrap;
            }
            .logs-filters {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            .logs-filters .form-control {
                min-width: 180px;
            }
            .logs-actions {
                display: flex;
                gap: 8px;
            }
            .logs-table tbody tr:hover {
                background: #f8fafc;
            }
            .logs-table code {
                background: #e2e8f0;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
            }
            .logs-footer {
                text-align: center;
                margin-top: 16px;
            }
            @media (max-width: 768px) {
                .logs-toolbar {
                    flex-direction: column;
                    align-items: stretch;
                }
                .logs-filters, .logs-actions {
                    flex-direction: column;
                }
                .logs-filters .form-control {
                    min-width: 100%;
                }
            }
        </style>
    `;
}
