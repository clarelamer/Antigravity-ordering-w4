# 內部點餐工具實作計畫

此計畫旨在透過純前端（HTML, CSS, JavaScript）技術，實作一個使用 Google Sheets 當作資料庫的公司內部點餐工具。

## User Review Required

> [!IMPORTANT]  
> **Google Cloud Project & API 申請需求：**
> 由於我們不透過任何後端，直接從前端存取 Google Sheets API，必須具備以下資訊填入程式碼才能正常運作：
> 1. **Google OAuth 2.0 Client ID**：需要到 Google Cloud Platform 設定（需支援前端部署的網域，開發時為 http://127.0.0.1 等）。
> 2. **Spreadsheet ID**：Google 試算表的 ID（長度很長的一串字串，取自試算表網址列）。
> 3. **API Key** (選擇性)：用於初始化 GAPI。
> 由於目前只有前端，所以使用者的登入 Token 必須具有這份試算表的「編輯權限」，或者需要使用者能看到這份試算表。本專案將會留出這幾個常數讓您填寫。

## Proposed Changes

### 前端架構設計

#### [NEW] index.html
- 負責畫面結構與 Google Identity Services (GIS) / Google API Library (GAPI) 的腳本匯入。
- 包含主容器：
  - 登入區塊。
  - 統一顯示區（標頭、當前點單概況）。
  - 餐點列表區（對應 TodayConfig 過濾後的內容）。
  - 已點確認區（功能列含複製給 LINE 等通訊軟體用）。
  - 管理員專區（今日可點餐廳設定、清空全部訂單功能）。

#### [NEW] all.css
- 使用 CSS Variable 定義色彩計畫，採用現代感高彩度但不刺眼的設計（主色調藍/綠系）。
- 提供手機友好的排版（Flexbox 與 CSS Grid 混合使用）。
- 卡片式設計，加入滑鼠觸碰提示（hover 微動畫），讓介面顯得高級優雅。

#### [NEW] all.js
- **登入及 API 初始化邏輯：** 載入 GIS 及 GAPI，並透過 `initTokenClient` 請求 Google 帳號對 Google Sheets 的 `spreadsheets` 範圍授權。亦提供抓取自己 Email 的 API 操作。
- **資料庫 (Google Sheets) 讀寫邏輯：**
  - **getUsers()**: 讀取 Users 表以判斷目前登入者權限。
  - **getMenu() / getTodayConfig()**: 取得菜單與今日開放餐廳。
  - **getOrders()**: 取得訂單，並更新畫面最上方的「總金額」及「已點單人數」。
  - **setTodayConfig()**: 更新 TodayConfig 表（清空原表後寫入新陣列），管理員專用。
  - **submitOrder()**: 加入新的點單紀錄至 Orders 表。
  - **clearOrders()**: 管理員專用，清除 Orders 表內除標題外資料。

## Open Questions

> [!WARNING]  
> 1. 關於「複製訂單給 LINE」，是否需要特定的文字格式？例如：`時間 - 姓名 - 餐點 - 備註 (金額)` 條列式輸出？
> 2. 目前是否允許同一個使用者重複送出多筆訂單？(目前預設為只要點擊就會新增)。
> 3. Google 試算表權限方面，因為不透過後端，所有使用這個網頁的人，他們的 Google 帳號本身都需要具備這個試算表的「編輯權限」。若只允許特定人，可以在試算表共用設定將 `Users` 表格裡的信箱加入進去，這樣是否符合您的期望？

## Verification Plan

### Manual Verification
1. 註冊 Google OAuth 的 Client ID 並建立符合條件之庫表，填至 `all.js` 預留區。
2. 使用 Local Server 開啟網頁進行登入。
3. 測試授權攔截（如信箱未被列入 Users）。
4. 測試管理員權限相關行為（更新餐廳列表與清單功能）。
