// 1. Import Firebase
import { auth, provider, db } from './firebase.js';
import { 
    signInWithPopup, // Quay lại dùng Popup cho ổn định
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- UTILS ---
function convertDriveLink(url) {
    if (!url) return 'https://placehold.co/50x50';
    if (!url.includes('drive.google.com')) return url;
    let id = '';
    const parts = url.split('/');
    const dIndex = parts.indexOf('d');
    if (dIndex !== -1 && parts[dIndex + 1]) id = parts[dIndex + 1];
    else if (url.includes('id=')) id = url.match(/id=([^&]+)/)[1];
    if (id) return `https://lh3.googleusercontent.com/d/${id}`;
    return url;
}

// --- DOM ELEMENTS ---
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const btnLogin = document.getElementById('btn-google-login');
const btnLogout = document.getElementById('btn-logout');

console.log("🚀 Admin JS Loaded - Mode: Popup");

// ============================================================
// 1. XỬ LÝ ĐĂNG NHẬP (DÙNG POPUP)
// ============================================================

if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
        console.log("🖱️ Đang bấm đăng nhập...");
        
        // 1. Khóa nút để tránh bấm 2 lần
        btnLogin.disabled = true;
        btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối Google...';
        
        try {
            // 2. Gọi Popup
            const result = await signInWithPopup(auth, provider);
            console.log("✅ Login thành công:", result.user.email);
            // onAuthStateChanged sẽ tự lo phần còn lại
            
        } catch (error) {
            console.error("❌ Lỗi Login:", error);
            
            // Xử lý lỗi hay gặp
            if (error.code === 'auth/popup-closed-by-user') {
                alert("Bạn đã tắt cửa sổ đăng nhập!");
            } else if (error.code === 'auth/cancelled-popup-request') {
                console.log("Xung đột popup, bỏ qua.");
            } else {
                alert("Lỗi: " + error.message);
            }

            // Mở lại nút
            btnLogin.disabled = false;
            btnLogin.innerHTML = '<i class="fa-brands fa-google"></i> Đăng nhập bằng Google';
        }
    });
}

// Đăng xuất
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        if(confirm("Đăng xuất?")) {
            await signOut(auth);
            window.location.reload();
        }
    });
}

// ============================================================
// 2. LẮNG NGHE TRẠNG THÁI (QUAN TRỌNG NHẤT)
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("🔓 Phát hiện user:", user.email);
        
        // Ẩn Login, Hiện Dashboard
        if (loginScreen) loginScreen.style.display = 'none';
        if (dashboardScreen) dashboardScreen.style.display = 'flex';
        
        // Load dữ liệu
        loadAllData();
        
    } else {
        console.log("🔒 Chưa có user");
        if (loginScreen) loginScreen.style.display = 'flex';
        if (dashboardScreen) dashboardScreen.style.display = 'none';
        
        if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.innerHTML = '<i class="fa-brands fa-google"></i> Đăng nhập bằng Google';
        }
    }
});

// ============================================================
// 3. LOAD DỮ LIỆU
// ============================================================
function loadAllData() {
    console.log("📦 Đang tải dữ liệu từ Firestore...");
    loadGalleryAdmin();
    loadLeadersAdmin();
    loadConfessionsAdmin();
    loadSettings();
    loadSystemAdmins();
}

// --- GALLERY ---
window.addGallery = async () => {
    const url = document.getElementById('gal-url').value;
    const caption = document.getElementById('gal-caption').value;
    const year = document.getElementById('gal-year').value;
    if(!url) return alert("Thiếu link ảnh!");
    try {
        await addDoc(collection(db, "xtn_gallery"), { image_url: url, caption, year, created_at: new Date().toISOString() });
        alert("Đã thêm ảnh!"); document.getElementById('gal-url').value = ''; loadGalleryAdmin();
    } catch (e) { console.error(e); alert("Lỗi thêm ảnh: " + e.message); }
};

async function loadGalleryAdmin() {
    const list = document.getElementById('list-gallery');
    if(!list) return;
    list.innerHTML = 'Loading...';
    try {
        const q = query(collection(db, "xtn_gallery"), orderBy("created_at", "desc"));
        const snap = await getDocs(q);
        list.innerHTML = '';
        snap.forEach(d => {
            const data = d.data();
            list.innerHTML += `<li class="data-item"><div class="item-info"><img src="${convertDriveLink(data.image_url)}"><div><b>${data.year}</b> - ${data.caption}</div></div><button class="btn-action btn-del" onclick="deleteItem('xtn_gallery', '${d.id}', loadGalleryAdmin)">Xóa</button></li>`;
        });
    } catch (e) { console.error(e); list.innerHTML = "Lỗi tải (Check Rules)"; }
}

// --- LEADERS ---
window.addLeader = async () => {
    const name = document.getElementById('lead-name').value;
    const role = document.getElementById('lead-role').value;
    const avatar = document.getElementById('lead-avatar').value;
    const quote = document.getElementById('lead-quote').value;
    if(!name) return alert("Thiếu tên!");
    try {
        await addDoc(collection(db, "xtn_leaders"), { name, role, avatar_url: avatar, quote });
        alert("Đã thêm BCH!"); loadLeadersAdmin();
    } catch (e) { alert(e.message); }
};

async function loadLeadersAdmin() {
    const list = document.getElementById('list-leaders');
    if(!list) return;
    const snap = await getDocs(collection(db, "xtn_leaders"));
    list.innerHTML = '';
    snap.forEach(d => {
        const data = d.data();
        list.innerHTML += `<li class="data-item"><div class="item-info"><img src="${convertDriveLink(data.avatar_url)}"><div><b>${data.name}</b> (${data.role})</div></div><button class="btn-action btn-del" onclick="deleteItem('xtn_leaders', '${d.id}', loadLeadersAdmin)">Xóa</button></li>`;
    });
}

// --- CONFESSIONS ---
window.loadConfessionsAdmin = async () => {
    const list = document.getElementById('list-confessions');
    if(!list) return;
    list.innerHTML = 'Loading...';
    const q = query(collection(db, "xtn_confessions"), where("status", "==", "pending"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    list.innerHTML = snap.empty ? '<p>Không có tin nhắn mới.</p>' : '';
    snap.forEach(d => {
        const data = d.data();
        list.innerHTML += `<li class="data-item" style="flex-direction:column; align-items:flex-start;"><div style="margin-bottom:10px;"><b>${data.sender}</b>: "${data.content}"</div><div><button class="btn-action btn-approve" onclick="approveConfession('${d.id}')">✅ Duyệt</button><button class="btn-action btn-del" onclick="deleteItem('xtn_confessions', '${d.id}', loadConfessionsAdmin)">❌ Xóa</button></div></li>`;
    });
};

window.approveConfession = async (id) => {
    try { await updateDoc(doc(db, "xtn_confessions", id), { status: "approved" }); loadConfessionsAdmin(); } catch (e) { alert(e.message); }
};

// --- SETTINGS & ADMINS ---
async function loadSettings() {
    try {
        const configDoc = await getDoc(doc(db, "xtn_settings", "config"));
        if(configDoc.exists()) {
            // Lấy giá trị cũ
            document.getElementById('set-date').value = configDoc.data().target_date;
        }
    } catch(e) { console.log("Chưa có setting"); }
}

window.saveSettings = async () => {
    const date = document.getElementById('set-date').value;
    try { await setDoc(doc(db, "xtn_settings", "config"), { target_date: date }, { merge: true }); alert("Đã lưu!"); } catch (e) { alert(e.message); }
};

window.addSystemAdmin = async () => {
    const email = document.getElementById('adm-email').value;
    const name = document.getElementById('adm-name').value;
    if(!email) return alert("Nhập email!");
    try { await setDoc(doc(db, "xtn_admins", email), { email, name }); alert("Đã thêm Admin!"); loadSystemAdmins(); } catch(e) { alert(e.message); }
}

async function loadSystemAdmins() {
    const list = document.getElementById('list-admins');
    if(!list) return;
    const snap = await getDocs(collection(db, "xtn_admins"));
    list.innerHTML = '';
    snap.forEach(d => { list.innerHTML += `<li class="data-item"><span>${d.data().name} (${d.id})</span></li>`; });
}

// --- DELETE ---
window.deleteItem = async (collName, id, reloadFunc) => {
    if(!confirm("Chắc chắn xóa?")) return;
    try { await deleteDoc(doc(db, collName, id)); reloadFunc(); } catch (e) { alert("Lỗi xóa: " + e.message); }
};
// --- THÊM ĐOẠN NÀY VÀO CUỐI CÙNG FILE js/admin.js ---

// Đưa các hàm ra phạm vi toàn cục (Window) để HTML gọi được
window.addGallery = addGallery;
window.loadGalleryAdmin = loadGalleryAdmin;
window.addLeader = addLeader;
window.loadLeadersAdmin = loadLeadersAdmin;
window.loadConfessionsAdmin = loadConfessionsAdmin;
window.approveConfession = approveConfession;
window.saveSettings = saveSettings;
window.addSystemAdmin = addSystemAdmin;
window.loadSystemAdmins = loadSystemAdmins;
window.deleteItem = deleteItem;
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    // Tìm menu item tương ứng để active (hack nhẹ DOM)
    const iconMap = {
        'tab-gallery': 'fa-images',
        'tab-leaders': 'fa-users',
        'tab-confessions': 'fa-envelope',
        'tab-settings': 'fa-gear',
        'tab-admins': 'fa-user-shield'
    };
    // Logic active menu đơn giản
    event.currentTarget.classList.add('active');
};