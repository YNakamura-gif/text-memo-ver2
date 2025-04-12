// ======================================================================
// 1. Firebase Configuration & Initialization
// ======================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBLP1YSrdUd_LGu4xZ-jKf-_FPYljq226w",
  authDomain: "project-4814457387099311122.firebaseapp.com",
  databaseURL: "https://project-4814457387099311122-default-rtdb.firebaseio.com",
  projectId: "project-4814457387099311122",
  storageBucket: "project-4814457387099311122.firebasestorage.app",
  messagingSenderId: "1065188683035",
  appId: "1:1065188683035:web:0a2dce8ad18521bfba77be",
  measurementId: "G-S3H1YJQEPR"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ======================================================================
// 2. Global State & Prediction Data Storage
// ======================================================================
let locationPredictions = [];
let degradationItemsData = []; // 新しい劣化項目データ用

let currentProjectId = null;
let currentBuildingId = null;
let buildings = {};
let lastUsedBuilding = null;
let deteriorationData = {};
let deteriorationListeners = {};
let currentEditRecordId = null;
let lastAddedLocation = '';
let lastAddedName = '';
let buildingsListener = null; // Firebase listener for buildings

// ======================================================================
// 3. Firebase Reference Getters
// ======================================================================
function getProjectBaseRef(projectId) {
  return database.ref(`projects/${projectId}`);
}
function getProjectInfoRef(projectId) {
  return database.ref(`projects/${projectId}/info`);
}
function getBuildingsRef(projectId) {
  return database.ref(`projects/${projectId}/buildings`);
}
function getDeteriorationsRef(projectId, buildingId) {
  return database.ref(`projects/${projectId}/deteriorations/${buildingId}`);
}
function getDeteriorationCounterRef(projectId, buildingId) {
  return database.ref(`projects/${projectId}/counters/${buildingId}`);
}

// ======================================================================
// 4. Utility Functions
// ======================================================================
function generateProjectId(siteName) {
    if (!siteName) return null;
    const safeSiteName = siteName.replace(/[.#$\[\]]/g, '_'); 
    return safeSiteName;
}

function generateBuildingId(buildingName) {
    if (!buildingName) return null;
    const safeBuildingName = buildingName.replace(/[.#$\[\]]/g, '_').substring(0, 50); 
    return safeBuildingName;
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

// ★ NEW: Katakana to Hiragana converter function
function katakanaToHiragana(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[ァ-ヶ]/g, match => {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

// ★ NEW: Full-width numbers to Half-width converter function
function zenkakuToHankaku(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
}

// ======================================================================
// 5. Data Loading/Parsing (CSV, Predictions)
// ======================================================================
function parseCsv(csvText, expectedColumns) {
  console.log("[parseCsv] Starting parse. Expected columns:", expectedColumns);
  console.log("[parseCsv] Received text (first 100 chars):", csvText.substring(0, 100)); // ★ 追加：受け取ったテキストの先頭を表示
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) {
    console.warn("CSV file has no data or only a header.");
    return [];
  }
  const header = lines.shift().split(',');
  console.log("[parseCsv] Header:", header);
  if (header.length < expectedColumns) {
      console.warn(`CSV header has fewer columns (${header.length}) than expected (${expectedColumns}).`);
  }

  return lines.map((line, index) => { // ★ 追加：行番号もログ
    const values = line.split(',');
    console.log(`[parseCsv] Line ${index + 1} values:`, values); // ★ 追加：パースした各行の配列を表示
    if (expectedColumns === 3 && header[0] === '階数') { // ヘッダーで場所CSVかを判断
      const floor = values[0]?.trim() || ''; // 階数がない場合は空文字に
      const value = values[1]?.trim(); // 部屋名
      const reading = values[2]?.trim(); // 読み
      // 部屋名があれば有効なデータとする
      return value ? { floor: floor, value: value, reading: reading || '' } : null;
    }
    // ★ 劣化項目CSV (3列想定) の処理
    else if (expectedColumns === 3 && header[0] === '劣化名') { // ★ header[0]が劣化名の場合を追加
      const name = values[0]?.trim();
      const code = values[1]?.trim();
      const reading = values[2]?.trim();
      return name ? { name: name, code: code || '', reading: reading || '' } : null;
    } else {
      console.warn(`Unsupported expectedColumns or unknown CSV format: ${expectedColumns}, Header: ${header[0]}`);
      return null;
    }
  }).filter(item => item !== null);
}

async function fetchAndParseCsv(filePath, expectedColumns) { 
  console.log(`Fetching CSV from: ${filePath}`);
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for ${filePath}`);
    }
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    let text = decoder.decode(buffer);
    console.log(`[fetchAndParseCsv] Decoded text (first 200 chars) from ${filePath}:`, text.substring(0, 200)); // ★ 追加：デコード直後のテキストを表示
    console.log(`[fetchAndParseCsv] First char code: ${text.charCodeAt(0)} (BOM check: 65279 is BOM)`); // ★ 追加：BOM確認用ログ
    if (text.charCodeAt(0) === 0xFEFF) {
      console.log("[fetchAndParseCsv] BOM detected and removed."); // ★ 追加
      text = text.slice(1);
    }
    return parseCsv(text, expectedColumns); 
  } catch (error) {
    console.error(`Error fetching or parsing CSV ${filePath}:`, error);
    return [];
  }
}

async function loadPredictionData() {
  console.log("Loading prediction data...");
  try {
    // Promise.all を使って並列読み込み
    [locationPredictions, degradationItemsData] = await Promise.all([
      fetchAndParseCsv('./部屋名_読み付き.csv', 3),       // ★ 変更: 場所データは3列期待
      fetchAndParseCsv('./劣化項目_読み付き.csv', 3)     // 劣化項目データは3列期待
    ]);
    // 古い部位・劣化名のログを削除
    console.log(`Loaded ${locationPredictions.length} location predictions (Rooms with Floor).`);
    console.log(`Loaded ${degradationItemsData.length} degradation items (Name, Code, Reading).`);
    // degradationItemsData の内容を少し表示して確認 (デバッグ用)
    console.log("Sample degradationItemsData:", degradationItemsData.slice(0, 5)); 
  } catch (error) {
    console.error("Critical error loading prediction data:", error);
    alert("予測変換データの読み込みに失敗しました。アプリケーションが正しく動作しない可能性があります。");
  }
}

// ======================================================================
// 6. Prediction Logic Functions
// ======================================================================

// ★ COMBINED RESULTS generateLocationPredictions function
function generateLocationPredictions(inputText) {
  console.log(`[generateLocationPredictions] Input: \"${inputText}\"`);

  // ★ 1. Convert full-width numbers to half-width in the input
  const inputTextHankaku = zenkakuToHankaku(inputText.trim());
  console.log(`[generateLocationPredictions] Input after Hankaku conversion: \"${inputTextHankaku}\"`);

  let floorSearchTerm = null;
  let roomSearchTermRaw = inputTextHankaku;
  let roomSearchTermHiragana = '';

  // Regex to detect floor prefix (e.g., 1, B1, PH)
  const floorMatch = roomSearchTermRaw.match(/^([a-zA-Z0-9]{1,3})(.*)$/);

  if (floorMatch && floorMatch[1] && floorMatch[2]) {
    floorSearchTerm = floorMatch[1].toLowerCase();
    roomSearchTermRaw = floorMatch[2];
    console.log(`[generateLocationPredictions] Floor search term: '${floorSearchTerm}', Room search term raw: '${roomSearchTermRaw}'`);
  } else if (roomSearchTermRaw.match(/^[a-zA-Z0-9]{1,3}$/)) {
      floorSearchTerm = roomSearchTermRaw.toLowerCase();
      roomSearchTermRaw = '';
      console.log(`[generateLocationPredictions] Input is potentially floor only: '${floorSearchTerm}'`);
  } else {
    console.log("[generateLocationPredictions] No floor prefix detected in input.");
  }

  roomSearchTermHiragana = katakanaToHiragana(roomSearchTermRaw.toLowerCase());

  if (!roomSearchTermHiragana && !floorSearchTerm) {
      console.log("[generateLocationPredictions] No valid search term.");
      return [];
  }

  // ★ 2. Find matching floors from CSV
  let matchingFloors = [];
  const floorSet = new Set(); // Use Set to avoid duplicates
  if (floorSearchTerm !== null) {
    locationPredictions.forEach(item => {
      const itemFloorLower = item.floor?.toLowerCase() || '';
      if (itemFloorLower.startsWith(floorSearchTerm)) {
        floorSet.add(item.floor); // Add the original floor string (not lowercase)
      }
    });
    matchingFloors = Array.from(floorSet);
    console.log(`[generateLocationPredictions] Found ${matchingFloors.length} matching floors in CSV:`, matchingFloors);
  } else {
    // If no floor search term, we only search based on room name later.
    // We don't add [''] here anymore, as it complicates combination logic.
    console.log(`[generateLocationPredictions] No floor search term, will search by room name only.`);
  }

  // ★ 3. Find matching room names from CSV
  let matchingRoomNames = [];
  const roomNameSet = new Set(); // Use Set to avoid duplicates

  if (roomSearchTermHiragana) {
    // If a room name part is entered, find rooms matching the reading
    locationPredictions.forEach(item => {
      const itemReadingHiragana = katakanaToHiragana(item.reading?.toLowerCase() || '');
      if (itemReadingHiragana.startsWith(roomSearchTermHiragana)) {
        if (item.value) roomNameSet.add(item.value); // Add the room name if it exists
      }
    });
    matchingRoomNames = Array.from(roomNameSet);
    console.log(`[generateLocationPredictions] Found ${matchingRoomNames.length} matching room names based on reading:`, matchingRoomNames);

  } else if (floorSearchTerm !== null) {
    // <<<<< MODIFIED LOGIC >>>>>
    // If ONLY floor is entered, get ALL unique room names from the CSV
    console.log('[generateLocationPredictions] Floor term entered, collecting all unique room names.');
    locationPredictions.forEach(item => {
      if (item.value) { // Ensure room name exists
        roomNameSet.add(item.value);
      }
    });
    matchingRoomNames = Array.from(roomNameSet);
    console.log(`[generateLocationPredictions] Collected ${matchingRoomNames.length} unique room names from CSV.`);
    // <<<<< END MODIFIED LOGIC >>>>>

  } else {
    // No floor or room search term (should not happen due to check at the beginning)
    console.log('[generateLocationPredictions] No floor or room search term, no room name matches generated.');
  }

  // ★ 4. Generate all combinations
  let combinations = [];

  // Add matching floors themselves as candidates if no room name was specifically searched
  if (!roomSearchTermHiragana && floorSearchTerm) {
    matchingFloors.forEach(floor => {
        if (floor) { // Ensure floor is not empty
            combinations.push(floor);
        }
    });
  }

  // Generate floor + room name combinations
  for (const floor of matchingFloors) {
      if (!floor) continue; // Skip if floor is empty
      for (const roomName of matchingRoomNames) {
         if (!roomName) continue; // Skip if room name is empty
          // Only add combination if floor was part of the search OR room name was part of search
         if (floorSearchTerm || roomSearchTermHiragana) {
              combinations.push(`${floor} ${roomName}`);
         }
      }
  }

  // If only a room name was searched (no floor), ensure room names themselves are included
  if (!floorSearchTerm && roomSearchTermHiragana) {
       matchingRoomNames.forEach(room => {
           if (room) combinations.push(room);
       });
  }


  console.log(`[generateLocationPredictions] Generated ${combinations.length} raw combinations`);
  if (combinations.length > 0) console.log("[generateLocationPredictions] Raw combinations sample:", combinations.slice(0, 10));


  // Remove duplicates and limit
  const uniqueCombinations = [...new Set(combinations)];
  console.log(`[generateLocationPredictions] Final unique combinations count: ${uniqueCombinations.length}`);
  if (uniqueCombinations.length > 0) console.log("[generateLocationPredictions] Final unique combinations sample:", uniqueCombinations.slice(0, 10));


  // Return up to 10 combinations
  return uniqueCombinations.slice(0, 10);
}

function generateDeteriorationPredictions(inputText) {
  console.log(`[generateDeteriorationPredictions] Input: "${inputText}"`);
  // ★ 入力もひらがなに変換
  const searchTermHiragana = katakanaToHiragana(inputText.trim().toLowerCase());
  if (!searchTermHiragana) return [];

  console.log("[generateDeteriorationPredictions] Searching in degradationItemsData:", degradationItemsData.length, "items with term:", searchTermHiragana);

  let results = [];

  // 1. 読み仮名による前方一致検索 (ひらがなで比較)
  const readingMatches = degradationItemsData
    .filter(item => {
        // ★ CSV側の読み仮名もひらがなに変換して比較
        const readingHiragana = katakanaToHiragana(item.reading?.toLowerCase() || '');
        return readingHiragana.startsWith(searchTermHiragana);
    })
    .map(item => item.name);

  console.log(`[generateDeteriorationPredictions] Reading matches found: ${readingMatches.length}`); 
  if (readingMatches.length > 0) console.log("[generateDeteriorationPredictions] Reading matches sample:", readingMatches.slice(0, 5));
  results = results.concat(readingMatches);

  // 2. 2文字コードによる完全一致検索 (入力がちょうど2文字の場合)
  // ★ コード検索はそのまま (英数字想定)
  const searchTermCode = inputText.trim().toLowerCase(); // コード検索用は元の入力を使う
  if (searchTermCode.length === 2) { 
    const codeMatches = degradationItemsData
      .filter(item => {
          const codeLower = item.code?.toLowerCase();
          return codeLower && codeLower === searchTermCode;
        })
      .map(item => item.name); 
      
    console.log(`[generateDeteriorationPredictions] Code matches found for '${searchTermCode}': ${codeMatches.length}`); 
    if (codeMatches.length > 0) console.log("[generateDeteriorationPredictions] Code matches sample:", codeMatches.slice(0, 5));
    results = results.concat(codeMatches);
  }

  // 重複を除去して最大10件返す
  const uniqueResults = [...new Set(results)];
  console.log(`[generateDeteriorationPredictions] Total unique results before slice: ${uniqueResults.length}`);
  return uniqueResults.slice(0, 10);
}

function showPredictions(inputElement, predictionListElement, predictions) {
  predictionListElement.innerHTML = ''; // Clear previous predictions

  if (predictions.length > 0) {
    predictions.forEach(prediction => {
      const li = document.createElement('li');
      li.textContent = prediction;
      li.setAttribute('tabindex', '-1');
      li.classList.add('px-3', 'py-1', 'cursor-pointer', 'hover:bg-blue-100', 'list-none', 'text-sm');

      // Restore touchend event listener
      li.addEventListener('touchend', (e) => {
        e.preventDefault();
        inputElement.value = prediction;

        // ★ Restore simple hidePredictions call
        hidePredictions(predictionListElement);

        let nextFocusElement = null;
        if (inputElement.id === 'locationInput') {
          nextFocusElement = document.getElementById('deteriorationNameInput');
        } else if (inputElement.id === 'deteriorationNameInput') {
          nextFocusElement = document.getElementById('photoNumberInput');
        } else if (inputElement.id === 'editLocationInput') {
          nextFocusElement = document.getElementById('editDeteriorationNameInput');
        } else if (inputElement.id === 'editDeteriorationNameInput') {
          nextFocusElement = document.getElementById('editPhotoNumberInput');
        }

        if (nextFocusElement) {
          // ★ Restore focus/click attempt with timeout 0
          setTimeout(() => {
            nextFocusElement.focus();
            nextFocusElement.click();
          }, 0);
        }
      });
      predictionListElement.appendChild(li);
    });
    predictionListElement.classList.remove('hidden');
  } else {
    hidePredictions(predictionListElement);
  }
}

function hidePredictions(predictionListElement) {
  predictionListElement.classList.add('hidden');
}

function setupPredictionListeners(inputElement, predictionListElement, generatorFn, nextElementId) {
  if (!inputElement || !predictionListElement) {
      console.warn("setupPredictionListeners: Input or List element not found.");
      return;
  }

  inputElement.addEventListener('input', () => {
    const inputText = inputElement.value;
    if (inputText.trim()) {
        const predictions = generatorFn(inputText);
        showPredictions(inputElement, predictionListElement, predictions);
    } else {
        hidePredictions(predictionListElement);
    }
  });

  // Restore original blur listener
  inputElement.addEventListener('blur', () => {
    setTimeout(() => hidePredictions(predictionListElement), 200);
  });

  inputElement.addEventListener('focus', () => {
    const inputText = inputElement.value;
    if (inputText.trim()) {
      const predictions = generatorFn(inputText);
      if (predictions.length > 0) {
          showPredictions(inputElement, predictionListElement, predictions);
      }
    }
  });

  // ★★★ Enterキーでのフォーカス移動リスナーを追加 ★★★
  if (nextElementId) { // 次の要素のIDが指定されている場合のみ
    inputElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault(); // デフォルトのEnter動作（フォーム送信など）を抑制
        hidePredictions(predictionListElement); // 予測リストを隠す
        const nextElement = document.getElementById(nextElementId);
        if (nextElement) {
          nextElement.focus(); // 次の要素にフォーカス
        }
      }
    });
  }
  // ★★★ ここまで ★★★
}

// ======================================================================
// 7. UI Update Functions
// ======================================================================
function switchTab(activeTabId, infoTabBtn, detailTabBtn, infoTab, detailTab) {
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

async function updateNextIdDisplay(projectId, buildingId, nextIdDisplayElement) {
  if (!projectId || !buildingId) {
    nextIdDisplayElement.textContent = '1';
    return;
  }
  try {
    const snapshot = await getDeteriorationCounterRef(projectId, buildingId).once('value');
    const currentCounter = snapshot.val() || 0;
    nextIdDisplayElement.textContent = (currentCounter + 1).toString();
  } catch (error) {
    console.error("Error fetching counter for next ID display:", error);
    nextIdDisplayElement.textContent = '-'; 
  }
}

function renderDeteriorationTable(recordsToRender, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
    if (!deteriorationTableBodyElement) return;
    deteriorationTableBodyElement.innerHTML = ''; // Clear existing rows

    if (recordsToRender.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5; // Span all columns
        td.textContent = '登録データがありません。';
        td.classList.add('text-center', 'py-4', 'text-gray-500');
        tr.appendChild(td);
        deteriorationTableBodyElement.appendChild(tr);
        return;
    }

    recordsToRender.forEach(record => {
        const tr = document.createElement('tr');
        tr.classList.add('border-b');
        tr.innerHTML = `
            <td class="py-0 px-2 text-center text-sm">${escapeHtml(record.number)}</td>
            <td class="py-0 px-2 text-sm">
                <div class="cell-truncate" title="${escapeHtml(record.location)}">
                    ${escapeHtml(record.location)}
                </div>
            </td>
            <td class="py-0 px-2 text-sm">
                <div class="cell-truncate" title="${escapeHtml(record.name)}">
                    ${escapeHtml(record.name)}
                </div>
            </td>
            <td class="py-0 px-2 text-center text-sm">${escapeHtml(record.photoNumber)}</td>
            <td class="py-0 px-1 text-center whitespace-nowrap">
                <button class="edit-btn bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded text-sm">編集</button>
                <button class="delete-btn bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded text-sm">削除</button>
            </td>
        `;
        // Add event listeners for edit and delete buttons
        const editBtn = tr.querySelector('.edit-btn');
        const deleteBtn = tr.querySelector('.delete-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => handleEditClick(currentProjectId, currentBuildingId, record.id, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput));
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeleteClick(currentProjectId, currentBuildingId, record.id, record.number));
        }
        deteriorationTableBodyElement.appendChild(tr);
    });
}

// ======================================================================
// 8. Core Data Loading & UI Setup Functions
// ======================================================================
// Renamed from loadProjectsAndSetupSelector
async function populateProjectDataList(projectDataListElement) { 
    console.log("[populateProjectDataList] Populating project datalist...");
    projectDataListElement.innerHTML = ''; // Clear existing options
    // Removed buildingSelectElement reset logic from here
    try {
        const projectsRef = database.ref('projects');
        const snapshot = await projectsRef.once('value');
        const projectsData = snapshot.val();
        if (projectsData) {
            const projectPromises = Object.keys(projectsData).map(async (projectId) => {
                const infoSnap = await getProjectInfoRef(projectId).once('value');
                const infoData = infoSnap.val();
                // Return just the name for the datalist value
                return infoData?.siteName || projectId; 
            });
            let projectsList = await Promise.all(projectPromises);
            // Sort descending by name
            projectsList = projectsList.filter(name => name); // Remove null/empty names
            projectsList.sort((a, b) => b.localeCompare(a, 'ja')); 
            
            // Filter unique names before adding
            const uniqueNames = [...new Set(projectsList)];

            uniqueNames.forEach(projectName => {
                const option = document.createElement('option');
                option.value = projectName;
                // option.textContent = projectName; // Not needed for datalist
                projectDataListElement.appendChild(option);
            });
            console.log(`[populateProjectDataList] Populated ${uniqueNames.length} unique projects.`);
        } else {
            console.log("[populateProjectDataList] No projects found.");
        }
    } catch (error) {
        console.error("[populateProjectDataList] Error loading projects:", error);
        // Don't alert here, maybe log is enough
    }
}

async function updateBuildingSelectorForProject(projectId, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
    console.log(`[updateBuildingSelectorForProject] Updating for projectId: ${projectId}`);
    buildingSelectElement.innerHTML = ''; 
    activeBuildingNameSpanElement.textContent = '';
    renderDeteriorationTable([], deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    nextIdDisplayElement.textContent = '1'; 
    detachAllDeteriorationListeners();
    currentBuildingId = null; 
    buildings = {}; 

    if (!projectId) {
        buildingSelectElement.innerHTML = '<option value="">-- 現場を選択 --</option>';
        buildingSelectElement.disabled = true;
        return;
    }

    buildingSelectElement.disabled = false; 
    buildingSelectElement.innerHTML = '<option value="">-- 建物を選択 --</option>';

    try {
        const buildingsRef = getBuildingsRef(projectId);
        if (buildingsListener) { buildingsRef.off('value', buildingsListener); }

        buildingsListener = buildingsRef.on('value', (snapshot) => {
            buildingSelectElement.innerHTML = '<option value="">-- 建物を選択 --</option>'; 
            buildings = snapshot.val() || {}; 
            const buildingsList = Object.entries(buildings).map(([id, data]) => ({ id, name: data.name })).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
            buildingsList.forEach(({ id, name }) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                buildingSelectElement.appendChild(option);
            });
            console.log(`[updateBuildingSelectorForProject] Populated ${buildingsList.length} buildings for ${projectId}.`);
        }, (error) => {
            console.error(`[updateBuildingSelectorForProject] Firebase listener error for buildings in ${projectId}:`, error);
            buildingSelectElement.innerHTML = '<option value="">読込エラー</option>';
            buildingSelectElement.disabled = true;
        });
    } catch (error) {
        console.error(`[updateBuildingSelectorForProject] Error fetching buildings for project ${projectId}:`, error);
        buildingSelectElement.innerHTML = '<option value="">読込エラー</option>';
        buildingSelectElement.disabled = true;
    }
}

// ★ NEW: Function to fetch/render deteriorations AND setup listener
async function fetchAndRenderDeteriorations(projectId, buildingId, deteriorationTableBodyElement, nextIdDisplayElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
    console.log(`[fetchAndRenderDeteriorations] Fetching for Project: ${projectId}, Building: ${buildingId}`);
    if (!projectId || !buildingId) {
        renderDeteriorationTable([], deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
        nextIdDisplayElement.textContent = '1';
        return;
    }
    
    detachAllDeteriorationListeners(); // Ensure no old listeners are running

    try {
        // 1. Fetch initial data
        const deteriorationsRef = getDeteriorationsRef(projectId, buildingId);
        const snapshot = await deteriorationsRef.once('value');
        const initialData = snapshot.val() || {};
        deteriorationData[buildingId] = initialData; // Update global cache
        console.log(`[fetchAndRenderDeteriorations] Initial data fetched for ${buildingId}:`, initialData);
        
        // 2. Render initial data (Sort descending by number)
        const records = Object.entries(initialData).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.number - a.number); // <-- Sort descending
        renderDeteriorationTable(records, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
        
        // 3. Update the next ID display based on fetched data
        await updateNextIdDisplay(projectId, buildingId, nextIdDisplayElement);
        
        // 4. Setup real-time listener for future updates
        setupDeteriorationListener(projectId, buildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);

    } catch (error) {
        console.error(`[fetchAndRenderDeteriorations] Error fetching/rendering deteriorations for ${buildingId}:`, error);
        renderDeteriorationTable([], deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
        nextIdDisplayElement.textContent = '-'; 
        alert(`劣化情報の読み込み中にエラーが発生しました: ${error.message}`);
    }
}

async function loadBasicInfo(projectId, surveyDateInput, siteNameInput) {
  if (!projectId) return;
  try {
    const snapshot = await getProjectInfoRef(projectId).once('value');
    const info = snapshot.val();
    if (info) {
      surveyDateInput.value = info.surveyDate || '';
      console.log("Basic info (survey date) loaded for project:", projectId);
    } else {
      console.log("No basic info found for project:", projectId);
      surveyDateInput.value = '';
    }
  } catch (error) {
    console.error("Error loading basic info:", error);
    surveyDateInput.value = '';
  }
}

// ★★★ getNextDeteriorationNumber 関数を追加 ★★★
async function getNextDeteriorationNumber(projectId, buildingId) {
  if (!projectId || !buildingId) return null;
  const counterRef = getDeteriorationCounterRef(projectId, buildingId);
  try {
    // Use a transaction to safely increment the counter
    const result = await counterRef.transaction(currentValue => (currentValue || 0) + 1);
    if (result.committed) {
      const nextNumber = result.snapshot.val();
      console.log(`Next deterioration number for ${buildingId}:`, nextNumber);
      return nextNumber;
    } else {
      console.error('Transaction aborted for deterioration counter');
      return null; // Indicate failure
    }
  } catch (error) {
    console.error("Error getting next deterioration number:", error);
    return null; // Indicate failure
  }
}

// ======================================================================
// 9. Event Handlers
// ======================================================================
async function handleAddProjectAndBuilding(surveyDateInput, siteNameInput, buildingSelectPresetElement, projectDataListElement, buildingSelectElement, activeProjectNameSpanElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, infoTabBtn, detailTabBtn, infoTab, detailTab) {
    const surveyDate = surveyDateInput.value;
    const siteName = siteNameInput.value.trim();
    const buildingName = buildingSelectPresetElement.value; // Get value from select
    if (!surveyDate || !siteName || !buildingName) { alert('調査日、現場名、建物名をすべて選択してください。'); return; } // Adjusted alert message
    
    const projectId = generateProjectId(siteName);
    const buildingId = generateBuildingId(buildingName);
    if (!projectId || !buildingId) { alert('ID生成エラー'); return; }
    console.log(`Adding project '${projectId}', building '${buildingId}'`);
    
    try {
        const existingOption = Array.from(projectDataListElement.options).find(opt => opt.value === siteName);
        if (existingOption) {
             console.log(`Project "${siteName}" already exists. Adding building only.`);
             currentProjectId = projectId; 
             await getBuildingsRef(projectId).child(buildingId).set({ name: buildingName });
        } else {
            await Promise.all([
                getProjectInfoRef(projectId).set({ siteName: siteName, surveyDate: surveyDate }),
                getBuildingsRef(projectId).child(buildingId).set({ name: buildingName })
            ]);
            await populateProjectDataList(projectDataListElement);
        }
        
        console.log(`Success: Added/Updated project '${projectId}', building '${buildingId}'.`);
        
        currentProjectId = projectId; 
        currentBuildingId = buildingId; 
        localStorage.setItem('lastProjectId', currentProjectId);
        localStorage.setItem('lastBuildingId', currentBuildingId); 
        
        siteNameInput.value = siteName; 
        activeProjectNameSpanElement.textContent = escapeHtml(siteName);
        
        await updateBuildingSelectorForProject(projectId, buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
        
        await new Promise(resolve => setTimeout(resolve, 250)); 
        
        if (buildingSelectElement.querySelector(`option[value="${buildingId}"]`)) {
             buildingSelectElement.value = buildingId; 
            await handleBuildingSelectChange(buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
        } else {
            console.warn("Newly added building not found in selector immediately after update.");
        }

        switchTab('detail', infoTabBtn, detailTabBtn, infoTab, detailTab);
        // buildingSelectPresetElement.value = ''; // No need to reset select value
        alert(`現場「${siteName}」に建物「${buildingName}」を追加し、選択しました。`);
    } catch (error) {
        console.error('Error adding project and building:', error);
        alert(`プロジェクトと建物の追加中にエラーが発生しました: ${error.message}`);
    }
}

async function handleBuildingSelectChange(buildingSelectElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
    const selectedBuildingId = buildingSelectElement.value;
    console.log(`[BuildingSelect Change] Selected buildingId: ${selectedBuildingId}`);

    if (selectedBuildingId && currentProjectId) {
        currentBuildingId = selectedBuildingId;
        localStorage.setItem('lastBuildingId', currentBuildingId);
        const selectedBuildingName = buildingSelectElement.options[buildingSelectElement.selectedIndex].text;
        activeBuildingNameSpanElement.textContent = escapeHtml(selectedBuildingName);
        // ★ Call the new function to fetch, render, and set up listener
        await fetchAndRenderDeteriorations(currentProjectId, currentBuildingId, deteriorationTableBodyElement, nextIdDisplayElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
    } else {
        currentBuildingId = null;
        localStorage.removeItem('lastBuildingId');
        activeBuildingNameSpanElement.textContent = '';
        renderDeteriorationTable([], deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
        nextIdDisplayElement.textContent = '1';
        detachAllDeteriorationListeners();
    }
}

async function handleDeteriorationSubmit(event, locationInput, deteriorationNameInput, photoNumberInput, nextIdDisplayElement) {
  event.preventDefault();
  if (!currentProjectId || !currentBuildingId) {
    alert("プロジェクトまたは建物が選択されていません。"); return;
  }
  const location = locationInput.value.trim();
  const name = deteriorationNameInput.value.trim();
  let photoNumber = photoNumberInput.value.trim();
  if (!location || !name) { alert("場所と劣化名を入力してください。"); return; }

  // ★★★ 写真番号のバリデーションと半角変換 ★★★
  if (photoNumber) { // 入力がある場合のみ処理
    photoNumber = zenkakuToHankaku(photoNumber);
    if (!/^[0-9]*$/.test(photoNumber)) {
      console.log("[Validation] Photo number contains non-numeric characters. Submission prevented.");
      return; // 数字以外が含まれていたら中断
    }
  }
  // ★★★ ここまで ★★★

  const nextNumber = await getNextDeteriorationNumber(currentProjectId, currentBuildingId);
  if (nextNumber === null) { alert("劣化番号の取得に失敗しました。もう一度試してください。"); return; }
  const newData = { number: nextNumber, location, name, photoNumber: photoNumber || '' };
  try {
    const deteriorationRef = getDeteriorationsRef(currentProjectId, currentBuildingId);
    await deteriorationRef.push(newData);
    console.log(`Deterioration data added for ${currentBuildingId}:`, newData);
    recordLastAddedData(location, name); // Uses global lastAdded...
    locationInput.value = '';
    deteriorationNameInput.value = '';
    photoNumberInput.value = '';
    updateNextIdDisplay(currentProjectId, currentBuildingId, nextIdDisplayElement);
  } catch (error) {
    console.error("Error adding deterioration data:", error);
    alert("劣化情報の追加に失敗しました。");
  }
}

function handleEditClick(projectId, buildingId, recordId, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
  if (!deteriorationData[buildingId] || !deteriorationData[buildingId][recordId]) {
    console.error(`Record ${recordId} not found for building ${buildingId}`); return;
  }
  const record = deteriorationData[buildingId][recordId];
  console.log(`Editing record ${recordId} for building ${buildingId}:`, record);
  currentEditRecordId = recordId;
  editModalElement.classList.remove('hidden');
  editIdDisplay.textContent = record.number;
  editLocationInput.value = record.location;
  editDeteriorationNameInput.value = record.name;
  editPhotoNumberInput.value = record.photoNumber;
}

async function handleEditSubmit(event, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, editModalElement) {
  event.preventDefault();
  if (!currentProjectId || !currentBuildingId || !currentEditRecordId) {
    alert("編集対象の情報が正しくありません。"); return;
  }
  
  let photoNumberValue = editPhotoNumberInput.value.trim();
  // ★★★ 写真番号のバリデーションと半角変換 ★★★
  if (photoNumberValue) { // 入力がある場合のみ処理
    photoNumberValue = zenkakuToHankaku(photoNumberValue);
    if (!/^[0-9]*$/.test(photoNumberValue)) {
      console.log("[Validation] Photo number contains non-numeric characters. Edit submission prevented.");
      return; // 数字以外が含まれていたら中断
    }
  }
  // ★★★ ここまで ★★★
  
  const updatedData = {
    number: parseInt(editIdDisplay.textContent, 10), 
    location: editLocationInput.value.trim(),
    name: editDeteriorationNameInput.value.trim(),
    photoNumber: photoNumberValue // バリデーション済みの値を使用
  };
  if (!updatedData.location || !updatedData.name) { alert("場所と劣化名は必須です。"); return; }
  try {
    const recordRef = getDeteriorationsRef(currentProjectId, currentBuildingId).child(currentEditRecordId);
    await recordRef.update(updatedData);
    console.log(`Record ${currentEditRecordId} updated successfully.`);
    editModalElement.classList.add('hidden'); 
    currentEditRecordId = null; 
  } catch (error) {
    console.error("Error updating record:", error);
    alert("情報の更新に失敗しました。");
  }
}

async function handleDeleteClick(projectId, buildingId, recordId, recordNumber) {
  if (!projectId) return;
  if (confirm(`番号 ${recordNumber} の劣化情報「${deteriorationData[buildingId]?.[recordId]?.name || '' }」を削除しますか？`)) {
    try {
      const recordRef = getDeteriorationsRef(projectId, buildingId).child(recordId);
      await recordRef.remove();
      console.log(`Record ${recordId} deleted successfully.`);
    } catch (error) {
      console.error("Error deleting record:", error);
      alert("情報の削除に失敗しました。");
    }
  }
}

function recordLastAddedData(location, name) {
  lastAddedLocation = location;
  lastAddedName = name;
  console.log("Recorded last added data for continuous add:", { location, name });
}

async function handleContinuousAdd(photoNumberInput, nextIdDisplayElement) {
  if (!currentProjectId || !currentBuildingId) { alert("プロジェクトまたは建物が選択されていません。"); return; }
  if (!lastAddedLocation || !lastAddedName) { alert("連続登録する元データがありません。一度通常登録を行ってください。"); return; }
  let photoNumber = photoNumberInput.value.trim();

  // ★★★ 写真番号のバリデーションと半角変換 ★★★
  if (photoNumber) { // 入力がある場合のみ処理
    photoNumber = zenkakuToHankaku(photoNumber);
    if (!/^[0-9]*$/.test(photoNumber)) {
      console.log("[Validation] Photo number contains non-numeric characters. Continuous add prevented.");
      return; // 数字以外が含まれていたら中断
    }
  }
  // ★★★ ここまで ★★★

  const nextNumber = await getNextDeteriorationNumber(currentProjectId, currentBuildingId);
  if (nextNumber === null) { alert("劣化番号の取得に失敗しました。もう一度試してください。"); return; }
  const newData = { number: nextNumber, location: lastAddedLocation, name: lastAddedName, photoNumber: photoNumber || '' };
  try {
    const deteriorationRef = getDeteriorationsRef(currentProjectId, currentBuildingId);
    await deteriorationRef.push(newData);
    console.log(`Continuous deterioration data added for ${currentBuildingId}:`, newData);
    photoNumberInput.value = '';
    updateNextIdDisplay(currentProjectId, currentBuildingId, nextIdDisplayElement);
  } catch (error) {
    console.error("Error adding continuous deterioration data:", error);
    alert("連続登録に失敗しました。");
  }
}

// ======================================================================
// 10. Listener Setup Functions
// ======================================================================
// Modified to set up listeners for siteName input and building select
function setupSelectionListeners(siteNameInput, projectDataListElement, buildingSelectElement, activeProjectNameSpanElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, surveyDateInput) {
    console.log("[setupSelectionListeners] Setting up listeners...");
    
    let projectDataListOptions = []; // Cache datalist options
    // Function to update the cache
    const updateDataListCache = () => {
        projectDataListOptions = Array.from(projectDataListElement.options).map(opt => opt.value);
    };
    // Initial population and setup mutation observer for dynamic changes
    updateDataListCache(); 
    const observer = new MutationObserver(updateDataListCache);
    observer.observe(projectDataListElement, { childList: true });

    // Project Selection/Input Change Listener (Info Tab)
    siteNameInput.addEventListener('change', async (event) => { // Use 'change' to trigger after losing focus or selecting from datalist
        const enteredSiteName = event.target.value.trim();
        console.log(`[SiteName Change (Info Tab)] Entered/Selected: "${enteredSiteName}"`);

        // Check if the entered name exists in the datalist
        const projectId = generateProjectId(enteredSiteName);
        const isValidExistingProject = projectDataListOptions.includes(enteredSiteName) && projectId;
        
        if (isValidExistingProject) {
            console.log(`Found existing project: ${projectId}`);
            currentProjectId = projectId;
            localStorage.setItem('lastProjectId', currentProjectId);
            currentBuildingId = null;
            localStorage.removeItem('lastBuildingId');

            // Update displays and load related data
            activeProjectNameSpanElement.textContent = escapeHtml(enteredSiteName);
            await loadBasicInfo(currentProjectId, surveyDateInput, siteNameInput); 
            await updateBuildingSelectorForProject(
                currentProjectId, buildingSelectElement, activeBuildingNameSpanElement, 
                nextIdDisplayElement, deteriorationTableBodyElement, 
                editModalElement, editIdDisplay, editLocationInput, 
                editDeteriorationNameInput, editPhotoNumberInput
            );
        } else {
            console.log(`"${enteredSiteName}" is a new project name or invalid selection.`);
            // Treat as new project entry (or invalid), reset associated data
            currentProjectId = null; 
            localStorage.removeItem('lastProjectId'); 
            currentBuildingId = null;
            localStorage.removeItem('lastBuildingId');
            surveyDateInput.value = ''; // Clear survey date for new project
            activeProjectNameSpanElement.textContent = '未選択';
            buildingSelectElement.innerHTML = '<option value="">-- 現場を先に選択 --</option>';
            buildingSelectElement.disabled = true;
            activeBuildingNameSpanElement.textContent = '未選択';
            renderDeteriorationTable([], deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
            nextIdDisplayElement.textContent = '1';
            detachAllDeteriorationListeners();
        }
    });

    // Building Selection Change Listener (Detail Tab - remains mostly the same)
    buildingSelectElement.addEventListener('change', () => handleBuildingSelectChange(
        buildingSelectElement, activeBuildingNameSpanElement, 
        nextIdDisplayElement, deteriorationTableBodyElement, 
        editModalElement, editIdDisplay, editLocationInput, 
        editDeteriorationNameInput, editPhotoNumberInput
    ));
}

// Sets up the real-time listener for a specific building's deteriorations
function setupDeteriorationListener(projectId, buildingId, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput) {
    if (!projectId || !buildingId) return;
    console.log(`---> [setupDeteriorationListener] Attaching listener for ${buildingId}`);
    const ref = getDeteriorationsRef(projectId, buildingId);
    // Ensure old listener for this specific building is detached if re-attaching
    if (deteriorationListeners[buildingId] && typeof deteriorationListeners[buildingId].off === 'function') {
        deteriorationListeners[buildingId].off();
    }
    deteriorationListeners[buildingId] = ref; // Store the ref itself
    ref.on('value', (snapshot) => {
        const newData = snapshot.val() || {};
        deteriorationData[buildingId] = newData; // Update cache
        // Only re-render if this is the currently selected building
        if (buildingId === currentBuildingId) {
            console.log(`[Listener Callback] Data changed for current building ${buildingId}, rendering.`);
             // Sort descending by number for display
             const records = Object.entries(newData).map(([id, data]) => ({ id, ...data })).sort((a, b) => b.number - a.number); // <-- Sort descending
            renderDeteriorationTable(records, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput);
            // Optionally update next ID display based on listener update?
            // updateNextIdDisplay(projectId, buildingId, nextIdDisplayElement); 
        } else {
            console.log(`[Listener Callback] Data received for non-current building ${buildingId}.`);
        }
    }, (error) => { console.error(`Error listening for deteriorations for ${buildingId}:`, error); });
}

function detachAllDeteriorationListeners() {
  console.log("[detachAllDeteriorationListeners] Detaching all..."); 
  Object.entries(deteriorationListeners).forEach(([buildingId, listenerRef]) => {
    if (listenerRef && typeof listenerRef.off === 'function') { 
      listenerRef.off();
      console.log(`Detached deterioration listener for ${buildingId}`);
    } else {
      console.warn(`Invalid listenerRef found for building ${buildingId} in deteriorationListeners.`);
    }
  });
  deteriorationListeners = {}; 
  deteriorationData = {}; 
  console.log("[detachAllDeteriorationListeners] Detach complete. deteriorationListeners reset."); 
}

// ======================================================================
// 11. Initialization (Refactored)
// ======================================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing app...");
    initializeApp(); // Call the main initialization function
});

async function initializeApp() {
    // --- 1. Get Global Element References ---
    const surveyDateInput = document.getElementById('surveyDate');
    const siteNameInput = document.getElementById('siteName');
    const projectDataListElement = document.getElementById('projectDataList'); 
    const buildingSelectPresetElement = document.getElementById('buildingSelectPreset'); // Changed from buildingNameInput
    const addBuildingBtn = document.getElementById('addBuildingBtn');
    const buildingSelectElement = document.getElementById('buildingSelect');
    const activeProjectNameSpanElement = document.getElementById('activeProjectName');
    const activeBuildingNameSpanElement = document.getElementById('activeBuildingName');
    const infoTabBtn = document.getElementById('infoTabBtn');
    const detailTabBtn = document.getElementById('detailTabBtn');
    const infoTab = document.getElementById('infoTab');
    const detailTab = document.getElementById('detailTab');
    const deteriorationForm = document.getElementById('deteriorationForm');
    const locationInput = document.getElementById('locationInput');
    const deteriorationNameInput = document.getElementById('deteriorationNameInput');
    const photoNumberInput = document.getElementById('photoNumberInput');
    const nextIdDisplayElement = document.getElementById('nextIdDisplay');
    const deteriorationTableBodyElement = document.getElementById('deteriorationTableBody');
    const editModalElement = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const editIdDisplay = document.getElementById('editIdDisplay');
    const editLocationInput = document.getElementById('editLocationInput');
    const editDeteriorationNameInput = document.getElementById('editDeteriorationNameInput');
    const editPhotoNumberInput = document.getElementById('editPhotoNumberInput');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const currentYearSpan = document.getElementById('currentYear');
    const continuousAddBtn = document.getElementById('continuousAddBtn');
    const locationPredictionsList = document.getElementById('locationPredictions');
    const suggestionsContainer = document.getElementById('suggestions'); // 新しい候補表示用コンテナのID (HTML側と合わせる)
    const editLocationPredictionsList = document.getElementById('editLocationPredictions');
    const editSuggestionsContainer = document.getElementById('editSuggestions'); // 編集モーダル用のID (HTML側と合わせる)

    // --- 2. Initial UI Setup ---
    currentYearSpan.textContent = new Date().getFullYear();
    switchTab('info', infoTabBtn, detailTabBtn, infoTab, detailTab); // Default to info tab

    // --- 3. Load Prediction Data ---
    await loadPredictionData();
    console.log("Prediction data loading complete.");

    // --- 4. Load Project List (Populate datalist) ---
    await populateProjectDataList(projectDataListElement); // Changed function name and argument
    console.log("Project datalist population complete.");

    // --- 5. Restore Last State (Project & Building) ---
    const lastProjectId = localStorage.getItem('lastProjectId');
    // Find project name from datalist based on lastProjectId for restoration
    let lastProjectName = '';
    if (lastProjectId) {
        const optionFound = Array.from(projectDataListElement.options).find(opt => generateProjectId(opt.value) === lastProjectId);
        if (optionFound) {
            lastProjectName = optionFound.value;
        }
    }
    
    if (lastProjectId && lastProjectName) { // Restore only if ID and Name are found
        console.log(`Restoring last project: ${lastProjectId} (${lastProjectName})`);
        siteNameInput.value = lastProjectName; // Set site name input
        currentProjectId = lastProjectId;
        // Trigger change event on siteNameInput to load dependent data
        siteNameInput.dispatchEvent(new Event('change')); 
    } else {
        console.log("No valid last project found or name mismatch.");
        currentProjectId = null; // Ensure reset
        // Explicitly reset building select and detail display if no project restored
        buildingSelectElement.innerHTML = '<option value="">-- 現場を先に選択 --</option>';
        buildingSelectElement.disabled = true;
        activeProjectNameSpanElement.textContent = '未選択';
        activeBuildingNameSpanElement.textContent = '未選択';
    }

    // --- 6. Setup ALL Event Listeners --- 
    console.log("Setting up event listeners...");
    // Tabs (No changes needed)
    infoTabBtn.addEventListener('click', () => switchTab('info', infoTabBtn, detailTabBtn, infoTab, detailTab));
    detailTabBtn.addEventListener('click', () => {
        switchTab('detail', infoTabBtn, detailTabBtn, infoTab, detailTab);
    });
    // Predictions (No changes needed)
    if (locationInput && locationPredictionsList) setupPredictionListeners(locationInput, locationPredictionsList, generateLocationPredictions, 'deteriorationNameInput');
    if (deteriorationNameInput && suggestionsContainer) setupPredictionListeners(deteriorationNameInput, suggestionsContainer, generateDeteriorationPredictions, 'photoNumberInput'); // ★ 修正
    if (editLocationInput && editLocationPredictionsList) setupPredictionListeners(editLocationInput, editLocationPredictionsList, generateLocationPredictions, 'editDeteriorationNameInput');
    if (editDeteriorationNameInput && editSuggestionsContainer) setupPredictionListeners(editDeteriorationNameInput, editSuggestionsContainer, generateDeteriorationPredictions, 'editPhotoNumberInput'); // ★ 修正
    // Basic Info (Site name input handled by setupSelectionListeners)
    setupSelectionListeners(siteNameInput, projectDataListElement, buildingSelectElement, activeProjectNameSpanElement, activeBuildingNameSpanElement, nextIdDisplayElement, deteriorationTableBodyElement, editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, surveyDateInput);
    // Add Project/Building (Pass the new select element)
    if (addBuildingBtn) { 
        addBuildingBtn.addEventListener('click', () => handleAddProjectAndBuilding(
            surveyDateInput, siteNameInput, 
            buildingSelectPresetElement, // Pass the new select element
            projectDataListElement, 
            buildingSelectElement, activeProjectNameSpanElement, activeBuildingNameSpanElement, 
            nextIdDisplayElement, deteriorationTableBodyElement, 
            editModalElement, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, 
            infoTabBtn, detailTabBtn, infoTab, detailTab
        )); 
    } else { 
        console.error("Add button not found"); 
    }
    // Forms & Buttons (Adjust export handler call)
    if (deteriorationForm) deteriorationForm.addEventListener('submit', (event) => handleDeteriorationSubmit(event, locationInput, deteriorationNameInput, photoNumberInput, nextIdDisplayElement));
    if (editForm) editForm.addEventListener('submit', (event) => handleEditSubmit(event, editIdDisplay, editLocationInput, editDeteriorationNameInput, editPhotoNumberInput, editModalElement));
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => editModalElement.classList.add('hidden'));
    if (continuousAddBtn) continuousAddBtn.addEventListener('click', () => handleContinuousAdd(photoNumberInput, nextIdDisplayElement));
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => handleExportCsv(siteNameInput, buildingSelectElement)); // Pass siteNameInput

    console.log("Initialization complete.");
}

// ★★★ generateCsvContent 関数定義のコメントアウトを解除 ★★★
function generateCsvContent(buildingId) {
    if (!currentProjectId || !buildingId || !deteriorationData[buildingId]) { alert("エクスポート対象のデータがありません。"); return null; }
    const dataToExport = Object.values(deteriorationData[buildingId]).sort((a, b) => a.number - b.number);
    if (dataToExport.length === 0) { alert(`建物「${buildingId}」にはエクスポートするデータがありません。`); return null; }
    const header = ["番号", "場所", "劣化名", "写真番号"];
    const rows = dataToExport.map(d => [d.number, `"${(d.location || '').replace(/"/g, '""')}"`, `"${(d.name || '').replace(/"/g, '""')}"`, `"${(d.photoNumber || '').replace(/"/g, '""')}"`].join(','));
    const csvContent = "\uFEFF" + header.join(',') + "\n" + rows.join("\n");
    return csvContent;
}

// ★★★ downloadCsv 関数定義のコメントアウトを解除 ★★★
function downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) { 
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); 
    } else { alert("お使いのブラウザはCSVダウンロードに対応していません。"); }
}

// ★★★ handleExportCsv 関数定義のコメントアウトを解除 ★★★
function handleExportCsv(siteNameInput, buildingSelectElement) {
    // Use currentProjectId instead of reading from input/select for reliability
    if (!currentProjectId) { alert("プロジェクトが選択されていません。基本情報タブで現場を選択または入力してください。"); return; }
    
    const targetBuildingId = buildingSelectElement.value;
    if (!targetBuildingId) { alert("CSVをダウンロードする建物を選択してください。"); return; }
    
    const csvContent = generateCsvContent(targetBuildingId);
    if (csvContent) {
      // Get project name from the current state or input field
      const siteName = siteNameInput.value.trim() || 'プロジェクト'; 
      const safeSiteName = siteName.replace(/[^a-zA-Z0-9_\-]/g, '_');
      // Building name retrieval remains the same
      const safeBuildingName = buildingSelectElement.options[buildingSelectElement.selectedIndex].text.replace(/[^a-zA-Z0-9_\-]/g, '_'); 
      const filename = `${safeSiteName}_${safeBuildingName}_劣化情報.csv`;
      downloadCsv(csvContent, filename);
    }
}

// Only setup survey date listener here
function setupBasicInfoListeners(surveyDateInput, siteNameInput) {
    // Survey date save handler
    const saveDateHandler = () => saveBasicInfo(surveyDateInput, siteNameInput); 
    surveyDateInput.addEventListener('change', saveDateHandler);
    console.log("[setupBasicInfoListeners] Listener for surveyDate attached.");
} 