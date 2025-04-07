// アプリケーションのメインロジックをここに記述します。
// 初期状態では空です。 

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBLP1YSrdUd_LGu4xZ-jKf-_FPYljq226w",
  authDomain: "project-4814457387099311122.firebaseapp.com",
  projectId: "project-4814457387099311122",
  storageBucket: "project-4814457387099311122.firebasestorage.app",
  messagingSenderId: "1065188683035",
  appId: "1:1065188683035:web:0a2dce8ad18521bfba77be",
  measurementId: "G-S3H1YJQEPR"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// DOM Elements
const infoTabBtn = document.getElementById('infoTabBtn');
const detailTabBtn = document.getElementById('detailTabBtn');
const infoTab = document.getElementById('infoTab');
const detailTab = document.getElementById('detailTab');
const currentYearSpan = document.getElementById('currentYear');

// -- Input Fields --
const locationInput = document.getElementById('locationInput');
const deteriorationNameInput = document.getElementById('deteriorationNameInput');
const photoNumberInput = document.getElementById('photoNumberInput');
const nextIdDisplay = document.getElementById('nextIdDisplay');

// -- Prediction Lists --
const locationPredictionsList = document.getElementById('locationPredictions');
const deteriorationPredictionsList = document.getElementById('deteriorationPredictions');

// -- Edit Modal Elements --
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editIdDisplay = document.getElementById('editIdDisplay');
const editLocationInput = document.getElementById('editLocationInput');
const editLocationPredictionsList = document.getElementById('editLocationPredictions');
const editDeteriorationNameInput = document.getElementById('editDeteriorationNameInput');
const editDeteriorationPredictionsList = document.getElementById('editDeteriorationPredictions');
const editPhotoNumberInput = document.getElementById('editPhotoNumberInput');
const cancelEditBtn = document.getElementById('cancelEditBtn');

// Prediction Data Storage
let locationPredictions = []; // 部屋名
let partPredictions = [];     // 部位
let deteriorationPredictions = []; // 劣化名

// --- Global State ---
let currentProjectId = null; // 例: "現場A_2024-04-08"
let currentBuildingId = null; // 例: "A棟"
let buildings = {}; // { "A棟": true, "B棟": true }
let lastUsedBuilding = null; // 前回選択した建物を記憶

// --- Firebase Refs ---
function getProjectBaseRef(projectId) {
  return database.ref(`projects/${projectId}`);
}
function getProjectInfoRef(projectId) {
  return database.ref(`projects/${projectId}/info`);
}
function getBuildingsRef(projectId) {
  return database.ref(`projects/${projectId}/buildings`);
}
// 劣化情報Refは後ほど

// --- Utility Functions ---

// プロジェクトIDを生成 (現場名と調査日から)
function generateProjectId(siteName, surveyDate) {
    if (!siteName || !surveyDate) return null;
    // ファイルパスとして安全な形式に変換 (スペースや特殊文字をアンダースコアに)
    const safeSiteName = siteName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return `${safeSiteName}_${surveyDate}`;
}

// --- CSV Parsing and Loading --- 

// CSVテキストを解析して { value, reading } の配列を返す関数
function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/); // CR LF と LF 両方に対応
  if (lines.length <= 1) {
    console.warn("CSV file has no data or only a header.");
    return []; // ヘッダーのみ、または空の場合は空配列
  }
  const header = lines.shift(); // ヘッダー行を削除 (内容は使用しない)
  // console.log('CSV Header:', header); // デバッグ用

  return lines.map((line, index) => {
    const values = line.split(',');
    // 1列目を value, 2列目を reading とする
    const value = values[0]?.trim();
    const reading = values[1]?.trim();
    // value が存在する場合のみ有効なデータとする
    if (value) {
      return { value: value, reading: reading || '' }; // reading がなくても空文字で返す
    } else {
      // console.warn(`Skipping empty or invalid line ${index + 2} in CSV: ${line}`);
      return null; // 不正な行は null
    }
  }).filter(item => item !== null); // null を除去
}

// CSVファイルを指定されたエンコーディングで読み込み解析するヘルパー関数
async function fetchAndParseCsv(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for ${filePath}`);
    }
    const buffer = await response.arrayBuffer();
    
    // まず Shift_JIS で試す
    let decoder = new TextDecoder('shift_jis', { fatal: true }); // エラーがあれば例外をスロー
    let text = '';
    try {
      text = decoder.decode(buffer);
      console.log(`Successfully decoded ${filePath} with shift_jis.`);
    } catch (e) {
      console.warn(`Failed to decode ${filePath} with shift_jis, trying cp932... Error: ${e.message}`);
      // Shift_JIS で失敗した場合、CP932 (Windows-31J) を試す
      try {
          decoder = new TextDecoder('cp932', { fatal: true });
          text = decoder.decode(buffer);
          console.log(`Successfully decoded ${filePath} with cp932.`);
      } catch (e2) {
           console.error(`Failed to decode ${filePath} with both shift_jis and cp932. Error: ${e2.message}`);
           // デコード失敗。空のテキストを返すか、例外を再スローするか選択。
           throw new Error(`Failed to decode ${filePath}. Check file encoding.`); 
      }
    }

    // BOM (Byte Order Mark) が含まれている場合の除去 (念のため)
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    return parseCsv(text);

  } catch (error) {
    console.error(`Error fetching or parsing CSV ${filePath}:`, error);
    return []; // エラー時は空配列を返す
  }
}

// 3つの予測データCSVを読み込むメイン関数
async function loadPredictionData() {
  console.log("Loading prediction data...");
  try {
    // 並列でCSVファイルを読み込む
    [locationPredictions, partPredictions, deteriorationPredictions] = await Promise.all([
      fetchAndParseCsv('./部屋名_読み付き.csv'),            // 場所（部屋名）
      fetchAndParseCsv('./劣化項目_【部位】_読み付き.csv'),    // 劣化名（部位）
      fetchAndParseCsv('./劣化項目_【劣化名】_読み付き.csv') // 劣化名（劣化）
    ]);

    // デバッグ用に読み込んだ件数を表示
    console.log(`Loaded ${locationPredictions.length} location predictions (Rooms).`);
    console.log(`Loaded ${partPredictions.length} part predictions (Building Parts).`);
    console.log(`Loaded ${deteriorationPredictions.length} deterioration predictions (Defects).`);

    // TODO: Initialize prediction UI elements if needed

  } catch (error) {
    console.error("Critical error loading prediction data:", error);
    // エラーメッセージを表示するなど、ユーザーへの通知
    alert("予測変換データの読み込みに失敗しました。アプリケーションが正しく動作しない可能性があります。");
  }
}

// --- Prediction Logic ---

// 場所の予測候補を生成 (前方一致: 読み)
function generateLocationPredictions(inputText) {
  const searchTerm = inputText.trim().toLowerCase();
  if (!searchTerm) return [];

  // 読みで前方一致検索
  return locationPredictions
    .filter(item => item.reading && item.reading.toLowerCase().startsWith(searchTerm))
    .map(item => item.value) // 値 (部屋名) の配列を返す
    .slice(0, 10); // 最大10件表示
}

// 劣化名の予測候補を生成 (部位読み2文字 + 劣化名読み2文字 で前方一致)
function generateDeteriorationPredictions(inputText) {
  const searchTerm = inputText.trim().toLowerCase();
  if (!searchTerm) return [];

  let results = [];

  // 検索ロジック:
  // 1. 部位(2文字) + 劣化(2文字) の組み合わせで検索 (例: 「がひひび」)
  if (searchTerm.length >= 4) {
      const partPrefix = searchTerm.substring(0, 2);
      const deteriorationPrefix = searchTerm.substring(2, 4);
      const matchingParts = partPredictions.filter(p => p.reading && p.reading.toLowerCase().startsWith(partPrefix));
      const matchingDeteriorations = deteriorationPredictions.filter(d => d.reading && d.reading.toLowerCase().startsWith(deteriorationPrefix));

      matchingParts.forEach(part => {
          matchingDeteriorations.forEach(det => {
              results.push(`${part.value} ${det.value}`);
          });
      });
  }

  // 2. 部位のみで検索 (入力が2文字以上の場合)
  if (searchTerm.length >= 2) {
    const matchingPartsOnly = partPredictions
        .filter(p => p.reading && p.reading.toLowerCase().startsWith(searchTerm))
        .map(p => p.value); // 部位名のみも候補に含める
    results = results.concat(matchingPartsOnly);
  }

  // 3. 劣化名のみで検索 (入力が2文字以上の場合)
  if (searchTerm.length >= 2) {
    const matchingDeteriorationsOnly = deteriorationPredictions
      .filter(d => d.reading && d.reading.toLowerCase().startsWith(searchTerm))
      .map(d => d.value); // 劣化名のみも候補に含める
    results = results.concat(matchingDeteriorationsOnly);
  }

  // 重複を除去して最大10件返す
  return [...new Set(results)].slice(0, 10); 
}

// 予測リストを表示/更新する関数
function showPredictions(inputElement, predictionListElement, predictions) {
  // リストをクリア
  predictionListElement.innerHTML = '';

  if (predictions.length > 0) {
    predictions.forEach(prediction => {
      const li = document.createElement('li');
      li.textContent = prediction;
      li.classList.add('prediction-item');
      // mousedown を使うことで、blur イベントより先に実行され選択が可能になる
      li.addEventListener('mousedown', () => {
        inputElement.value = prediction;
        predictionListElement.classList.add('hidden');
        predictionListElement.innerHTML = ''; // 選択後にリストをクリア
      });
      predictionListElement.appendChild(li);
    });
    predictionListElement.classList.remove('hidden');
  } else {
    predictionListElement.classList.add('hidden');
  }
}

// 予測リストを隠す関数 (setTimeout用)
function hidePredictions(predictionListElement) {
    predictionListElement.classList.add('hidden');
}

// --- Event Listeners for Predictions ---

function setupPredictionListeners(inputElement, predictionListElement, generatorFn) {
    inputElement.addEventListener('input', () => {
        const inputText = inputElement.value;
        const predictions = generatorFn(inputText);
        showPredictions(inputElement, predictionListElement, predictions);
    });

    // フォーカスが外れたら少し遅れてリストを隠す
    inputElement.addEventListener('blur', () => {
        setTimeout(() => hidePredictions(predictionListElement), 150); // 150ms 待つ
    });

    // フォーカス時に再表示 (入力があれば)
    inputElement.addEventListener('focus', () => {
        const inputText = inputElement.value;
        if(inputText.trim()) { // 何か入力があれば予測を再試行
          const predictions = generatorFn(inputText);
          showPredictions(inputElement, predictionListElement, predictions);
        }
    });
}

// --- Tab Switching Logic ---
function switchTab(activeTabId) {
  if (activeTabId === 'info') {
    infoTab.classList.remove('hidden');
    detailTab.classList.add('hidden');
    infoTabBtn.classList.add('bg-blue-600', 'text-white');
    infoTabBtn.classList.remove('bg-gray-200', 'text-gray-700');
    detailTabBtn.classList.add('bg-gray-200', 'text-gray-700');
    detailTabBtn.classList.remove('bg-blue-600', 'text-white');
  } else if (activeTabId === 'detail') {
    detailTab.classList.remove('hidden');
    infoTab.classList.add('hidden');
    detailTabBtn.classList.add('bg-blue-600', 'text-white');
    detailTabBtn.classList.remove('bg-gray-200', 'text-gray-700');
    infoTabBtn.classList.add('bg-gray-200', 'text-gray-700');
    infoTabBtn.classList.remove('bg-blue-600', 'text-white');
  }
}

// Event Listeners for Tabs
infoTabBtn.addEventListener('click', () => switchTab('info'));
detailTabBtn.addEventListener('click', () => switchTab('detail'));

// --- Basic Info Management ---
const surveyDateInput = document.getElementById('surveyDate');
const siteNameInput = document.getElementById('siteName');
const initialBuildingNameInput = document.getElementById('buildingName'); // 初期建物名

// 基本情報をFirebaseに保存
async function saveBasicInfo() {
    const siteName = siteNameInput.value.trim();
    const surveyDate = surveyDateInput.value;
    const initialBuildingName = initialBuildingNameInput.value.trim();

    if (!siteName || !surveyDate) {
        // console.log("Site name or survey date is missing. Cannot save basic info or determine Project ID.");
        return; // 現場名か日付がないとプロジェクトIDが決まらない
    }

    const newProjectId = generateProjectId(siteName, surveyDate);
    if (!newProjectId) return;

    currentProjectId = newProjectId;
    console.log("Current Project ID set to:", currentProjectId);

    const infoData = {
        surveyDate: surveyDate,
        siteName: siteName,
        initialBuildingName: initialBuildingName // 初期建物名も保存
    };

    try {
        await getProjectInfoRef(currentProjectId).set(infoData);
        console.log("Basic info saved for project:", currentProjectId);
        // プロジェクトIDが変わった可能性があるので、建物のリスナー等を再設定
        setupBuildingManagementListeners();
    } catch (error) {
        console.error("Error saving basic info:", error);
        alert("基本情報の保存に失敗しました。");
    }
}

// アプリ起動時やプロジェクトID変更時に基本情報を読み込む
async function loadBasicInfo(projectId) {
    if (!projectId) return;
    try {
        const snapshot = await getProjectInfoRef(projectId).once('value');
        const info = snapshot.val();
        if (info) {
            surveyDateInput.value = info.surveyDate || '';
            siteNameInput.value = info.siteName || '';
            initialBuildingNameInput.value = info.initialBuildingName || '';
            console.log("Basic info loaded for project:", projectId);
        } else {
            console.log("No basic info found for project:", projectId);
            // 必要ならフィールドをクリア
            // surveyDateInput.value = '';
            // siteNameInput.value = '';
            // initialBuildingNameInput.value = '';
        }
    } catch (error) {
        console.error("Error loading basic info:", error);
    }
}

// 基本情報フィールドの変更を監視して保存
function setupBasicInfoListeners() {
    surveyDateInput.addEventListener('change', saveBasicInfo);
    siteNameInput.addEventListener('change', saveBasicInfo); 
    initialBuildingNameInput.addEventListener('change', saveBasicInfo);
}

// --- Building Management ---
const newBuildingNameInput = document.getElementById('newBuildingName');
const addBuildingBtn = document.getElementById('addBuildingBtn');
const buildingSelect = document.getElementById('buildingSelect');
const activeBuildingNameSpan = document.getElementById('activeBuildingName');

// 建物選択プルダウンを更新
function updateBuildingSelector(newBuildings) {
    buildings = newBuildings || {}; // グローバルステート更新
    const buildingNames = Object.keys(buildings);
    
    buildingSelect.innerHTML = ''; // 一旦クリア

    if (buildingNames.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "建物がありません";
        buildingSelect.appendChild(option);
        activeBuildingNameSpan.textContent = "(未選択)";
        currentBuildingId = null;
    } else {
        buildingNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            buildingSelect.appendChild(option);
        });

        // 前回選択した建物があればそれを選択、なければ最初の建物を選択
        const buildingToSelect = lastUsedBuilding && buildings[lastUsedBuilding] ? lastUsedBuilding : buildingNames[0];
        buildingSelect.value = buildingToSelect;
        currentBuildingId = buildingToSelect;
        activeBuildingNameSpan.textContent = currentBuildingId;
        console.log("Building selector updated. Selected:", currentBuildingId);
    }
    // TODO: 選択された建物に応じて劣化情報表示を更新する処理呼び出し
}

// 建物追加処理
async function addBuilding() {
    if (!currentProjectId) {
        alert("先に現場名と調査日を入力してプロジェクトを確定してください。");
        return;
    }
    const newName = newBuildingNameInput.value.trim();
    if (!newName) {
        alert("建物名を入力してください。");
        return;
    }
    if (buildings[newName]) {
        alert(`建物「${newName}」は既に追加されています。`);
        return;
    }

    try {
        // Firebaseに新しい建物を追加 (キーを建物名、値をtrue)
        await getBuildingsRef(currentProjectId).child(newName).set(true);
        console.log(`Building "${newName}" added to project ${currentProjectId}`);
        newBuildingNameInput.value = ''; // 入力フィールドクリア
        // リスナーが変更を検知して updateBuildingSelector が呼ばれるはず
    } catch (error) {
        console.error("Error adding building:", error);
        alert("建物の追加に失敗しました。");
    }
}

// Firebaseの建物リストの変更を監視
let buildingsListener = null;
function setupBuildingManagementListeners() {
    if (!currentProjectId) {
        console.log("Project ID not set, cannot setup building listeners.");
        updateBuildingSelector(null); // プルダウンをリセット
        return;
    }

    // 既存のリスナーがあればデタッチ
    if (buildingsListener) {
        getBuildingsRef(currentProjectId).off('value', buildingsListener);
        console.log("Detached existing buildings listener for old project ID.");
    }

    console.log("Setting up buildings listener for project:", currentProjectId);
    const buildingsRef = getBuildingsRef(currentProjectId);
    buildingsListener = buildingsRef.on('value', (snapshot) => {
        const newBuildingsData = snapshot.val();
        console.log("Buildings data received from Firebase:", newBuildingsData);
        updateBuildingSelector(newBuildingsData); 
    }, (error) => {
        console.error("Error listening for building changes:", error);
        alert("建物リストの取得中にエラーが発生しました。");
    });

    // プルダウン変更時の処理
    buildingSelect.addEventListener('change', () => {
        currentBuildingId = buildingSelect.value;
        lastUsedBuilding = currentBuildingId; // 最後に選択した建物を記憶
        activeBuildingNameSpan.textContent = currentBuildingId || "(未選択)";
        console.log("Building selected:", currentBuildingId);
        // TODO: 選択された建物に応じて劣化情報表示を更新する処理呼び出し
    });

    // 建物追加ボタンのリスナー（一度だけ設定）
    // addBuildingBtn のリスナーは DOMContentLoaded で一度だけ設定する方が良いかもしれない
    // ここで毎回設定すると重複する可能性があるため注意
}

// --- Deterioration Data Management ---
const deteriorationForm = document.getElementById('deteriorationForm');
const deteriorationTableBody = document.getElementById('deteriorationTableBody');

let deteriorationData = {}; // { buildingId: { recordId: data, ... }, ... }
let deteriorationListeners = {}; // { buildingId: listenerRef, ... }

// Firebase Refs for Deterioration
function getDeteriorationsRef(projectId, buildingId) {
  return database.ref(`projects/${projectId}/deteriorations/${buildingId}`);
}
function getDeteriorationCounterRef(projectId, buildingId) {
  return database.ref(`projects/${projectId}/counters/${buildingId}`);
}

// 次の劣化番号を取得 (Transaction使用)
async function getNextDeteriorationNumber(projectId, buildingId) {
    if (!projectId || !buildingId) return null;
    const counterRef = getDeteriorationCounterRef(projectId, buildingId);
    try {
        const result = await counterRef.transaction(currentValue => {
            return (currentValue || 0) + 1;
        });
        if (result.committed) {
            console.log(`Next number for ${buildingId}:`, result.snapshot.val());
            return result.snapshot.val();
        } else {
            console.error('Transaction aborted for counter');
            return null;
        }
    } catch (error) {
        console.error("Error getting next deterioration number:", error);
        return null;
    }
}

// 劣化情報入力フォームの送信処理
async function handleDeteriorationSubmit(event) {
    event.preventDefault(); // デフォルトのフォーム送信を防止

    if (!currentProjectId || !currentBuildingId) {
        alert("プロジェクトまたは建物が選択されていません。");
        return;
    }

    const location = locationInput.value.trim();
    const name = deteriorationNameInput.value.trim();
    const photoNumber = photoNumberInput.value.trim();

    if (!location || !name) {
        alert("場所と劣化名を入力してください。");
        return;
    }

    // 次の番号を取得
    const nextNumber = await getNextDeteriorationNumber(currentProjectId, currentBuildingId);
    if (nextNumber === null) {
        alert("劣化番号の取得に失敗しました。もう一度試してください。");
        return;
    }

    const newData = {
        number: nextNumber,
        location: location,
        name: name,
        photoNumber: photoNumber || '' // 写真番号は空でもOK
    };

    try {
        const deteriorationRef = getDeteriorationsRef(currentProjectId, currentBuildingId);
        // push() で新しいユニークIDを生成してデータを保存
        await deteriorationRef.push(newData);
        console.log(`Deterioration data added for ${currentBuildingId}:`, newData);

        // フォームをクリア
        locationInput.value = '';
        deteriorationNameInput.value = '';
        photoNumberInput.value = '';
        // 次の番号表示を更新 (リスナーで更新されるが、即時反映のため)
        updateNextIdDisplay(currentProjectId, currentBuildingId);

        // TODO: Implement continuous registration logic if needed

    } catch (error) {
        console.error("Error adding deterioration data:", error);
        alert("劣化情報の追加に失敗しました。");
        // 番号カウンターを戻す処理が必要になる場合がある (複雑)
    }
}

// 登録済み劣化情報テーブルを描画/更新
function renderDeteriorationTable(buildingId) {
    deteriorationTableBody.innerHTML = ''; // テーブルをクリア
    const dataForBuilding = deteriorationData[buildingId] || {};
    const records = Object.entries(dataForBuilding)
                        .map(([id, data]) => ({ id, ...data })) // オブジェクトを配列に変換
                        .sort((a, b) => a.number - b.number); // 番号順にソート

    if (records.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" class="text-center text-gray-500 py-4">この建物のデータはまだありません</td>`;
        deteriorationTableBody.appendChild(tr);
        nextIdDisplay.textContent = '1'; // データがなければ次は1
    } else {
        records.forEach(record => {
            const tr = document.createElement('tr');
            tr.dataset.recordId = record.id; // データIDを行に保持
            tr.innerHTML = `
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900">${record.number}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHtml(record.location)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHtml(record.name)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500">${escapeHtml(record.photoNumber)}</td>
                <td class="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-indigo-600 hover:text-indigo-900 mr-2 edit-btn">編集</button>
                    <button class="text-red-600 hover:text-red-900 delete-btn">削除</button>
                </td>
            `;
            // 編集・削除ボタンのイベントリスナーを追加
            tr.querySelector('.edit-btn').addEventListener('click', () => handleEditClick(buildingId, record.id));
            tr.querySelector('.delete-btn').addEventListener('click', () => handleDeleteClick(buildingId, record.id, record.number));
            deteriorationTableBody.appendChild(tr);
        });
         // 次の番号表示を更新
        updateNextIdDisplay(currentProjectId, buildingId);
    }
}

// 次の番号表示を更新する関数
async function updateNextIdDisplay(projectId, buildingId) {
    if (!projectId || !buildingId) {
        nextIdDisplay.textContent = '1';
        return;
    }
    try {
        const snapshot = await getDeteriorationCounterRef(projectId, buildingId).once('value');
        const currentCounter = snapshot.val() || 0;
        nextIdDisplay.textContent = (currentCounter + 1).toString();
    } catch (error) {
        console.error("Error fetching counter for next ID display:", error);
        nextIdDisplay.textContent = '-'; // エラー時は表示を変更
    }
}

// HTMLエスケープ関数 (簡易版)
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// 特定の建物の劣化情報リスナーを設定
function setupDeteriorationListener(projectId, buildingId) {
    if (!projectId || !buildingId) return;

    // 既存のリスナーがあればデタッチ
    if (deteriorationListeners[buildingId]) {
        deteriorationListeners[buildingId].off();
        console.log(`Detached existing deterioration listener for ${buildingId}`);
    }

    console.log(`Setting up deterioration listener for ${buildingId} in project ${projectId}`);
    const ref = getDeteriorationsRef(projectId, buildingId);
    deteriorationListeners[buildingId] = ref;

    // 初期データ読み込みと変更監視
    ref.on('value', (snapshot) => {
        deteriorationData[buildingId] = snapshot.val() || {};
        console.log(`Deterioration data updated for ${buildingId}:`, deteriorationData[buildingId]);
        if (buildingId === currentBuildingId) { // 現在選択中の建物ならテーブル再描画
            renderDeteriorationTable(buildingId);
        }
    }, (error) => {
        console.error(`Error listening for deterioration data for ${buildingId}:`, error);
        // エラー処理
    });
     // 次の番号表示も更新
     updateNextIdDisplay(projectId, buildingId);
}

// 全ての建物に対するリスナーを解除
function detachAllDeteriorationListeners() {
    Object.entries(deteriorationListeners).forEach(([buildingId, listenerRef]) => {
        listenerRef.off();
        console.log(`Detached deterioration listener for ${buildingId}`);
    });
    deteriorationListeners = {};
    deteriorationData = {}; // データもクリア
}

// --- Edit/Delete Logic (Placeholders/Basic Implementation) ---
function handleEditClick(buildingId, recordId) {
    if (!deteriorationData[buildingId] || !deteriorationData[buildingId][recordId]) {
        console.error(`Record ${recordId} not found for building ${buildingId}`);
        return;
    }
    const record = deteriorationData[buildingId][recordId];
    console.log(`Editing record ${recordId} for building ${buildingId}:`, record);

    currentEditRecordId = recordId; // 編集中のレコードIDを保持

    // モーダルにデータをセット
    editIdDisplay.textContent = record.number;
    editLocationInput.value = record.location;
    editDeteriorationNameInput.value = record.name;
    editPhotoNumberInput.value = record.photoNumber;

    // モーダル表示
    editModal.classList.remove('hidden');
}

async function handleEditSubmit(event) {
    event.preventDefault();
    if (!currentProjectId || !currentBuildingId || !currentEditRecordId) {
        alert("編集対象の情報が正しくありません。");
        return;
    }

    const updatedData = {
        number: parseInt(editIdDisplay.textContent, 10), // 番号は変更しない想定
        location: editLocationInput.value.trim(),
        name: editDeteriorationNameInput.value.trim(),
        photoNumber: editPhotoNumberInput.value.trim()
    };

    if (!updatedData.location || !updatedData.name) {
        alert("場所と劣化名は必須です。");
        return;
    }

    try {
        const recordRef = getDeteriorationsRef(currentProjectId, currentBuildingId).child(currentEditRecordId);
        await recordRef.update(updatedData);
        console.log(`Record ${currentEditRecordId} updated successfully.`);
        editModal.classList.add('hidden'); // モーダルを閉じる
        currentEditRecordId = null; // 編集対象IDをクリア
    } catch (error) {
        console.error("Error updating record:", error);
        alert("情報の更新に失敗しました。");
    }
}

async function handleDeleteClick(buildingId, recordId, recordNumber) {
    if (!currentProjectId) return;

    if (confirm(`番号 ${recordNumber} の劣化情報「${deteriorationData[buildingId]?.[recordId]?.name || '' }」を削除しますか？`)) {
        try {
            const recordRef = getDeteriorationsRef(currentProjectId, buildingId).child(recordId);
            await recordRef.remove();
            console.log(`Record ${recordId} deleted successfully.`);
            // 注意: カウンターは戻さない。欠番となる。
            // もしカウンターを戻す場合は Transaction が必要で複雑になる。
        } catch (error) {
            console.error("Error deleting record:", error);
            alert("情報の削除に失敗しました。");
        }
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  // Set current year in footer
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

  // Initialize with Info tab active
  switchTab('info');

  // Load prediction data (CSV)
  await loadPredictionData();
  console.log("Prediction data loaded.");

  // Setup prediction listeners
  setupPredictionListeners(locationInput, locationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(deteriorationNameInput, deteriorationPredictionsList, generateDeteriorationPredictions);
  setupPredictionListeners(editLocationInput, editLocationPredictionsList, generateLocationPredictions);
  setupPredictionListeners(editDeteriorationNameInput, editDeteriorationPredictionsList, generateDeteriorationPredictions);

  // Setup basic info listeners
  setupBasicInfoListeners();

  // Initial attempt to load basic info based on current form values (if any)
  const initialSiteName = siteNameInput.value.trim();
  const initialSurveyDate = surveyDateInput.value;
  currentProjectId = generateProjectId(initialSiteName, initialSurveyDate);
  if (currentProjectId) {
    console.log("Initial Project ID derived from form:", currentProjectId);
    await loadBasicInfo(currentProjectId);
    // 初期のプロジェクトIDに基づいて建物のリスナーを開始
    setupBuildingManagementListeners(); 
  } else {
     console.log("Initial project ID could not be determined from form.");
     updateBuildingSelector(null); // 建物セレクタをリセット
  }

  // Setup building add button listener (once)
  addBuildingBtn.addEventListener('click', addBuilding);

  // Setup deterioration form listener
  deteriorationForm.addEventListener('submit', handleDeteriorationSubmit);

  // Setup edit form listener
  editForm.addEventListener('submit', handleEditSubmit);

  console.log("Initialization complete.");

  // TODO: Set up other event listeners (forms, buttons etc.)
  // ... (cancelEditBtn listener)
}); 