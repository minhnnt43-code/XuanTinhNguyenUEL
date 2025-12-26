/**
 * Dashboard Cards Admin Module
 * Quản trị thẻ chiến sĩ - tương tự MHX
 */

import { db } from './firebase.js';
import { collection, getDocs, query, where, deleteDoc, doc, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// google-drive.js đã bị xóa

// ============================================================
// STATE
// ============================================================
let allCards = [];
let allMembers = [];
let teamsMap = {};
let currentView = 'table';  // Mặc định dạng bảng
let currentPage = 1;
let itemsPerPage = 24;
let searchTerm = '';
let filterTeam = '';
let filterStatus = '';
let filterCityCard = '';
let showAlertFn = null;
let showConfirmFn = null;

// ============================================================
// INIT
// ============================================================
export function initCardsAdmin() {
    console.log('[CardsAdmin] Initializing...');
    loadCardsData();
    setupEventListeners();
}

export function setHelpers(alertFn, confirmFn) {
    showAlertFn = alertFn;
    showConfirmFn = confirmFn;
}

function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.cards-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentView = tab.dataset.view;
            currentPage = 1;
            document.querySelectorAll('.cards-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('cards-grid-view').classList.toggle('active', currentView === 'grid');
            document.getElementById('cards-table-view').classList.toggle('active', currentView === 'table');
            render();
        });
    });

    // Search
    document.getElementById('cards-search')?.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        currentPage = 1;
        render();
    });

    // Filter Team
    document.getElementById('cards-filter-team')?.addEventListener('change', (e) => {
        filterTeam = e.target.value;
        currentPage = 1;
        render();
    });

    // Filter Status
    document.getElementById('cards-filter-status')?.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        currentPage = 1;
        render();
    });

    // Filter City Card
    document.getElementById('cards-filter-city')?.addEventListener('change', (e) => {
        filterCityCard = e.target.value;
        currentPage = 1;
        render();
    });

    // Pagination
    document.getElementById('cards-prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            render();
        }
    });

    document.getElementById('cards-next-page')?.addEventListener('click', () => {
        const filtered = getFilteredData();
        const totalPages = Math.ceil(filtered.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            render();
        }
    });

    // Export
    document.getElementById('btn-export-cards')?.addEventListener('click', exportToExcel);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadCardsData() {
    try {
        // Load teams
        const teamsSnap = await getDocs(collection(db, 'xtn_teams'));
        teamsMap = {};
        teamsSnap.forEach(d => {
            teamsMap[d.id] = d.data().team_name || d.id;
        });

        // Static mapping fallback (nếu xtn_teams rỗng hoặc thiếu)
        const STATIC_TEAM_MAP = {
            'ban-chi-huy-chien-dich': 'Ban Chỉ huy Chiến dịch',
            'xuan-tu-hao': 'Đội hình Xuân tự hào',
            'xuan-ban-sac': 'Đội hình Xuân bản sắc',
            'xuan-se-chia': 'Đội hình Xuân sẻ chia',
            'xuan-gan-ket': 'Đội hình Xuân gắn kết',
            'xuan-chien-si': 'Đội hình Xuân chiến sĩ',
            'tet-van-minh': 'Đội hình Tết văn minh',
            'tu-van-giang-day-phap-luat': 'Đội hình Tư vấn và giảng dạy pháp luật cộng đồng',
            'giai-dieu-mua-xuan': 'Đội hình Giai điệu mùa xuân',
            'vien-chuc-tre': 'Đội hình Viên chức trẻ',
            'hau-can': 'Đội hình Hậu cần',
            'ky-su-tet': 'Đội hình Ký sự Tết'
        };


        // Merge static vào teamsMap nếu chưa có
        Object.keys(STATIC_TEAM_MAP).forEach(id => {
            if (!teamsMap[id]) {
                teamsMap[id] = STATIC_TEAM_MAP[id];
            }
        });

        // Thứ tự đội hình chuẩn (same as dashboard-core.js)
        const TEAM_ORDER = {
            'ban-chi-huy-chien-dich': 0,
            'xuan-tu-hao': 1,
            'xuan-ban-sac': 2,
            'xuan-se-chia': 3,
            'xuan-gan-ket': 4,
            'xuan-chien-si': 5,
            'tet-van-minh': 6,
            'tu-van-giang-day-phap-luat': 7,
            'giai-dieu-mua-xuan': 8,
            'vien-chuc-tre': 9,
            'hau-can': 10,
            'ky-su-tet': 11
        };

        // Load team filter options - CHỈ DÙNG STATIC LIST để tránh duplicate
        const filterSelect = document.getElementById('cards-filter-team');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">-- Tất cả đội --</option>';

            // Dùng STATIC_TEAM_MAP đã sắp xếp theo TEAM_ORDER
            Object.entries(STATIC_TEAM_MAP)
                .sort((a, b) => (TEAM_ORDER[a[0]] ?? 999) - (TEAM_ORDER[b[0]] ?? 999))
                .forEach(([id, name]) => {
                    filterSelect.innerHTML += `<option value="${id}">${name}</option>`;
                });
        }

        // Load registrations (để lấy preferred_team nếu team_id trống)
        const regsSnap = await getDocs(collection(db, 'xtn_registrations'));
        const regsMap = {};
        regsSnap.forEach(d => {
            const r = d.data();
            regsMap[r.user_id] = r;
        });

        // ⚠️ QUAN TRỌNG: Load members TRƯỚC khi setup onSnapshot
        // Vì onSnapshot sẽ gọi render() ngay lập tức
        const allUsersSnap = await getDocs(collection(db, 'xtn_users'));
        allMembers = [];
        allUsersSnap.forEach(d => {
            const data = d.data();
            const reg = regsMap[d.id] || {};
            // Giống hệt Danh sách Chiến sĩ: fallback team_id từ registrations

            const teamId = data.team_id || reg.preferred_team || '';
            allMembers.push({
                id: d.id,
                name: data.name || '',
                mssv: data.mssv || '',
                email: data.email || '',
                team_id: teamId,
                team_name: teamsMap[teamId] || STATIC_TEAM_MAP[teamId] || 'Chưa phân đội',
                city_card_link: data.city_card_link || '',
                role: data.role || 'member',
                position: data.position || 'Chiến sĩ'
            });
        });

        // Sắp xếp theo thứ tự đội hình + chức vụ (giống Danh sách Chiến sĩ)
        const positionOrder = {
            'Chỉ huy Trưởng': 1,
            'Chỉ huy Phó Thường trực': 2,
            'Chỉ huy Phó': 3,
            'Thành viên Thường trực Ban Chỉ huy': 4,
            'Thành viên Ban Chỉ huy': 5,
            'Đội trưởng': 6,
            'Đội phó': 7,
            'Chiến sĩ': 8
        };

        allMembers.sort((a, b) => {
            // 1. Theo đội hình
            const orderA = TEAM_ORDER[a.team_id] ?? 999;
            const orderB = TEAM_ORDER[b.team_id] ?? 999;
            if (orderA !== orderB) return orderA - orderB;

            // 2. Theo chức vụ
            const posA = positionOrder[a.position] ?? 99;
            const posB = positionOrder[b.position] ?? 99;
            if (posA !== posB) return posA - posB;

            // 3. Theo tên
            return (a.name || '').localeCompare(b.name || '', 'vi');
        });

        console.log('[CardsAdmin] Members loaded:', allMembers.length);
        console.log('[CardsAdmin] TeamsMap:', teamsMap);
        console.log('[CardsAdmin] Sample member team_id:', allMembers[0]?.team_id);

        // DEBUG: Dump chi tiết để so sánh
        window.debugCardsData = function () {
            console.log('=== DEBUG QUẢN TRỊ THẺ ===');
            console.log('Total members:', allMembers.length);
            console.log('All members:', allMembers);

            // Group by team
            const byTeam = {};
            allMembers.forEach(m => {
                const team = m.team_name || 'Chưa phân đội';
                if (!byTeam[team]) byTeam[team] = [];
                byTeam[team].push(m.name);
            });
            console.log('By team:', byTeam);

            // List BCH CD specifically
            const bchcd = allMembers.filter(m => m.team_name && m.team_name.includes('Chỉ huy'));
            console.log('BCH CD members:', bchcd.map(m => m.name));

            return { total: allMembers.length, byTeam, bchcd };
        };
        console.log('[CardsAdmin] Run debugCardsData() in console to see all data');
        if (allMembers.length > 0) {
            console.log('[CardsAdmin] Sample member:', allMembers[0]);
        }

        // Bây giờ mới setup onSnapshot cho cards (sau khi members đã load xong)
        if (window.cardsAdminUnsubscribe) {
            window.cardsAdminUnsubscribe();
        }
        window.cardsAdminUnsubscribe = onSnapshot(collection(db, 'xtn_cards'), (snapshot) => {
            allCards = [];
            snapshot.forEach(d => {
                allCards.push({ id: d.id, ...d.data() });
            });
            console.log('[CardsAdmin] Cards updated (real-time):', allCards.length);
            render();
        }, (error) => {
            console.error('[CardsAdmin] Cards listener error:', error);
        });
    } catch (error) {
        console.error('[CardsAdmin] Load error:', error);
        const tbody = document.getElementById('cards-table-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red;">Lỗi tải dữ liệu</td></tr>';
    }
}

// ============================================================
// FILTER & SEARCH
// ============================================================
function getFilteredData() {
    // Merge members with cards
    const cardsMap = {};
    allCards.forEach(card => {
        cardsMap[card.user_id] = card;
    });

    let data = allMembers.map(member => {
        const card = cardsMap[member.id] || null;
        return {
            ...member,
            card: card,
            hasCard: !!card,
            // city_card_link được lưu trong xtn_cards (từ saveCityCardLink)
            city_card_link: card?.city_card_link || member.city_card_link || ''
        };
    });

    // Filter by team
    if (filterTeam) {
        console.log('[CardsAdmin] Filtering by team:', filterTeam, '| Sample team_id:', data[0]?.team_id, '| Sample team_name:', data[0]?.team_name);
        // Check both team_id AND team_name to ensure correct filtering
        data = data.filter(d => d.team_id === filterTeam || d.team_name === filterTeam);
    }

    // Filter by status
    if (filterStatus === 'created') {
        data = data.filter(d => d.hasCard);
    } else if (filterStatus === 'not-created') {
        data = data.filter(d => !d.hasCard);
    }

    // Filter by city card
    if (filterCityCard === 'has-city') {
        data = data.filter(d => d.city_card_link && d.city_card_link.trim() !== '');
    } else if (filterCityCard === 'no-city') {
        data = data.filter(d => !d.city_card_link || d.city_card_link.trim() === '');
    }

    // Search
    if (searchTerm) {
        data = data.filter(d =>
            d.name.toLowerCase().includes(searchTerm) ||
            d.mssv.toLowerCase().includes(searchTerm) ||
            d.team_name.toLowerCase().includes(searchTerm)
        );
    }

    return data;
}

// ============================================================
// RENDER
// ============================================================
function render() {
    // Chỉ dùng table view (grid view đã bị xóa)
    renderTable();
    updatePagination();
}

function renderGrid() {
    const container = document.getElementById('cards-grid-container');
    if (!container) return;

    const filtered = getFilteredData();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);

    const startIdx = (currentPage - 1) * itemsPerPage;
    const paged = filtered.slice(startIdx, startIdx + itemsPerPage);

    if (paged.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;grid-column:1/-1;">Không có dữ liệu</p>';
        return;
    }

    container.innerHTML = paged.map(item => {
        if (item.hasCard) {
            const card = item.card;
            const thumbnail = card.thumbnail_url || `https://drive.google.com/thumbnail?id=${card.drive_file_id}&sz=w300`;
            return `
                <div class="card-item" data-card-id="${card.id}">
                    <div class="card-item-actions">
                        <button class="btn-card-delete" onclick="deleteCard('${card.id}', '${card.drive_file_id}')" title="Xóa thẻ">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <a href="${card.drive_link || '#'}" target="_blank">
                        <div class="card-item-image">
                            <img src="${thumbnail}" alt="${item.name}" loading="lazy">
                        </div>
                    </a>
                    <div class="card-item-info">
                        <h4>${item.name}</h4>
                        <p>${item.team_name}</p>
                        <div class="card-badges">
                            ${item.city_card_link ? '<span class="badge badge-info" title="Có Thẻ Cấp Thành"><i class="fa-solid fa-city"></i></span>' : '<span class="badge badge-secondary" title="Chưa có Thẻ Cấp Thành"><i class="fa-regular fa-city"></i></span>'}
                        </div>
                        <small>${formatDate(card.created_at)}</small>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="card-item card-item-empty">
                    <div class="card-item-image">
                        <div class="card-placeholder">
                            <i class="fa-solid fa-id-card"></i>
                            <span>Chưa tạo</span>
                        </div>
                    </div>
                    <div class="card-item-info">
                        <h4>${item.name}</h4>
                        <p>${item.team_name}</p>
                        <div class="card-badges">
                            ${item.city_card_link ? '<span class="badge badge-info" title="Có Thẻ Cấp Thành"><i class="fa-solid fa-city"></i></span>' : '<span class="badge badge-secondary" title="Chưa có Thẻ Cấp Thành"><i class="fa-regular fa-city"></i></span>'}
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');
}

function renderTable() {
    const tbody = document.getElementById('cards-table-body');
    if (!tbody) return;

    const filtered = getFilteredData();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);

    const startIdx = (currentPage - 1) * itemsPerPage;
    const paged = filtered.slice(startIdx, startIdx + itemsPerPage);

    if (paged.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">Không có dữ liệu</td></tr>';
        return;
    }

    tbody.innerHTML = paged.map((item, idx) => {
        const stt = startIdx + idx + 1;
        const statusBadge = item.hasCard
            ? '<span class="badge badge-success">Đã tạo</span>'
            : '<span class="badge badge-warning">Chưa tạo</span>';
        const cityBadge = item.city_card_link
            ? `<a href="${item.city_card_link}" target="_blank" class="badge badge-info" title="Xem Thẻ Cấp Thành"><i class="fa-solid fa-external-link"></i> Có</a>`
            : '<span class="badge badge-secondary">Chưa có</span>';
        const createdAt = item.card ? formatDate(item.card.created_at) : '-';
        const actions = item.hasCard
            ? `<a href="${item.card.drive_link || '#'}" target="_blank" class="btn btn-sm btn-secondary"><i class="fa-solid fa-eye"></i></a>
               <button class="btn btn-sm btn-danger" onclick="deleteCard('${item.card.id}', '${item.card.drive_file_id}')"><i class="fa-solid fa-trash"></i></button>`
            : '-';

        // Team color badge giống Danh sách Chiến sĩ
        const teamColor = getTeamColor(item.team_id);
        const teamBadge = `<span class="badge" style="background:${teamColor}; color:white; padding:4px 10px; border-radius:12px; font-size:12px; white-space:nowrap;">${item.team_name}</span>`;

        return `<tr>
            <td>${stt}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.mssv || '-'}</td>
            <td>${teamBadge}</td>
            <td>${statusBadge}</td>
            <td>${cityBadge}</td>
            <td>${createdAt}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

function updatePagination() {
    const filtered = getFilteredData();
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;

    document.getElementById('cards-page-info').textContent = `Trang ${currentPage} / ${totalPages}`;
    document.getElementById('cards-prev-page').disabled = currentPage <= 1;
    document.getElementById('cards-next-page').disabled = currentPage >= totalPages;
}

// ============================================================
// DELETE CARD
// ============================================================
window.deleteCard = async function (cardId, driveFileId) {
    const confirmed = showConfirmFn
        ? await showConfirmFn('Xóa thẻ này?', 'Xác nhận xóa')
        : await showConfirmModal('Xóa thẻ này?', { title: 'Xác nhận xóa', type: 'danger', confirmText: 'Xóa' });

    if (!confirmed) return;

    try {
        // Delete from Firestore
        await deleteDoc(doc(db, 'xtn_cards', cardId));

        // Delete from Drive - ĐÃ BỎ TÍNH NĂNG
        // if (driveFileId) {
        //     try {
        //         await deleteFileFromDrive(driveFileId);
        //     } catch (e) {
        //         console.warn('[CardsAdmin] Could not delete from Drive:', e);
        //     }
        // }

        // Refresh
        await loadCardsData();

        if (showAlertFn) {
            await showAlertFn('Đã xóa thẻ!', 'success', 'Hoàn thành');
        }
    } catch (error) {
        console.error('[CardsAdmin] Delete error:', error);
        if (showAlertFn) {
            await showAlertFn('Lỗi xóa thẻ!', 'error', 'Lỗi');
        }
    }
};

// ============================================================
// EXPORT EXCEL
// ============================================================
async function exportToExcel() {
    try {
        // Load SheetJS if not loaded
        if (!window.XLSX) {
            await loadScript('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js');
        }

        const data = getFilteredData();
        const exportData = data.map((item, idx) => ({
            'STT': idx + 1,
            'Họ và Tên': item.name,
            'MSSV': item.mssv || '',
            'Đội hình': item.team_name,
            'Trạng thái Thẻ': item.hasCard ? 'Đã tạo' : 'Chưa tạo',
            'Link Thẻ Cấp Thành': item.city_card_link || '',
            'Trạng thái Cấp Thành': item.city_card_link ? 'Có' : 'Chưa có',
            'Thời gian tạo': item.card ? formatDate(item.card.created_at) : ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Thống kê thẻ');
        XLSX.writeFile(workbook, `ThongKe_TheChienSi_${new Date().toISOString().slice(0, 10)}.xlsx`);

        if (showAlertFn) {
            await showAlertFn('Xuất Excel thành công!', 'success', 'Hoàn thành');
        }
    } catch (error) {
        console.error('[CardsAdmin] Export error:', error);
        if (showAlertFn) {
            await showAlertFn('Lỗi xuất Excel!', 'error', 'Lỗi');
        }
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ============================================================
// UTILITIES
// ============================================================
function formatDate(timestamp) {
    if (!timestamp) return '-';
    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
    } else {
        date = timestamp;
    }
    return date.toLocaleString('vi-VN');
}

// Team color generator (giống Danh sách Chiến sĩ)
function getTeamColor(teamId) {
    if (!teamId) return '#6b7280';  // Gray for no team

    const colors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#6366f1', '#84cc16',
        '#f43f5e', '#14b8a6', '#a855f7', '#eab308'
    ];

    // Simple hash
    let hash = 0;
    for (let i = 0; i < teamId.length; i++) {
        hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// ============================================================
// CLEAR ALL CARDS
// ============================================================
window.clearAllCards = async function () {
    const confirmed = showConfirmFn
        ? await showConfirmFn('XÓA TẤT CẢ THẺ? Không thể khôi phục!', 'Xác nhận xóa tất cả')
        : await showConfirmModal('XÓA TẤT CẢ THẺ? Không thể khôi phục!', { title: 'Xác nhận xóa tất cả', type: 'danger', confirmText: 'Xóa tất cả' });

    if (!confirmed) return;

    try {
        const cardsSnap = await getDocs(collection(db, 'xtn_cards'));

        if (cardsSnap.empty) {
            if (showAlertFn) showAlertFn('Không có thẻ nào để xóa!', 'info', 'Thông báo');
            else showToast('Không có thẻ nào để xóa!', 'info');
            return;
        }

        let count = 0;
        const deletePromises = [];
        cardsSnap.forEach(docSnap => {
            deletePromises.push(deleteDoc(doc(db, 'xtn_cards', docSnap.id)));
            count++;
        });

        await Promise.all(deletePromises);

        console.log('[CardsAdmin] Deleted all cards:', count);
        if (showAlertFn) showAlertFn(`Đã xóa ${count} thẻ thành công!`, 'success', 'Thành công');
        else showToast(`Đã xóa ${count} thẻ thành công!`, 'success');

        // Reload data
        loadCardsData();
    } catch (error) {
        console.error('[CardsAdmin] Clear all error:', error);
        if (showAlertFn) showAlertFn('Lỗi: ' + error.message, 'error', 'Lỗi');
        else showToast('Lỗi: ' + error.message, 'error');
    }
};

// ============================================================
// EXPORTS
// ============================================================
export { loadCardsData };
