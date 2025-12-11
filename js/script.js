// 1. Import các hàm cần thiết từ firebase.js và thư viện Firestore
import { db } from './firebase.js';
import {
    collection, getDocs, doc, getDoc, addDoc, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==================================================
// A. HÀM HỖ TRỢ (UTILS)
// ==================================================

// Hàm biến link Google Drive thường thành link ảnh trực tiếp
function convertDriveLink(url) {
    if (!url) return 'https://placehold.co/600x400?text=No+Image';
    // Nếu là link ảnh thường (imgur, fb...) thì giữ nguyên
    if (!url.includes('drive.google.com')) return url;

    // Tách ID từ link Drive
    let id = '';
    const parts = url.split('/');
    // Dạng: .../d/FILE_ID/view...
    const dIndex = parts.indexOf('d');
    if (dIndex !== -1 && parts[dIndex + 1]) {
        id = parts[dIndex + 1];
    } else if (url.includes('id=')) {
        // Dạng: ...?id=FILE_ID
        const match = url.match(/id=([^&]+)/);
        if (match) id = match[1];
    }

    if (id) return `https://lh3.googleusercontent.com/d/${id}`;
    return url;
}

// ==================================================
// B. XỬ LÝ ĐẾM NGƯỢC (COUNTDOWN)
// ==================================================
async function initCountdown() {
    try {
        // Lấy ngày ra quân từ Firestore (xtn_settings/config)
        const docRef = doc(db, "xtn_settings", "config");
        const docSnap = await getDoc(docRef);

        let targetDateStr = "Jan 15, 2025 07:00:00"; // Mặc định nếu chưa setup
        if (docSnap.exists() && docSnap.data().target_date) {
            targetDateStr = docSnap.data().target_date;
        }

        // Chạy đồng hồ
        const countDate = new Date(targetDateStr).getTime();

        setInterval(() => {
            const now = new Date().getTime();
            const gap = countDate - now;

            if (gap > 0) {
                const second = 1000, minute = second * 60, hour = minute * 60, day = hour * 24;
                document.getElementById("days").innerText = Math.floor(gap / day);
                document.getElementById("hours").innerText = Math.floor((gap % day) / hour);
                document.getElementById("minutes").innerText = Math.floor((gap % hour) / minute);
                document.getElementById("seconds").innerText = Math.floor((gap % minute) / second);
            } else {
                document.querySelector(".countdown-wrapper").innerHTML =
                    "<h3 style='color:#FFC600; font-size:1.5rem; text-shadow: 1px 1px 2px black;'>🚀 CHIẾN DỊCH ĐÃ BẮT ĐẦU!</h3>";
            }
        }, 1000);

    } catch (error) {
        console.error("Lỗi countdown:", error);
    }
}

// ==================================================
// C. LOAD DỮ LIỆU TỪ FIREBASE
// ==================================================

// 1. Load Ảnh Hồi ức (Gallery)
async function loadGallery() {
    const container = document.getElementById('gallery-container');
    try {
        // Lấy tất cả ảnh, sắp xếp mới nhất lên đầu (cần tạo Index nếu console báo lỗi)
        const q = query(collection(db, "xtn_gallery"), orderBy("created_at", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<p style="text-align:center; width:100%">Chưa có hình ảnh nào.</p>';
            return;
        }

        container.innerHTML = ''; // Xóa loading spinner
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const imageUrl = convertDriveLink(data.image_url);

            const html = `
                <div class="gallery-item">
                    <img src="${imageUrl}" alt="Hồi ức" loading="lazy">
                    <div class="gallery-caption">${data.caption || 'Kỷ niệm XTN'} (${data.year})</div>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        console.error("Lỗi load Gallery:", error);
        container.innerHTML = '<p>Đang cập nhật...</p>'; // Fallback nếu lỗi index
    }
}

// 2. Load Ban Chỉ Huy (Leaders)
async function loadLeaders() {
    const container = document.getElementById('leaders-container');
    try {
        const querySnapshot = await getDocs(collection(db, "xtn_leaders"));

        if (querySnapshot.empty) {
            container.innerHTML = '<p>Đang cập nhật danh sách...</p>';
            return;
        }

        container.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const avatarUrl = convertDriveLink(data.avatar_url) || 'https://placehold.co/150x150?text=U';

            const html = `
                <div class="leader-card">
                    <img src="${avatarUrl}" alt="${data.name}" class="leader-img">
                    <h3 class="leader-name">${data.name}</h3>
                    <p class="leader-role">${data.role}</p>
                    <p class="leader-quote">"${data.quote || 'Xuân Tình Nguyện'}"</p>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        console.error("Lỗi load Leaders:", error);
    }
}

// 3. Load Confessions (Chỉ lấy status = 'approved')
async function loadConfessions() {
    const container = document.getElementById('confessions-container');
    try {
        const q = query(collection(db, "xtn_confessions"), where("status", "==", "approved"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<p>Hãy là người đầu tiên gửi lời nhắn!</p>';
            return;
        }

        container.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const colorClass = data.bg_color || 'yellow'; // yellow, red, green

            const html = `
                <div class="note ${colorClass}">
                    <p class="note-content">"${data.content}"</p>
                    <span class="note-sender">- ${data.sender}</span>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        console.error("Lỗi load Confession:", error);
    }
}

// ==================================================
// D. XỬ LÝ GỬI CONFESSION (MODAL)
// ==================================================
function setupConfessionModal() {
    const modal = document.getElementById("confession-modal");
    const btnOpen = document.getElementById("btn-open-modal");
    const spanClose = document.getElementsByClassName("close-modal")[0];
    const form = document.getElementById("confession-form");

    btnOpen.onclick = () => modal.style.display = "block";
    spanClose.onclick = () => modal.style.display = "none";
    window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; }

    form.onsubmit = async (e) => {
        e.preventDefault();

        const btn = form.querySelector('.btn-submit');
        const originalText = btn.innerText;
        btn.innerText = "Đang gửi...";
        btn.disabled = true;

        const sender = document.getElementById("sender-name").value || "Ẩn danh";
        const content = document.getElementById("sender-content").value;
        const color = document.querySelector('input[name="note-color"]:checked').value;

        try {
            await addDoc(collection(db, "xtn_confessions"), {
                sender: sender,
                content: content,
                bg_color: color,
                status: "pending", // Quan trọng: Gửi lên là chờ duyệt
                timestamp: new Date().toISOString()
            });

            alert("💌 Đã gửi thành công! Lời nhắn sẽ xuất hiện sau khi Ban Chỉ Huy duyệt nhé.");
            modal.style.display = "none";
            form.reset();
        } catch (error) {
            alert("Lỗi: " + error.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

// ==================================================
// E. CHẠY ỨNG DỤNG
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
    initCountdown();
    loadGallery();
    loadLeaders();
    loadConfessions();
    setupConfessionModal();
});