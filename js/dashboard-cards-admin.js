/**
 * Dashboard Cards Admin Module
 * Quản trị thẻ chiến sĩ - tương tự MHX
 */

import { db } from './firebase.js';
import { collection, getDocs, query, where, deleteDoc, doc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// google-drive.js đã bị xóa

// ============================================================
// STATE
// ============================================================
let allCards = [];
let allMembers = [];
let teamsMap = {};
let currentView = 'grid';
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

        // Load team filter options
        const filterSelect = document.getElementById('cards-filter-team');
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">-- Tất cả đội --</option>';
            Object.entries(teamsMap).forEach(([id, name]) => {
                filterSelect.innerHTML += `<option value="${id}">${name}</option>`;
            });
        }

        // Load cards
        const cardsSnap = await getDocs(collection(db, 'xtn_cards'));
        allCards = [];
        cardsSnap.forEach(d => {
            allCards.push({ id: d.id, ...d.data() });
        });

        // Load all members (to show who hasn't created card)
        const membersSnap = await getDocs(query(collection(db, 'xtn_users'), where('role', '==', 'member')));
        allMembers = [];
        membersSnap.forEach(d => {
            const data = d.data();
            allMembers.push({
                id: d.id,
                name: data.name || '',
                mssv: data.mssv || '',
                team_id: data.team_id || '',
                team_name: teamsMap[data.team_id] || 'Chưa phân đội',
                city_card_link: data.city_card_link || ''
            });
        });

        console.log('[CardsAdmin] Data loaded:', { cards: allCards.length, members: allMembers.length });
        render();
    } catch (error) {
        console.error('[CardsAdmin] Load error:', error);
        document.getElementById('cards-grid-container').innerHTML =
            '<p style="text-align:center;color:red;grid-column:1/-1;">Lỗi tải dữ liệu</p>';
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
        data = data.filter(d => d.team_id === filterTeam);
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
    if (currentView === 'grid') {
        renderGrid();
    } else {
        renderTable();
    }
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

        return `<tr>
            <td>${stt}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.mssv || '-'}</td>
            <td>${item.team_name}</td>
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
        : confirm('Xóa thẻ này?');

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

// ============================================================
// EXPORTS
// ============================================================
export { loadCardsData };
