// =========================
// 設定
// =========================
const GAS_URL = "https://script.google.com/macros/s/AKfycbzzTjNi_UB_rUj6h-zOuXXa1NAhvII-6ZYudyRLWzC15TxI-h24EH1h0rIWqJSplYAB/exec";
let customers = JSON.parse(localStorage.getItem("customers")) || [];

// =========================
// 保存
// =========================
function saveCustomers() {
  localStorage.setItem("customers", JSON.stringify(customers));
}

// データ初期化 (デバッグ用 - 無効化)
function resetData() {
  // if (confirm("本当にデータを初期化しますか？\n（スプレッドシートのデータは消えませんが、未同期の変更は失われます）")) {
  //   localStorage.removeItem("customers");
  //   location.reload();
  // }
}

// =========================
// 顧客ID生成（CUS-XXXXXX）
// =========================
function generateCustomerId() {
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CUS-${randomPart}`;
}

// =========================
// 起動（スプレッドシート→ローカル読み込み）
// =========================
window.addEventListener("load", () => {
  loadFromSheet();
});

// =========================
// タブ切り替え
// =========================
function openTab(evt, tabName) {
  document.querySelectorAll(".tabcontent").forEach(el => el.style.display = "none");
  document.querySelectorAll(".tablink").forEach(b => b.classList.remove("active"));
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.classList.add("active");

  if (tabName === "customerList") renderCustomerList();
}

// =========================
// フィルター変更 → 自動更新
// =========================
document.getElementById("filterStatus").addEventListener("change", () => {
  renderCustomerList();
});
document.getElementById("filterInput").addEventListener("input", () => {
  renderCustomerList();
});

// =========================
// 登録フォーム：施工日切替
// =========================
document.getElementById("coating").addEventListener("change", () => {
  document.getElementById("coatDate").disabled = (document.getElementById("coating").value === "無し");
});

// =========================
// 顧客登録
// =========================
document.getElementById("registerBtn").addEventListener("click", async () => {

  const newCustomer = {
    id: generateCustomerId(),   // ⭐ 顧客IDを付与
    status: document.getElementById("status").value,
    delivery: document.getElementById("delivery").value,
    name: document.getElementById("name").value,
    address: document.getElementById("address").value,
    phone: document.getElementById("phone").value,
    car: document.getElementById("car").value,
    body: document.getElementById("body").value,
    color: document.getElementById("color").value,
    inspection: document.getElementById("inspection").value,
    coating: document.getElementById("coating").value,
    coatDate: document.getElementById("coatDate").value,
    notes: [],
    checks: {},
    reviews: { google: false, carsensor: false }
  };

  if (!newCustomer.name || !newCustomer.phone) return alert("お客様名と連絡先は必須です。");

  customers.push(newCustomer);
  saveCustomers();
  renderCustomerTableRegister();
  alert("登録しました！");

  await syncWithSheet("saveCustomer", { customer: newCustomer });
});

// =========================
// fetch共通処理（no-cors）
// =========================
async function syncWithSheet(action, data) {
  try {
    await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...data })
    });
  } catch (err) {
    console.error("送信エラー:", err);
  }
}

// =========================
// スプレッドシートから取得
// =========================
// =========================
// スプレッドシートから取得 (顧客 + 履歴)
// =========================
async function loadFromSheet() {
  try {
    // 顧客データと履歴データを並列取得 (キャッシュ対策で timestamp 付与)
    const ts = Date.now();
    const [resCust, resHist] = await Promise.all([
      fetch(`${GAS_URL}?action=getAllCustomers&t=${ts}`),
      fetch(`${GAS_URL}?action=getAllHistories&t=${ts}`)
    ]);

    // HTMLエラーなどが返ってきていないかチェック
    if (!resCust.ok || !resHist.ok) throw new Error("Network response was not ok");

    const textCust = await resCust.text();
    const textHist = await resHist.text();

    let customersData, historiesData;
    try {
      customersData = JSON.parse(textCust);
      historiesData = JSON.parse(textHist);
    } catch (e) {
      throw new Error("GASからの応答がJSONではありません。GASコードが古い可能性があります。(" + textCust.substring(0, 50) + "...)");
    }

    // 顧客データの展開
    customers = customersData.map(c => ({
      id: c["顧客ID"] || generateCustomerId(),
      status: c["ステータス"] || "",
      name: c["氏名"] || "",
      address: c["住所"] || "",
      phone: c["電話"] || "",
      car: c["車名"] || "",
      body: c["車体番号"] || "",
      color: c["色"] || "",
      inspection: c["車検日"] || "",
      coating: c["コーティング"] || "",
      coatDate: c["施工日"] || "",
      delivery: c["納車日"] || "",
      notes: [], // 一旦空にする
      checks: {},
      reviews: { google: false, carsensor: false }
    }));

    // 履歴データのマージ (氏名と電話番号で紐付け)
    // ヘッダー: 日付, 顧客名, 電話番号, 車名, アプローチ内容, 登録日時
    historiesData.forEach(h => {
      const match = customers.find(c => c.name === h["顧客名"] && String(c.phone) === String(h["電話番号"]));
      if (match) {
        match.notes.push({
          date: h["日付"],
          text: h["アプローチ内容"],
          timestamp: h["登録日時"]
        });
      }
    });

    saveCustomers();
    renderCustomerTableRegister();
    renderCustomerList();
    console.log("✅ スプレッドシートから全データ同期完了");
  } catch (err) {
    console.error("❌ シート読み込みエラー:", err);
    // 詳細なエラーをユーザーに通知（デバッグ用 - UI非表示要望のため削除）
  }
}

// =========================
// 登録タブの一覧
// =========================
function renderCustomerTableRegister() {
  const tbody = document.querySelector("#customerTableRegister tbody");
  tbody.innerHTML = "";

  customers.forEach((c, i) => {
    const row = tbody.insertRow();
    row.insertCell().textContent = c.status;
    row.insertCell().textContent = c.name;
    row.insertCell().textContent = c.car;
    row.insertCell().textContent = c.phone;
    row.insertCell().textContent = c.inspection;

    const checkCell = row.insertCell();
    checkCell.appendChild(generateCheckElements(c.status, c.coating, c.status, i));

    const editBtn = row.insertCell();
    const eBtn = document.createElement("button");
    eBtn.textContent = "編集";
    eBtn.className = "btn-secondary";
    eBtn.onclick = () => openEditModal(i);
    editBtn.appendChild(eBtn);

    const histBtn = row.insertCell();
    const hBtn = document.createElement("button");
    hBtn.textContent = "履歴";
    hBtn.className = "btn-secondary";
    hBtn.onclick = () => openHistoryModal(i);
    histBtn.appendChild(hBtn);
  });
}

// =========================
// 顧客一覧（フィルター付き）
// =========================
function renderCustomerList() {
  const status = document.getElementById("filterStatus").value;
  const keyword = document.getElementById("filterInput").value.toLowerCase();
  const tbody = document.querySelector("#customerTable tbody");
  tbody.innerHTML = "";

  customers.forEach((c, i) => {
    if (status && c.status !== status && !(status === "コーティング" && c.coating === "有り")) return;
    if (keyword && !(`${c.name}${c.car}${c.phone}`.toLowerCase().includes(keyword))) return;

    const row = tbody.insertRow();
    row.insertCell().textContent = c.status;
    row.insertCell().textContent = c.name;
    row.insertCell().textContent = c.car;
    row.insertCell().textContent = c.phone;
    row.insertCell().textContent = c.inspection;

    const checkCell = row.insertCell();
    const displayStatus = status || c.status;
    checkCell.appendChild(
      generateCheckElements(c.status, c.coating, displayStatus, i)
    );

    const eBtn = document.createElement("button");
    eBtn.textContent = "編集";
    eBtn.className = "btn-secondary";
    eBtn.onclick = () => openEditModal(i);
    row.insertCell().appendChild(eBtn);

    const hBtn = document.createElement("button");
    hBtn.textContent = "履歴";
    hBtn.className = "btn-secondary";
    hBtn.onclick = () => openHistoryModal(i);
    row.insertCell().appendChild(hBtn);
  });
}

// =========================
// 点検項目生成（仕様完全対応）
// =========================
function generateCheckElements(baseStatus, coating, displayStatus, i) {
  const container = document.createElement("div");
  container.className = "checks-inline";

  const status = displayStatus || baseStatus;
  let items = [];

  if (status === "販売" || status === "車検") {
    items = ["1ヶ月", "3ヶ月", "6ヶ月", "12ヶ月"];
  } else if (status === "コーティング") {
    if (coating === "有り") {
      items = ["1年", "2年", "3年"];
    } else {
      container.textContent = "-";
      return container;
    }
  } else {
    container.textContent = "-";
    return container;
  }

  items.forEach(label => {
    const wrap = document.createElement("label");
    wrap.innerHTML = `<input type="checkbox"> ${label}`;
    const input = wrap.querySelector("input");

    if (customers[i].checks?.[label]) input.checked = true;

    input.addEventListener("change", () => {
      if (!customers[i].checks) customers[i].checks = {};
      customers[i].checks[label] = input.checked;
      saveCustomers();
    });

    container.appendChild(wrap);
  });

  return container;
}

// =========================
// 編集モーダル
// =========================
// =========================
// 編集モーダル
// =========================
function openEditModal(i) {
  const c = customers[i];
  document.getElementById("editIndex").value = i;

  const fields = ["status", "name", "address", "phone", "car", "body", "color", "inspection", "coating", "coatDate", "delivery"];

  fields.forEach(key => {
    // IDは "edit" + 先頭大文字 (例: editName, editCoatDate)
    const elId = "edit" + key.charAt(0).toUpperCase() + key.slice(1);
    const el = document.getElementById(elId);
    if (el) {
      let val = c[key] || "";
      // 日付フィールド(input[type=date])の場合、ISO文字列だと表示されないため YYYY-MM-DD に切る
      if ((key === "inspection" || key === "coatDate" || key === "delivery") && val.includes("T")) {
        val = val.substring(0, 10);
      }
      el.value = val;
    }
  });

  document.getElementById("editModal").style.display = "block";
}

async function saveEdit() {
  const i = document.getElementById("editIndex").value;
  const fields = ["status", "name", "address", "phone", "car", "body", "color", "inspection", "coating", "coatDate", "delivery"];

  fields.forEach(key => {
    const elId = "edit" + key.charAt(0).toUpperCase() + key.slice(1);
    const el = document.getElementById(elId);
    if (el) {
      customers[i][key] = el.value;
    }
  });

  saveCustomers();
  renderCustomerList();
  renderCustomerTableRegister();
  closeModal("editModal");
  alert("更新しました！");

  await syncWithSheet("updateCustomer", { customer: customers[i] });
}

// =========================
// 履歴モーダル
// =========================
function openHistoryModal(i) {
  const c = customers[i];

  document.getElementById("historyIndex").value = i;
  document.getElementById("historyTitle").textContent = `${c.name}さんの履歴`;
  document.getElementById("historyCar").textContent = c.car || "-";
  document.getElementById("historyInspection").textContent = c.inspection || "-";
  document.getElementById("historyPhone").textContent = c.phone || "-";

  document.getElementById("historyGoogle").checked = c.reviews?.google || false;
  document.getElementById("historyGoogle").checked = c.reviews?.google || false;
  document.getElementById("historyCarsensor").checked = c.reviews?.carsensor || false;

  // 現在時刻をデフォルトセット (JST -> ISO string slicing for datetime-local)
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("historyDate").value = now.toISOString().slice(0, 16);

  document.getElementById("historyGoogle").onchange = e => {
    customers[i].reviews.google = e.target.checked;
    saveCustomers();
    syncWithSheet("updateCustomer", { customer: customers[i] });
  };

  document.getElementById("historyCarsensor").onchange = e => {
    customers[i].reviews.carsensor = e.target.checked;
    saveCustomers();
    syncWithSheet("updateCustomer", { customer: customers[i] });
  };

  renderHistoryList(i);
  document.getElementById("historyModal").style.display = "block";
}

// =========================
// 履歴リスト
// =========================
function renderHistoryList(i) {
  const area = document.getElementById("historyList");
  area.innerHTML = "";
  const notes = customers[i].notes || [];

  notes.slice().reverse().forEach((n, idx) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <span class="ts">${n.date || formatDateTimeJP(n.timestamp)}</span>
      <div class="history-btns">
        <button onclick="editHistory(${i}, ${notes.length - 1 - idx})">✎</button>
        <button onclick="deleteHistory(${i}, ${notes.length - 1 - idx})">🗑</button>
      </div>
      <div>${n.text}</div>
    `;
    area.appendChild(item);
  });
}

// =========================
// 履歴追加・編集・削除
// =========================
async function addNote() {
  const i = +document.getElementById("historyIndex").value;
  const note = document.getElementById("newNote").value.trim();
  if (!note) return alert("内容を入力してください");

  const dateVal = document.getElementById("historyDate").value; // YYYY-MM-DDTHH:mm
  // 表示用にフォーマット (Tをスペースに置換)
  const formattedDate = dateVal.replace("T", " ");

  const entry = { text: note, timestamp: new Date().toISOString(), date: formattedDate };
  customers[i].notes.push(entry);

  saveCustomers();
  document.getElementById("newNote").value = "";
  renderHistoryList(i);

  await syncWithSheet("saveHistory", {
    log: {
      name: customers[i].name,
      phone: customers[i].phone,
      car: customers[i].car,
      note,
      timestamp: entry.timestamp,
      date: formattedDate // 新しい日付フィールド
    }
  });
}

async function editHistory(i, n) {
  const text = prompt("内容を編集してください", customers[i].notes[n].text);
  if (text === null) return;

  customers[i].notes[n].text = text;
  saveCustomers();
  renderHistoryList(i);

  await syncWithSheet("saveHistory", {
    log: { name: customers[i].name, phone: customers[i].phone, car: customers[i].car, note: text, timestamp: customers[i].notes[n].timestamp }
  });
}

async function deleteHistory(i, n) {
  if (!confirm("この履歴を削除しますか？")) return;

  const del = customers[i].notes.splice(n, 1)[0];
  saveCustomers();
  renderHistoryList(i);

  await syncWithSheet("deleteHistory", { log: del });
}

// =========================
// 共通
// =========================
function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

function formatDateTimeJP(t) {
  const d = new Date(t);
  if (isNaN(d)) return t;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
}

// =========================
// 自動同期 (30秒間隔)
// =========================
let lastHash = "";
setInterval(checkSheetUpdates, 30000);

async function checkSheetUpdates() {
  try {
    // const btn = document.querySelector(".btn-secondary"); // 更新ボタン (非表示化に伴い削除)
    // if(btn) btn.textContent = "🔄 同期中...";

    const ts = Date.now();
    const headers = { "Content-Type": "text/plain" }; // no-corsでもリクエストは飛ぶ

    // データ取得
    const [resCust, resHist] = await Promise.all([
      fetch(`${GAS_URL}?action=getAllCustomers&t=${ts}`),
      fetch(`${GAS_URL}?action=getAllHistories&t=${ts}`)
    ]);

    const cData = await resCust.json();
    const hData = await resHist.json();

    const newHash = JSON.stringify(cData) + JSON.stringify(hData);
    if (newHash !== lastHash) {
      console.log("🔁 シート更新検知 → 再描画");
      lastHash = newHash;

      // 再構築ロジック (loadFromSheetと共通化が理想だが、ここでは簡易実装)
      customers = cData.map(c => ({
        id: c["顧客ID"] || generateCustomerId(),
        status: c["ステータス"] || "",
        name: c["氏名"] || "",
        address: c["住所"] || "",
        phone: c["電話"] || "",
        car: c["車名"] || "",
        body: c["車体番号"] || "",
        color: c["色"] || "",
        inspection: c["車検日"] || "",
        coating: c["コーティング"] || "",
        coatDate: c["施工日"] || "",
        delivery: c["納車日"] || "",
        notes: [],
        checks: {},
        reviews: { google: false, carsensor: false }
      }));

      hData.forEach(h => {
        const match = customers.find(c => c.name === h["顧客名"] && String(c.phone) === String(h["電話番号"]));
        if (match) {
          match.notes.push({
            date: h["日付"],
            text: h["アプローチ内容"],
            timestamp: h["登録日時"]
          });
        }
      });

      saveCustomers();
      renderCustomerTableRegister();
      renderCustomerList();
    }



  } catch (err) {
    console.warn("⏳ 同期チェック失敗:", err);
  }
}
