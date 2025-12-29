# 🤖 Kế hoạch Tích hợp AI cho Quản lý Hoạt động XTN 2026

> **Ngày tạo**: 29/12/2024  
> **Mục tiêu**: Tích hợp Groq AI để hỗ trợ tạo báo cáo, chat assistant và tự động hóa quản lý hoạt động

---

## 📋 Tổng quan các Phase

| Phase | Tên | Thời gian ước tính | Mô tả |
|-------|-----|-------------------|-------|
| 1 | Chuẩn bị & Tách module | 1-2 ngày | Dọn dẹp code, tách sections |
| 2 | Tích hợp Groq API cơ bản | 1 ngày | Kết nối API, test gọi đơn giản |
| 3 | AI Báo cáo tự động | 2-3 ngày | Tạo báo cáo tuần/tháng |
| 3.5 | AI Content Writer | 2-3 ngày | Viết bài Fanpage/Recap theo bố cục |
| 4 | AI Chat Assistant | 2-3 ngày | Hỏi đáp thông minh về hoạt động |
| 5 | Nâng cao & Tối ưu | Tùy chọn | Nhắc nhở, export PDF, etc. |

---

## 🔧 Phase 1: Chuẩn bị & Tách module

### Mục tiêu
Dọn dẹp dashboard, chỉ giữ lại phần Quản lý Hoạt động cho BCH

### Công việc
- [ ] Tách phần "Tạo Thẻ Chiến sĩ" ra trang riêng ✅ (đã có `taothechiensi.html`)
- [ ] Ẩn/Xóa phần "Danh sách Chiến sĩ" cho member thường
- [ ] Chỉ giữ lại quyền xem cho BCH Đội hình và BCH Chiến dịch
- [ ] Tách phần "Đội hình" ra nếu cần
- [ ] Tạo file `js/ai-service.js` để chứa logic AI

### Kết quả
- Dashboard gọn gàng, tập trung vào Quản lý Hoạt động
- Cấu trúc code sẵn sàng cho AI integration

---

## 🔌 Phase 2: Tích hợp Groq API cơ bản

### Mục tiêu
Kết nối thành công với Groq API từ frontend

### Cách tiếp cận
**Gọi trực tiếp từ Frontend** (đơn giản, phù hợp nội bộ BCH)

### Công việc
- [ ] Tạo file `js/ai-service.js`
- [ ] Cấu hình Groq API key (lưu trong biến hoặc Firebase Remote Config)
- [ ] Viết hàm `callGroqAPI(prompt)` cơ bản
- [ ] Test gọi API và nhận response
- [ ] Xử lý lỗi (network, rate limit, etc.)

### Cấu trúc file `ai-service.js`
```javascript
// ai-service.js
const GROQ_API_KEY = 'gsk_xxxxx'; // Hoặc lấy từ Firebase
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile'; // Hoặc model khác

export async function callGroqAPI(prompt, systemPrompt = '') {
    // Gọi API và trả về kết quả
}
```

### Lưu ý bảo mật
- ⚠️ API key sẽ lộ trong JS nếu gọi trực tiếp
- ✅ Chấp nhận được nếu chỉ dùng nội bộ BCH
- 🔄 Có thể nâng cấp lên Firebase Functions sau

---

## 📊 Phase 3: AI Báo cáo tự động

### Mục tiêu
AI tự động tạo báo cáo tổng hợp hoạt động

### Tính năng
- [ ] **Báo cáo tuần**: Tổng hợp hoạt động trong 7 ngày qua
- [ ] **Báo cáo tháng**: Tổng hợp hoạt động cả tháng
- [ ] **Báo cáo tùy chọn**: Chọn khoảng thời gian bất kỳ

### Nội dung báo cáo
```
📋 BÁO CÁO HOẠT ĐỘNG TUẦN [DD/MM - DD/MM/YYYY]

1. TỔNG QUAN
   - Tổng số hoạt động: X
   - Tổng lượt tham gia: Y chiến sĩ
   - Đội hình tham gia: A, B, C

2. CHI TIẾT HOẠT ĐỘNG
   - [Tên hoạt động 1]: Ngày, Địa điểm, Số người
   - [Tên hoạt động 2]: ...

3. ĐIỂM NỔI BẬT
   - Hoạt động ấn tượng nhất: ...
   - Ghi chú đặc biệt: ...

4. KẾ HOẠCH TUẦN TỚI
   - Hoạt động sắp diễn ra: ...
```

### UI
- [ ] Thêm nút "📊 Tạo báo cáo AI" trong section Quản lý Hoạt động
- [ ] Modal chọn loại báo cáo (tuần/tháng/tùy chọn)
- [ ] Modal hiển thị kết quả với nút Copy/Download

---

## ✍️ Phase 3.5: AI Content Writer (Viết bài theo bố cục)

### Mục tiêu
AI hỗ trợ viết nội dung bài đăng, tin tức, recap hoạt động theo bố cục có sẵn

### Tính năng
- [ ] **Viết bài Fanpage/Facebook**: Tạo caption cho bài đăng hoạt động
- [ ] **Recap hoạt động**: Viết bài tổng kết sau mỗi hoạt động
- [ ] **Tin tức nội bộ**: Thông báo cho chiến sĩ
- [ ] **Template tùy chỉnh**: BCH có thể thêm bố cục riêng

### Các bố cục có sẵn

#### 📱 Bài đăng Fanpage
```
🌸 [TIÊU ĐỀ HOẠT ĐỘNG] 🌸

📅 Thời gian: [Ngày/Giờ]
📍 Địa điểm: [Địa chỉ]

[Mô tả ngắn gọn về hoạt động - 2-3 câu]

✨ Điểm nổi bật:
• [Điểm 1]
• [Điểm 2]
• [Điểm 3]

👥 Với sự tham gia của [X] chiến sĩ đến từ [Đội hình]

#XuanTinhNguyen2026 #XTN2026 #UEL #TinhNguyenViet
```

#### 📝 Recap hoạt động
```
📋 RECAP: [TÊN HOẠT ĐỘNG]

🗓️ Diễn ra vào: [Ngày tháng năm]
📍 Tại: [Địa điểm]

【 TỔNG QUAN 】
[Mô tả tổng quan hoạt động trong 3-4 câu]

【 THÀNH QUẢ 】
✅ [Thành quả 1]
✅ [Thành quả 2]
✅ [Thành quả 3]

【 CẢM NHẬN 】
"[Trích dẫn cảm nhận từ chiến sĩ/người dân]"

💚 Cảm ơn [X] chiến sĩ đã đồng hành!

---
#XTN2026 #XuanTinhNguyenUEL #Recap
```

#### 📢 Thông báo nội bộ
```
📢 THÔNG BÁO

Kính gửi toàn thể Chiến sĩ [Đội hình],

[Nội dung thông báo]

⏰ Thời gian: [...]
📍 Địa điểm: [...]
📋 Chuẩn bị: [...]

Mọi thắc mắc vui lòng liên hệ BCH Đội hình.

Trân trọng,
Ban Chỉ huy [Đội hình]
```

### UI Content Writer
- [ ] Nút "✍️ AI Viết bài" trong section Hoạt động
- [ ] Modal chọn loại bài viết (Fanpage/Recap/Thông báo)
- [ ] Input: Chọn hoạt động hoặc nhập thông tin
- [ ] Output: Bài viết đã format, có nút Copy

### Flow sử dụng
```
1. BCH chọn hoạt động từ danh sách (hoặc nhập mới)
2. Chọn loại bài viết (Fanpage/Recap/Thông báo)
3. AI tạo nội dung theo bố cục
4. BCH review, chỉnh sửa nếu cần
5. Copy và đăng lên Fanpage/Group
```

---

## 💬 Phase 4: AI Chat Assistant

### Mục tiêu
Cho phép BCH hỏi đáp về hoạt động bằng ngôn ngữ tự nhiên

### Tính năng
- [ ] **Hỏi đáp nhanh**: "Tháng này có bao nhiêu hoạt động?"
- [ ] **Tìm kiếm thông minh**: "Tìm hoạt động về môi trường"
- [ ] **Gợi ý khi nhập liệu**: AI suggest nội dung khi tạo hoạt động mới

### Câu hỏi mẫu AI có thể trả lời
- "Tuần này có hoạt động gì?"
- "Đội Ký sự Tết đã tham gia những hoạt động nào?"
- "Tổng số chiến sĩ tham gia trong tháng 1?"
- "Hoạt động nào có nhiều người tham gia nhất?"
- "Liệt kê tất cả hoạt động ở quận 7"

### UI
- [ ] Nút chat floating ở góc phải (💬)
- [ ] Chat popup với input box
- [ ] Hiển thị tin nhắn kiểu messenger
- [ ] Loading indicator khi AI đang trả lời

---

## 🚀 Phase 5: Nâng cao & Tối ưu (Tùy chọn)

### Tính năng có thể thêm sau
- [ ] **Nhắc nhở deadline**: Toast/notification khi hoạt động sắp diễn ra
- [ ] **Export PDF**: Xuất báo cáo đẹp hơn với format PDF
- [ ] **Lịch sử chat**: Lưu các cuộc hội thoại với AI
- [ ] **Voice input**: Hỏi AI bằng giọng nói
- [ ] **Nâng cấp bảo mật**: Chuyển sang Firebase Functions

---

## 📁 Cấu trúc file sau khi hoàn thành

```
js/
├── ai-service.js          # Core AI logic
├── ai-report.js           # Báo cáo AI  
├── ai-chat.js             # Chat Assistant
├── dashboard-activity.js  # Quản lý hoạt động (có gọi AI)
└── ...

css/
├── ai-chat.css            # Style cho chat popup
└── ...
```

---

## 🔑 Cấu hình API Key

### Option A: Hard-code (đơn giản, nội bộ)
```javascript
// js/ai-service.js
const GROQ_API_KEY = 'gsk_your_api_key_here';
```

### Option B: Firebase Remote Config (khuyến nghị hơn)
```javascript
// Lấy key từ Firebase, không lộ trong code
import { getRemoteConfig, getValue } from 'firebase/remote-config';
const remoteConfig = getRemoteConfig();
const apiKey = getValue(remoteConfig, 'groq_api_key').asString();
```

---

## ✅ Checklist tổng hợp

### Phase 1
- [ ] Tách module xong
- [ ] File `ai-service.js` đã tạo

### Phase 2
- [ ] Gọi Groq API thành công
- [ ] Xử lý lỗi ổn định

### Phase 3
- [ ] Báo cáo tuần hoạt động
- [ ] Báo cáo tháng hoạt động
- [ ] UI modal báo cáo

### Phase 4
- [ ] Chat popup hoạt động
- [ ] Hỏi đáp cơ bản được
- [ ] Tìm kiếm thông minh

---

## 📞 Liên hệ

Nếu cần điều chỉnh kế hoạch, hãy cho biết!

---

*Tài liệu này được tạo bởi AI Assistant - 29/12/2024*
