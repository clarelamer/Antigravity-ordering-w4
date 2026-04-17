/**
 * 公司內部點餐系統 - 主要邏輯
 * 使用 Vanilla JS + Fetch API 串接 Google Sheets API
 */

// ==========================================
// 系統設定常數 (發布前請填入正式環境變數)
// ==========================================
const CLIENT_ID = '990413580693-acr4apmppefn5d81tk23k9f7sfg3jar7.apps.googleusercontent.com'; // e.g. '123456-abc.apps.googleusercontent.com'
const SPREADSHEET_ID = '1KeUyDnOFK4npbCZewKKye7J9gQ0hyDCuX2hyOdwBriY'; // 取自試算表網址列

// 應用程式狀態全域變數
const state = {
    accessToken: null,
    user: null, // { name: '', email: '', role: '' }
    todayRestaurants: [], // 今日開放的餐廳名稱清單
    menuItems: [], // 完整菜單
    orders: []     // 今日訂單清單
};

// ==========================================
// DOM 元素選取
// ==========================================
const DOM = {
    loginSection: document.getElementById('loginSection'),
    mainDashboard: document.getElementById('mainDashboard'),
    loginErrorMsg: document.getElementById('loginErrorMsg'),
    googleLoginBtn: document.getElementById('googleLoginBtn'),
    userInfo: document.getElementById('userInfo'),
    userNameRole: document.getElementById('userNameRole'),
    logoutBtn: document.getElementById('logoutBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),

    // Admin
    adminSection: document.getElementById('adminSection'),
    restaurantCheckboxes: document.getElementById('restaurantCheckboxes'),
    saveRestaurantsBtn: document.getElementById('saveRestaurantsBtn'),
    clearOrdersBtn: document.getElementById('clearOrdersBtn'),

    // Info & Ordering
    statPeople: document.getElementById('statPeople'),
    statTotal: document.getElementById('statTotal'),
    openRestaurantsList: document.getElementById('openRestaurantsList'),
    menuCardsContainer: document.getElementById('menuCardsContainer'),

    // Orders
    ordersTableBody: document.getElementById('ordersTableBody'),
    copyOrdersBtn: document.getElementById('copyOrdersBtn')
};

// ==========================================
// 初始化與身份驗證 (Google Identity Services)
// ==========================================

let tokenClient;

window.onload = function () {
    // 初始化 GIS Token Client
    // 請求的 scope：包含取得使用者信箱，以及讀寫 Google 試算表。
    if (typeof google !== 'undefined') {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets',
            callback: handleAuthResponse
        });

        DOM.googleLoginBtn.addEventListener('click', () => {
            // 觸發登入授權彈窗
            tokenClient.requestAccessToken({ prompt: '' });
        });
    } else {
        showError('Google API 載入失敗，請檢查網路連線。');
    }

    // 綁定其他按鈕事件
    setupEventListeners();
};

/**
 * 處理登入成功後的回呼
 */
async function handleAuthResponse(response) {
    if (response.error !== undefined) {
        showError('登入失敗或遭取消：' + response.error);
        return;
    }

    state.accessToken = response.access_token;

    try {
        setLoading(true);
        // 1. 取得使用者 Google 個人資料 (Email)
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${state.accessToken}` }
        });
        const userInfoInfo = await userInfoRes.json();
        const email = userInfoInfo.email;
        const name = userInfoInfo.name;

        // 2. 比對 Users 工作表檢查權限
        const usersData = await fetchSheetData('Users!A:C');
        // Users[0] 是標題 [姓名, Email, 權限]
        const userRow = usersData.slice(1).find(row => row[1] === email);

        if (!userRow) {
            setLoading(false);
            showError(`您的信箱 (${email}) 未獲得系統授權。`);
            DOM.loginSection.classList.remove('hidden');
            DOM.mainDashboard.classList.add('hidden');
            return;
        }

        // 登入成功，設定狀態
        state.user = {
            name: userRow[0] || name,
            email: email,
            role: userRow[2] || '一般成員'
        };

        // 準備進入主要畫面
        showDashboard();
        await loadInitialData();

    } catch (err) {
        console.error(err);
        showError('系統初始化發生錯誤：' + err.message);
    } finally {
        setLoading(false);
    }
}

function showDashboard() {
    DOM.loginSection.classList.add('hidden');
    DOM.mainDashboard.classList.remove('hidden');
    DOM.userInfo.classList.remove('hidden');
    DOM.userNameRole.textContent = `${state.user.name} (${state.user.role})`;
    DOM.logoutBtn.style.display = 'inline-block';

    // 如果是管理員，顯示管理專區
    if (state.user.role === '管理員') {
        DOM.adminSection.classList.remove('hidden');
    } else {
        DOM.adminSection.classList.add('hidden');
    }
}

// ==========================================
// 系統核心邏輯與資料載入
// ==========================================

async function loadInitialData() {
    try {
        setLoading(true);
        // 並行取得三大資料集
        const [todayConfigRes, menuRes, ordersRes] = await Promise.all([
            fetchSheetData('TodayConfig!A:A'),
            fetchSheetData('Menu!A:D'),
            fetchSheetData('Orders!A:F')
        ]);

        // 處理 TodayConfig (跳過標題列)
        state.todayRestaurants = todayConfigRes.length > 1 ? todayConfigRes.slice(1).map(row => row[0]) : [];
        DOM.openRestaurantsList.textContent = state.todayRestaurants.length > 0 ? state.todayRestaurants.join('、') : '今日尚未設定餐廳';

        // 處理 Menu (跳過標題列)
        // 欄位：餐廳名稱, 品名, 單價, 分類
        state.menuItems = menuRes.slice(1).map(row => ({
            restaurant: row[0],
            name: row[1],
            price: parseInt(row[2], 10) || 0,
            category: row[3] || '未分類'
        }));

        // 處理 Orders (跳過標題列)
        // 欄位：點餐時間, 訂購人 Email, 餐廳名稱, 餐點內容, 金額, 備註
        state.orders = ordersRes.length > 1 ? ordersRes.slice(1) : [];

        // 渲染畫面更新
        renderAdminCheckboxes();
        renderMenuCards();
        renderOrdersAndStats();

    } catch (error) {
        console.error("載入資料錯誤:", error);
        alert('載入資料失敗，可能是試算表尚未建立或權限不足。');
    } finally {
        setLoading(false);
    }
}

// ==========================================
// 畫面渲染函數
// ==========================================

function renderAdminCheckboxes() {
    if (state.user.role !== '管理員') return;

    // 從菜單中萃取不重複的餐廳清單
    const allRestaurants = [...new Set(state.menuItems.map(item => item.restaurant))];

    DOM.restaurantCheckboxes.innerHTML = '';
    allRestaurants.forEach(rest => {
        const isChecked = state.todayRestaurants.includes(rest);
        const label = document.createElement('label');
        label.className = 'checkbox-label';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = rest;
        input.checked = isChecked;

        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + rest));

        DOM.restaurantCheckboxes.appendChild(label);
    });
}

function renderMenuCards() {
    DOM.menuCardsContainer.innerHTML = '';

    // 防呆檢查：是否有已點過的訂單
    const hasOrdered = state.orders.some(order => order[1] === state.user.email);

    // 過濾出屬於今日餐廳的菜單
    const todayMenuItems = state.menuItems.filter(item => state.todayRestaurants.includes(item.restaurant));

    if (todayMenuItems.length === 0) {
        DOM.menuCardsContainer.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">今日目前沒有供應可以點的餐點。</p>';
        return;
    }

    todayMenuItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'menu-card';

        // 備註輸入框 ID
        const noteId = `note-${index}`;

        card.innerHTML = `
            <div class="menu-header">
                <div>
                    <span class="menu-restaurant">${item.restaurant}</span>
                    <h3 class="menu-title">${item.name}</h3>
                </div>
                <div class="menu-price">$${item.price}</div>
            </div>
            <div class="menu-category">分類：${item.category}</div>
            <div class="menu-input-group">
                <input type="text" id="${noteId}" placeholder="備註 (例: 不要蔥)" maxlength="50" ${hasOrdered ? 'disabled' : ''}>
            </div>
            <button class="btn btn-primary btn-order" data-index="${index}" ${hasOrdered ? 'disabled' : ''}>
                ${hasOrdered ? '今日已點餐' : '點餐'}
            </button>
        `;

        DOM.menuCardsContainer.appendChild(card);
    });

    // 綁定點餐按鈕事件
    document.querySelectorAll('.btn-order').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = e.target.getAttribute('data-index');
            const item = todayMenuItems[idx];
            const noteInput = document.getElementById(`note-${idx}`);
            await submitOrder(item, noteInput.value);
        });
    });
}

function renderOrdersAndStats() {
    DOM.ordersTableBody.innerHTML = '';

    let totalPeople = state.orders.length;
    let totalPrice = 0;

    if (totalPeople === 0) {
        DOM.ordersTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">目前尚無人點單</td></tr>';
    } else {
        // 反轉陣列，讓最新的在前面
        const reversedOrders = [...state.orders].reverse();
        reversedOrders.forEach(order => {
            const [time, email, rest, item, price, note] = order;
            // 尋找姓名
            let displayName = email.split('@')[0];
            // 若為目前登入者，顯示"你"
            if (email === state.user.email) {
                displayName = `${state.user.name} (你)`;
            }

            const parsedPrice = parseInt(price, 10) || 0;
            totalPrice += parsedPrice;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${displayName}</td>
                <td>${rest}</td>
                <td>${item}</td>
                <td style="color:var(--text-muted)">${note || '-'}</td>
                <td style="font-weight:bold; color:var(--primary-color);">$${parsedPrice}</td>
            `;
            DOM.ordersTableBody.appendChild(tr);
        });
    }

    DOM.statPeople.textContent = totalPeople;
    DOM.statTotal.textContent = `${totalPrice} 元`;
}


// ==========================================
// API 操作與寫入功能
// ==========================================

/**
 * [API] 通用取得資料函數
 */
async function fetchSheetData(range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?access_token=${state.accessToken}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.values || [];
}

/**
 * [API] 更新今日開放餐廳 (Admin)
 */
async function saveTodayRestaurants() {
    const checkboxes = DOM.restaurantCheckboxes.querySelectorAll('input:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);

    if (!confirm('確定要更新今日開放餐廳清單嗎？')) return;

    setLoading(true);
    try {
        // 第一步：清空現有設定 (保留標題)
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/TodayConfig!A2:A:clear`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.accessToken}` }
        });

        // 第二步：寫入新選取值
        if (selected.length > 0) {
            const body = {
                values: selected.map(rest => [rest])
            };
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/TodayConfig!A2:A?valueInputOption=USER_ENTERED&access_token=${state.accessToken}`;
            await fetch(updateUrl, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
        }

        alert('今日開放餐廳已更新成功！');
        // 重新載入資料
        await loadInitialData();

    } catch (e) {
        console.error(e);
        alert('儲存失敗：' + e.message);
        setLoading(false);
    }
}

/**
 * [API] 送出個人訂單
 */
async function submitOrder(menuItem, note) {
    if (!confirm(`確定要點【${menuItem.restaurant}】的 ${menuItem.name} 嗎？`)) return;

    setLoading(true);
    try {
        // 獲取當下時間字串 yyyy/mm/dd HH:mm
        const now = new Date();
        const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const newRow = [
            timeStr,
            state.user.email,
            menuItem.restaurant,
            menuItem.name,
            menuItem.price,
            note || ''
        ];

        const body = {
            values: [newRow]
        };

        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Orders!A:F:append?valueInputOption=USER_ENTERED&access_token=${state.accessToken}`;

        const res = await fetch(appendUrl, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);

        alert('點餐成功！');
        await loadInitialData(); // 重新載入，以更新列表和防呆

    } catch (e) {
        console.error(e);
        alert('點單失敗：' + e.message);
        setLoading(false);
    }
}

/**
 * [API] 清空所有訂單 (Admin)
 */
async function clearAllOrders() {
    if (!confirm('警告：這將會清除今日所有人的點單紀錄，確定要繼續嗎？')) return;

    setLoading(true);
    try {
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Orders!A2:F:clear`;
        await fetch(clearUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.accessToken}` }
        });

        alert('今日訂單已清除！');
        await loadInitialData();

    } catch (e) {
        console.error(e);
        alert('清除失敗：' + e.message);
        setLoading(false);
    }
}

// ==========================================
// 輔助函式與事件綁定
// ==========================================

function setupEventListeners() {
    DOM.logoutBtn.addEventListener('click', () => {
        state.accessToken = null;
        state.user = null;
        DOM.mainDashboard.classList.add('hidden');
        DOM.loginSection.classList.remove('hidden');
        DOM.userInfo.classList.add('hidden');
    });

    DOM.saveRestaurantsBtn.addEventListener('click', saveTodayRestaurants);
    DOM.clearOrdersBtn.addEventListener('click', clearAllOrders);

    DOM.copyOrdersBtn.addEventListener('click', () => {
        if (state.orders.length === 0) {
            alert('目前沒有訂單可複製');
            return;
        }

        let text = '🍽️ 今日點餐統計\n\n';
        state.orders.forEach(order => {
            const [time, email, rest, item, price, note] = order;
            let displayName = email.split('@')[0];
            const noteStr = note ? ` (${note})` : '';
            text += `- ${displayName}：${item}${noteStr} [$${price}]\n`;
        });

        text += `\n總計：${state.orders.length} 人，共 ${DOM.statTotal.textContent}`;

        navigator.clipboard.writeText(text).then(() => {
            alert('訂單內容已複製到剪貼簿！');
        }).catch(err => {
            alert('複製失敗，請手動圈選文字複製。');
        });
    });
}

function setLoading(isLoading) {
    if (isLoading) {
        DOM.loadingOverlay.classList.remove('hidden');
    } else {
        DOM.loadingOverlay.classList.add('hidden');
    }
}

function showError(msg) {
    DOM.loginErrorMsg.textContent = msg;
    DOM.loginErrorMsg.classList.remove('hidden');
}
