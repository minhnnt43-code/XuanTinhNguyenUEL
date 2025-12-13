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
let countdownInterval = null; // Để cleanup tránh memory leak

async function initCountdown() {
    try {
        // Clear interval cũ nếu có (tránh memory leak)
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        // Lấy ngày ra quân từ Firestore (xtn_settings/config)
        const docRef = doc(db, "xtn_settings", "config");
        const docSnap = await getDoc(docRef);

        let targetDateStr = "Jan 9, 2026 07:00:00"; // Ngày ra quân XTN 2026
        if (docSnap.exists() && docSnap.data().target_date) {
            targetDateStr = docSnap.data().target_date;
        }

        // Chạy đồng hồ
        const countDate = new Date(targetDateStr).getTime();

        countdownInterval = setInterval(() => {
            const now = new Date().getTime();
            const gap = countDate - now;

            if (gap > 0) {
                const second = 1000, minute = second * 60, hour = minute * 60, day = hour * 24;
                document.getElementById("days").innerText = Math.floor(gap / day);
                document.getElementById("hours").innerText = Math.floor((gap % day) / hour);
                document.getElementById("minutes").innerText = Math.floor((gap % hour) / minute);
                document.getElementById("seconds").innerText = Math.floor((gap % minute) / second);
            } else {
                // Dọn dẹp interval khi countdown kết thúc
                clearInterval(countdownInterval);
                countdownInterval = null;
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
    if (!container) return;

    try {
        // Lấy tất cả ảnh, sắp xếp mới nhất lên đầu (cần tạo Index nếu console báo lỗi)
        const q = query(collection(db, "xtn_gallery"), orderBy("created_at", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<p style="text-align:center; width:100%">Chưa có hình ảnh nào.</p>';
            return;
        }

        // Dùng DocumentFragment để tối ưu DOM (chỉ 1 reflow thay vì N lần)
        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docItem) => {
            const data = docItem.data();
            const imageUrl = convertDriveLink(data.image_url);

            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `
                <img src="${imageUrl}" alt="Hồi ức XTN ${data.year || ''}" loading="lazy">
                <div class="gallery-caption">${data.caption || 'Kỷ niệm XTN'} (${data.year})</div>
            `;
            fragment.appendChild(div);
        });

        container.innerHTML = ''; // Xóa loading spinner
        container.appendChild(fragment);
    } catch (error) {
        console.error("Lỗi load Gallery:", error);
        container.innerHTML = '<p>Đang cập nhật...</p>'; // Fallback nếu lỗi index
    }
}

// 2. Load Ban Chỉ Huy (Leaders)
async function loadLeaders() {
    const container = document.getElementById('leaders-container');
    if (!container) return;

    try {
        const querySnapshot = await getDocs(collection(db, "xtn_leaders"));

        if (querySnapshot.empty) {
            container.innerHTML = '<p>Đang cập nhật danh sách...</p>';
            return;
        }

        // Dùng DocumentFragment để tối ưu DOM
        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docItem) => {
            const data = docItem.data();
            const avatarUrl = convertDriveLink(data.avatar_url) || 'https://placehold.co/150x150?text=U';

            const div = document.createElement('div');
            div.className = 'leader-card';
            div.innerHTML = `
                <img src="${avatarUrl}" alt="${data.name}" class="leader-img">
                <h3 class="leader-name">${data.name}</h3>
                <p class="leader-role">${data.role}</p>
                <p class="leader-quote">"${data.quote || 'Xuân Tình Nguyện'}"</p>
            `;
            fragment.appendChild(div);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    } catch (error) {
        console.error("Lỗi load Leaders:", error);
    }
}

// 3. Load Confessions (Chỉ lấy status = 'approved')
async function loadConfessions() {
    const container = document.getElementById('confessions-container');
    if (!container) return;

    try {
        const q = query(collection(db, "xtn_confessions"), where("status", "==", "approved"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<p>Hãy là người đầu tiên gửi lời nhắn!</p>';
            return;
        }

        // Dùng DocumentFragment để tối ưu DOM
        const fragment = document.createDocumentFragment();
        querySnapshot.forEach((docItem) => {
            const data = docItem.data();
            const colorClass = data.bg_color || 'yellow'; // yellow, red, green

            const div = document.createElement('div');
            div.className = `note ${colorClass}`;
            div.innerHTML = `
                <p class="note-content">"${data.content}"</p>
                <span class="note-sender">- ${data.sender}</span>
            `;
            fragment.appendChild(div);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
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

            showToast('💌 Đã gửi thành công! Lời nhắn sẽ xuất hiện sau khi Ban Chỉ Huy duyệt nhé.', 'success', 5000);
            modal.style.display = "none";
            form.reset();
        } catch (error) {
            showToast('Lỗi: ' + error.message, 'error');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

// ==================================================
// E. HERO BACKGROUND SLIDESHOW
// ==================================================
function initSlideshow() {
    const slides = document.querySelectorAll('.hero-slideshow .slide');
    const dots = document.querySelectorAll('.slide-dots .dot');

    if (slides.length === 0) return;

    let currentSlide = 0;
    const slideInterval = 5000; // 5 seconds per slide

    function showSlide(index) {
        // Remove active from all slides and dots
        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));

        // Set current slide
        currentSlide = index;
        if (currentSlide >= slides.length) currentSlide = 0;
        if (currentSlide < 0) currentSlide = slides.length - 1;

        // Add active to current
        slides[currentSlide].classList.add('active');
        dots[currentSlide].classList.add('active');
    }

    function nextSlide() {
        showSlide(currentSlide + 1);
    }

    // Auto advance slides
    let autoSlide = setInterval(nextSlide, slideInterval);

    // Click on dots to navigate
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            clearInterval(autoSlide);
            showSlide(index);
            autoSlide = setInterval(nextSlide, slideInterval);
        });
    });

    // Pause on hover (optional)
    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
        heroSection.addEventListener('mouseenter', () => {
            clearInterval(autoSlide);
        });
        heroSection.addEventListener('mouseleave', () => {
            autoSlide = setInterval(nextSlide, slideInterval);
        });
    }
}

// ==================================================
// F. MOBILE NAVIGATION TOGGLE
// ==================================================
function initMobileNav() {
    const mobileToggle = document.querySelector('.mobile-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('show');
        });
    }
}

// ==================================================
// G. NAVBAR SCROLL EFFECT
// ==================================================
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// ==================================================
// H. COUNTER ANIMATION (for stats)
// ==================================================
function animateCounter(element, target, duration = 2000) {
    let start = 0;
    const startTime = performance.now();

    function easeOutQuart(x) {
        return 1 - Math.pow(1 - x, 4);
    }

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuart(progress);
        const current = Math.round(easedProgress * target);

        element.textContent = current.toLocaleString('vi-VN');

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// Intersection Observer for counters
function initCounterObserver() {
    const counters = document.querySelectorAll('[data-count]');
    if (counters.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
                const target = parseInt(entry.target.dataset.count, 10);
                animateCounter(entry.target, target);
                entry.target.classList.add('counted');
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

// ==================================================
// I. INTERACTIVE SVG MAP
// ==================================================
function initInteractiveMap() {
    const svg = document.getElementById('hcm-svg-map');
    if (!svg) return;

    const infoDefault = document.getElementById('info-default');
    const infoContent = document.getElementById('info-content');
    const infoTitle = document.getElementById('info-title');
    const infoDesc = document.getElementById('info-desc');
    const infoBadge = document.getElementById('info-badge');

    // Get all interactive elements
    const interactiveGroups = svg.querySelectorAll('[data-district]');

    interactiveGroups.forEach(group => {
        // Hover events
        group.addEventListener('mouseenter', () => {
            showLocationInfo(group);
        });

        // Click events
        group.addEventListener('click', () => {
            // Remove active from all
            interactiveGroups.forEach(g => g.classList.remove('active'));
            // Add active to clicked
            group.classList.add('active');
            showLocationInfo(group);
        });
    });

    function showLocationInfo(element) {
        const name = element.dataset.name;
        const desc = element.dataset.desc;
        const district = element.dataset.district;

        if (!name) return;

        // Update info panel
        infoTitle.textContent = name;
        infoDesc.textContent = desc || 'Địa bàn hoạt động của Xuân Tình Nguyện UEL 2026';

        // Update badge
        if (district === 'uel') {
            infoBadge.textContent = '⭐ Trụ sở chính';
            infoBadge.classList.add('uel');
        } else {
            infoBadge.textContent = 'Địa bàn hoạt động';
            infoBadge.classList.remove('uel');
        }

        // Show info content, hide default
        infoDefault.style.display = 'none';
        infoContent.style.display = 'block';
    }

    // Reset on mouse leave from entire map
    svg.addEventListener('mouseleave', () => {
        // Only reset if no active selection
        const hasActive = svg.querySelector('.active');
        if (!hasActive) {
            infoDefault.style.display = 'block';
            infoContent.style.display = 'none';
        }
    });
}

// ==================================================
// J. CHẠY ỨNG DỤNG
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
    // Core functions
    initCountdown();
    initSlideshow();
    initMobileNav();
    initNavbarScroll();
    initCounterObserver();
    initInteractiveMap();

    // Load data from Firebase
    loadGallery();

    // Optional: only load if elements exist
    const leadersContainer = document.getElementById('leaders-container');
    if (leadersContainer) loadLeaders();

    const confessionsContainer = document.getElementById('confessions-container');
    if (confessionsContainer) {
        loadConfessions();
        setupConfessionModal();
    }
});
