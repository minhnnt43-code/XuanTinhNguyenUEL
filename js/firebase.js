// 1. Import thư viện từ CDN (để chạy trực tiếp trên trình duyệt không cần cài đặt)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 2. Cấu hình của bạn
const firebaseConfig = {
  apiKey: "AIzaSyALk7G3YFjHgGXlxI06oKEwHCDtzGklsQw",
  authDomain: "xuantinhnguyenuel-7ec2c.firebaseapp.com",
  projectId: "xuantinhnguyenuel-7ec2c",
  storageBucket: "xuantinhnguyenuel-7ec2c.firebasestorage.app",
  messagingSenderId: "426220182406",
  appId: "1:426220182406:web:f230ad5e4e1ccd8777ea07"
};

// 3. Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// 4. Xuất các công cụ để dùng ở file khác
const db = getFirestore(app);       // Cái này để lưu ảnh, confession, settings
const auth = getAuth(app);          // Cái này để Admin đăng nhập
const provider = new GoogleAuthProvider(); // Đăng nhập bằng Google

// 5. Bật cache offline (IndexedDB) - LOAD NHANH HƠN
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('[Firebase] Persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('[Firebase] Persistence not supported by browser');
  }
});

export { db, auth, provider };