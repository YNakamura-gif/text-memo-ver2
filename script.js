// Main application logic will go here.

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');

  // --- DOM Elements ---
  const infoTabBtn = document.getElementById('infoTabBtn');
  const detailTabBtn = document.getElementById('detailTabBtn');
  const infoTab = document.getElementById('infoTab');
  const detailTab = document.getElementById('detailTab');

  const surveyDateInput = document.getElementById('surveyDate');
  const siteNameInput = document.getElementById('siteName');
  const initialBuildingNameInput = document.getElementById('buildingName'); // Renamed for clarity
  const newBuildingNameInput = document.getElementById('newBuildingName');
  const addBuildingBtn = document.getElementById('addBuildingBtn');
  const buildingListUl = document.getElementById('buildingList');

  const buildingSelect = document.getElementById('buildingSelect');
  const exportBuildingSelect = document.getElementById('exportBuildingSelect');
  const activeBuildingNameSpan = document.getElementById('activeBuildingName');
  const nextIdDisplay = document.getElementById('nextIdDisplay');
  const locationInput = document.getElementById('locationInput');
  const locationPredictionsUl = document.getElementById('locationPredictions');
  const deteriorationNameInput = document.getElementById('deteriorationNameInput');
  const deteriorationPredictionsUl = document.getElementById('deteriorationPredictions');
  const photoNumberInput = document.getElementById('photoNumberInput');
  const deteriorationForm = document.getElementById('deteriorationForm');
  const continuousAddBtn = document.getElementById('continuousAddBtn');

  const recordCountSpan = document.getElementById('recordCount');
  const deteriorationListContainer = document.getElementById('deteriorationListContainer');
  const deteriorationTableBody = document.getElementById('deteriorationTableBody');
  const noDataRow = document.getElementById('noDataRow');

  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  const editRecordIdInput = document.getElementById('editRecordId');
  const editIdDisplay = document.getElementById('editIdDisplay');
  const editLocationInput = document.getElementById('editLocationInput');
  const editLocationPredictionsUl = document.getElementById('editLocationPredictions');
  const editDeteriorationNameInput = document.getElementById('editDeteriorationNameInput');
  const editDeteriorationPredictionsUl = document.getElementById('editDeteriorationPredictions');
  const editPhotoNumberInput = document.getElementById('editPhotoNumberInput');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const currentYearSpan = document.getElementById('currentYear');

  // --- State Variables ---
  let currentSiteName = '';
  let currentBuilding = null; // Object: { name: string, nextId: number }
  let buildings = {}; // { buildingName: { nextId: number } }
  let deteriorationData = {}; // { buildingName: { recordId: { id, location, name, photo } } }
  let lastAddedRecord = null; // For continuous add
  let activePredictionList = null; // Reference to the currently active prediction list UL
  let currentPredictionItems = [];
  let selectedPredictionIndex = -1;

  // --- Firebase Configuration (Placeholder) ---
  // TODO: Initialize Firebase
  const firebaseConfig = {
      // Add your Firebase config object here
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_AUTH_DOMAIN",
      databaseURL: "YOUR_DATABASE_URL",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_STORAGE_BUCKET",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
  };
  // firebase.initializeApp(firebaseConfig);
  // const db = firebase.database();

  // --- Initialization ---
  function initializeApp() {
    console.log('Initializing app...');
    setupEventListeners();
    setInitialDate();
    setCurrentYear();
    // TODO: Load data from localStorage or Firebase
    // loadInitialData();
    updateBuildingSelectors(); // Initial population
    switchTab('info'); // Start on info tab
    console.log('App initialized.');
  }

  function setInitialDate() {
    const today = new Date().toISOString().split('T')[0];
    surveyDateInput.value = today;
  }

  function setCurrentYear() {
    currentYearSpan.textContent = new Date().getFullYear();
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Tab switching
    infoTabBtn.addEventListener('click', () => switchTab('info'));
    detailTabBtn.addEventListener('click', () => switchTab('detail'));

    // Basic Info
    siteNameInput.addEventListener('change', handleSiteNameChange);
    initialBuildingNameInput.addEventListener('change', handleInitialBuildingNameChange); // Handle initial building name if needed

    // Building Management
    addBuildingBtn.addEventListener('click', handleAddBuilding);
    buildingSelect.addEventListener('change', handleBuildingSelectChange);

    // Deterioration Form
    deteriorationForm.addEventListener('submit', handleAddDeterioration);
    continuousAddBtn.addEventListener('click', handleContinuousAdd);

    // Prediction Inputs (Focus, Input, Blur, Keydown)
    setupPredictionInput(locationInput, locationPredictionsUl, window.locations || []);
    setupPredictionInput(deteriorationNameInput, deteriorationPredictionsUl, window.deteriorations || []);
    setupPredictionInput(editLocationInput, editLocationPredictionsUl, window.locations || []);
    setupPredictionInput(editDeteriorationNameInput, editDeteriorationPredictionsUl, window.deteriorations || []);

    // Hide prediction lists when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.relative')) { // Clicked outside prediction input areas
            hidePredictionList(locationPredictionsUl);
            hidePredictionList(deteriorationPredictionsUl);
            hidePredictionList(editLocationPredictionsUl);
            hidePredictionList(editDeteriorationPredictionsUl);
        }
    });

    // Edit Modal
    cancelEditBtn.addEventListener('click', closeEditModal);
    editForm.addEventListener('submit', handleUpdateDeterioration);

    // CSV Export
    exportBuildingSelect.addEventListener('change', () => {
        exportCsvBtn.disabled = !exportBuildingSelect.value;
    });
    exportCsvBtn.addEventListener('click', handleExportCsv);

    // Table click delegation for Edit/Delete
    deteriorationTableBody.addEventListener('click', handleTableActionClick);

     console.log('Event listeners set up.');
  }

  // --- Tab Management ---
  function switchTab(tabName) {
    console.log(`Switching to tab: ${tabName}`);
    if (tabName === 'info') {
      infoTab.classList.remove('hidden');
      detailTab.classList.add('hidden');
      infoTabBtn.classList.add('bg-blue-600', 'text-white');
      infoTabBtn.classList.remove('bg-gray-200', 'text-gray-700');
      detailTabBtn.classList.add('bg-gray-200', 'text-gray-700');
      detailTabBtn.classList.remove('bg-blue-600', 'text-white');
    } else if (tabName === 'detail') {
      // Prevent switching to detail tab if no site name or no buildings
      if (!siteNameInput.value.trim()) {
        alert('先に現場名を入力してください。');
        return;
      }
      if (Object.keys(buildings).length === 0) {
         alert('先に「基本情報」タブで建物を追加してください。');
         return;
      }
      infoTab.classList.add('hidden');
      detailTab.classList.remove('hidden');
      detailTabBtn.classList.add('bg-blue-600', 'text-white');
      detailTabBtn.classList.remove('bg-gray-200', 'text-gray-700');
      infoTabBtn.classList.add('bg-gray-200', 'text-gray-700');
      infoTabBtn.classList.remove('bg-blue-600', 'text-white');
      // Ensure a building is selected if switching to detail tab
       if (!currentBuilding && buildingSelect.options.length > 0) {
            buildingSelect.selectedIndex = 0;
            handleBuildingSelectChange(); // Trigger change to load data
        }
    }
  }

  // --- Basic Info Handling ---
  function handleSiteNameChange(event) {
    const newSiteName = event.target.value.trim();
    if (newSiteName && newSiteName !== currentSiteName) {
        // TODO: Ask user for confirmation if data exists for the old site name
        console.log(`Site name changed to: ${newSiteName}`);
        currentSiteName = newSiteName;
        // Reset building and deterioration data when site changes
        buildings = {};
        deteriorationData = {};
        currentBuilding = null;
        lastAddedRecord = null;
        updateBuildingListUI();
        updateBuildingSelectors();
        clearDeteriorationForm();
        renderDeteriorationTable();
        // TODO: Load data for the new site from Firebase if exists
        // loadFirebaseDataForSite(newSiteName);
    }
  }

  function handleInitialBuildingNameChange(event) {
      // This might be used to set a default building if none are added yet,
      // but the primary mechanism is the 'Add Building' button.
      console.log('Initial building name input changed:', event.target.value);
  }

  // --- Building Management --- TODO: Firebase Integration
  function handleAddBuilding() {
    const newBuildingName = newBuildingNameInput.value.trim();
    if (!newBuildingName) {
      alert('建物名を入力してください。');
      return;
    }
    if (buildings[newBuildingName]) {
      alert('その建物名は既に追加されています。');
      return;
    }

    console.log(`Adding building: ${newBuildingName}`);
    buildings[newBuildingName] = { nextId: 1 }; // Initialize with nextId = 1
    newBuildingNameInput.value = ''; // Clear input

    updateBuildingListUI();
    updateBuildingSelectors();

    // Optionally select the newly added building
    buildingSelect.value = newBuildingName;
    handleBuildingSelectChange();

    // TODO: Save building to Firebase under currentSiteName
    // saveBuildingToFirebase(currentSiteName, newBuildingName);

    // Switch to detail tab automatically if it's the first building
    if (Object.keys(buildings).length === 1) {
        switchTab('detail');
    }
  }

  function updateBuildingListUI() {
      buildingListUl.innerHTML = ''; // Clear existing list
      const buildingNames = Object.keys(buildings);
      if (buildingNames.length === 0) {
          buildingListUl.innerHTML = '<li class="text-gray-500 text-sm">まだ建物は登録されていません</li>';
      } else {
          buildingNames.sort().forEach(name => {
              const li = document.createElement('li');
              li.textContent = name;
              li.className = 'text-sm py-1';
              // TODO: Add delete button for buildings?
              buildingListUl.appendChild(li);
          });
      }
  }


  function updateBuildingSelectors() {
      const buildingNames = Object.keys(buildings).sort();
      // Update main selector
      buildingSelect.innerHTML = '';
      if (buildingNames.length === 0) {
          buildingSelect.innerHTML = '<option value="">建物がありません</option>';
          activeBuildingNameSpan.textContent = '-';
          nextIdDisplay.textContent = '-';
      } else {
          buildingNames.forEach(name => {
              const option = document.createElement('option');
              option.value = name;
              option.textContent = name;
              buildingSelect.appendChild(option);
          });
          // Preserve selection if possible
          if (currentBuilding && buildings[currentBuilding.name]) {
              buildingSelect.value = currentBuilding.name;
          } else if (buildingNames.length > 0) {
              // Select the first building if none was selected or previous selection is gone
              buildingSelect.value = buildingNames[0];
              handleBuildingSelectChange(); // Trigger data load for the first building
          }
      }

       // Update export selector
      exportBuildingSelect.innerHTML = '<option value="">ダウンロードする建物を選択</option>';
      buildingNames.forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          exportBuildingSelect.appendChild(option);
      });
       exportCsvBtn.disabled = true; // Disable initially
  }

  function handleBuildingSelectChange() {
    const selectedBuildingName = buildingSelect.value;
    if (selectedBuildingName && buildings[selectedBuildingName]) {
        console.log(`Building selected: ${selectedBuildingName}`);
        currentBuilding = {
            name: selectedBuildingName,
            nextId: buildings[selectedBuildingName].nextId
        };
        activeBuildingNameSpan.textContent = selectedBuildingName;
        nextIdDisplay.textContent = currentBuilding.nextId;
        lastAddedRecord = null; // Reset last added for continuous add when switching buildings
        // Load and render data for the selected building
        renderDeteriorationTable();
        // TODO: Ensure data is loaded from Firebase if needed
    } else {
        console.log('No building selected or invalid selection.');
        currentBuilding = null;
        activeBuildingNameSpan.textContent = '-';
        nextIdDisplay.textContent = '-';
        renderDeteriorationTable(); // Clear table
    }
  }

  // --- Deterioration Data Handling --- TODO: Firebase Integration
  function handleAddDeterioration(event) {
    event.preventDefault();
    if (!currentBuilding) {
      alert('建物が選択されていません。');
      return;
    }

    const location = locationInput.value.trim();
    const name = deteriorationNameInput.value.trim();
    const photo = photoNumberInput.value.trim();

    if (!location || !name) {
      alert('場所と劣化名は必須です。');
      return;
    }

    const newRecord = {
      id: currentBuilding.nextId,
      location: location,
      name: name,
      photo: photo || '-', // Use '-' if photo number is empty
      timestamp: Date.now() // Add timestamp for potential sorting
    };

    console.log(`Adding record for ${currentBuilding.name}:`, newRecord);

    // Add to local data structure
    if (!deteriorationData[currentBuilding.name]) {
        deteriorationData[currentBuilding.name] = {};
    }
    const recordId = `record_${newRecord.id}`; // Use a unique ID for the object key
    deteriorationData[currentBuilding.name][recordId] = newRecord;

    // Update next ID for the current building
    currentBuilding.nextId++;
    buildings[currentBuilding.name].nextId = currentBuilding.nextId;
    nextIdDisplay.textContent = currentBuilding.nextId;

    lastAddedRecord = { ...newRecord }; // Store for continuous add

    // Clear form (except maybe photo number? TBD)
    locationInput.value = '';
    deteriorationNameInput.value = '';
    // photoNumberInput.value = ''; // Decide whether to clear photo number
    locationInput.focus(); // Focus back on location

    renderDeteriorationTable();

    // TODO: Save new record and updated nextId to Firebase
    // saveRecordToFirebase(currentSiteName, currentBuilding.name, recordId, newRecord);
    // updateBuildingNextIdInFirebase(currentSiteName, currentBuilding.name, currentBuilding.nextId);
  }

  function handleContinuousAdd() {
     if (!currentBuilding) {
        alert('建物が選択されていません。');
        return;
     }
     if (!lastAddedRecord) {
         alert('連続登録する元のデータがありません。まず一件登録してください。');
         return;
     }

     const photo = photoNumberInput.value.trim(); // Use current photo number input

      const newRecord = {
        id: currentBuilding.nextId,
        location: lastAddedRecord.location, // Use last record's location
        name: lastAddedRecord.name,       // Use last record's name
        photo: photo || '-',
        timestamp: Date.now()
    };

    console.log(`Continuously adding record for ${currentBuilding.name}:`, newRecord);

    if (!deteriorationData[currentBuilding.name]) {
        deteriorationData[currentBuilding.name] = {};
    }
    const recordId = `record_${newRecord.id}`;
    deteriorationData[currentBuilding.name][recordId] = newRecord;

    currentBuilding.nextId++;
    buildings[currentBuilding.name].nextId = currentBuilding.nextId;
    nextIdDisplay.textContent = currentBuilding.nextId;

    lastAddedRecord = { ...newRecord }; // Update last added record

    // Clear only photo number input for next potential continuous add
    photoNumberInput.value = '';
    photoNumberInput.focus(); // Focus on photo number for the next entry

    renderDeteriorationTable();

    // TODO: Save to Firebase
    // saveRecordToFirebase(currentSiteName, currentBuilding.name, recordId, newRecord);
    // updateBuildingNextIdInFirebase(currentSiteName, currentBuilding.name, currentBuilding.nextId);
  }


  function handleUpdateDeterioration(event) {
      event.preventDefault();
      const recordIdToUpdate = editRecordIdInput.value;
      if (!recordIdToUpdate || !currentBuilding || !deteriorationData[currentBuilding.name]?.[recordIdToUpdate]) {
          alert('編集対象のデータが見つかりません。');
          closeEditModal();
          return;
      }

      const updatedLocation = editLocationInput.value.trim();
      const updatedName = editDeteriorationNameInput.value.trim();
      const updatedPhoto = editPhotoNumberInput.value.trim();

      if (!updatedLocation || !updatedName) {
          alert('場所と劣化名は必須です。');
          return;
      }

      const updatedRecord = {
          ...deteriorationData[currentBuilding.name][recordIdToUpdate], // Keep original ID and timestamp
          location: updatedLocation,
          name: updatedName,
          photo: updatedPhoto || '-'
      };

      console.log(`Updating record ${recordIdToUpdate} for ${currentBuilding.name}:`, updatedRecord);

      deteriorationData[currentBuilding.name][recordIdToUpdate] = updatedRecord;

      renderDeteriorationTable();
      closeEditModal();

       // TODO: Update record in Firebase
      // updateRecordInFirebase(currentSiteName, currentBuilding.name, recordIdToUpdate, updatedRecord);
  }

  function handleDeleteDeterioration(recordIdToDelete) {
       if (!recordIdToDelete || !currentBuilding || !deteriorationData[currentBuilding.name]?.[recordIdToDelete]) {
          alert('削除対象のデータが見つかりません。');
          return;
      }

      const recordToDelete = deteriorationData[currentBuilding.name][recordIdToDelete];

      if (confirm(`以下のデータを削除しますか？
番号: ${recordToDelete.id}
場所: ${recordToDelete.location}
劣化名: ${recordToDelete.name}`)) {
          console.log(`Deleting record ${recordIdToDelete} for ${currentBuilding.name}`);
          delete deteriorationData[currentBuilding.name][recordIdToDelete];

          // Note: We are NOT decrementing the nextId here. IDs are generally not reused.
          // If re-numbering is needed upon deletion, that's a more complex feature.

          renderDeteriorationTable();

          // TODO: Delete record from Firebase
          // deleteRecordFromFirebase(currentSiteName, currentBuilding.name, recordIdToDelete);
      }
  }

  // --- UI Rendering ---
  function renderDeteriorationTable() {
    deteriorationTableBody.innerHTML = ''; // Clear existing table rows
    let count = 0;

    if (currentBuilding && deteriorationData[currentBuilding.name]) {
        const records = Object.values(deteriorationData[currentBuilding.name]);
        // Sort by ID (numeric) before rendering
        records.sort((a, b) => a.id - b.id);

        if (records.length > 0) {
             noDataRow.classList.add('hidden'); // Hide the 'no data' row
            records.forEach(record => {
                const tr = document.createElement('tr');
                tr.dataset.recordId = `record_${record.id}`; // Store the key used in the data object

                tr.innerHTML = `
                    <td class="px-3 py-2 text-sm text-gray-900">${record.id}</td>
                    <td class="px-3 py-2 text-sm text-gray-900 break-words">${escapeHtml(record.location)}</td>
                    <td class="px-3 py-2 text-sm text-gray-900 break-words">${escapeHtml(record.name)}</td>
                    <td class="px-3 py-2 text-sm text-gray-900">${escapeHtml(record.photo)}</td>
                    <td class="px-3 py-2 text-right text-sm font-medium space-x-1 whitespace-nowrap">
                        <button class="edit-btn text-blue-600 hover:text-blue-900" title="編集">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                             <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                           </svg>
                        </button>
                        <button class="delete-btn text-red-600 hover:text-red-900" title="削除">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                              <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                    </td>
                `;
                deteriorationTableBody.appendChild(tr);
                count++;
            });
        } else {
             noDataRow.classList.remove('hidden'); // Show 'no data'
        }
    } else {
         noDataRow.classList.remove('hidden'); // Show 'no data' if no building selected or no data
    }
    recordCountSpan.textContent = count;
    // Scroll to bottom of table container after adding/rendering
    deteriorationListContainer.scrollTop = deteriorationListContainer.scrollHeight;
  }

  function clearDeteriorationForm() {
      locationInput.value = '';
      deteriorationNameInput.value = '';
      photoNumberInput.value = '';
      nextIdDisplay.textContent = currentBuilding ? currentBuilding.nextId : '-';
      lastAddedRecord = null;
       hidePredictionList(locationPredictionsUl);
       hidePredictionList(deteriorationPredictionsUl);
  }

   function handleTableActionClick(event) {
        const button = event.target.closest('button');
        if (!button) return; // Click wasn't on a button

        const row = button.closest('tr');
        const recordId = row?.dataset.recordId;

        if (!recordId) return;

        if (button.classList.contains('edit-btn')) {
            openEditModal(recordId);
        } else if (button.classList.contains('delete-btn')) {
            handleDeleteDeterioration(recordId);
        }
    }

  // --- Edit Modal Logic ---
  function openEditModal(recordId) {
     if (!recordId || !currentBuilding || !deteriorationData[currentBuilding.name]?.[recordId]) {
          console.error('Cannot open edit modal: Invalid recordId or data not found.');
          return;
      }
      const record = deteriorationData[currentBuilding.name][recordId];
      console.log(`Opening edit modal for record ${recordId}:`, record);

      editRecordIdInput.value = recordId; // Store the record key
      editIdDisplay.textContent = record.id;
      editLocationInput.value = record.location;
      editDeteriorationNameInput.value = record.name;
      editPhotoNumberInput.value = (record.photo === '-') ? '' : record.photo;

      // Clear any previous prediction lists in the modal
      hidePredictionList(editLocationPredictionsUl);
      hidePredictionList(editDeteriorationPredictionsUl);

      editModal.classList.remove('hidden');
      editLocationInput.focus(); // Focus on the first editable field
  }

  function closeEditModal() {
      editModal.classList.add('hidden');
      // Clear modal form fields
      editRecordIdInput.value = '';
      editIdDisplay.textContent = '-';
      editForm.reset(); // Resets the form inputs
      hidePredictionList(editLocationPredictionsUl);
      hidePredictionList(editDeteriorationPredictionsUl);
       console.log('Edit modal closed.');
  }

  // --- Prediction Logic ---
  function setupPredictionInput(inputElement, predictionListElement, predictionData) {
    inputElement.addEventListener('focus', () => {
      console.log(`Focus on ${inputElement.id}`);
      // Optionally show predictions on focus, or wait for input
      // showPredictions(inputElement, predictionListElement, predictionData);
    });

    inputElement.addEventListener('input', () => {
        showPredictions(inputElement, predictionListElement, predictionData);
    });

    inputElement.addEventListener('blur', (e) => {
      // Don't hide immediately, allow clicking on prediction item
      // Use timeout to check if focus moved to prediction list
      setTimeout(() => {
          if (!predictionListElement.contains(document.activeElement)) {
                console.log(`Blur from ${inputElement.id}, hiding list`);
                hidePredictionList(predictionListElement);
          }
      }, 150); // Small delay
    });

     inputElement.addEventListener('keydown', (e) => {
            if (!predictionListElement.classList.contains('hidden') && currentPredictionItems.length > 0) {
                handlePredictionKeyDown(e, inputElement, predictionListElement);
            }
     });

    // Clicking on a prediction item
    predictionListElement.addEventListener('mousedown', (e) => {
        // Use mousedown to capture click before blur hides the list
        if (e.target.tagName === 'LI') {
            inputElement.value = e.target.textContent;
            hidePredictionList(predictionListElement);
            console.log(`Prediction selected: ${inputElement.value}`);
            // Optionally move focus to the next input
             if (inputElement === locationInput || inputElement === editLocationInput) {
                (inputElement === locationInput ? deteriorationNameInput : editDeteriorationNameInput).focus();
            } else if (inputElement === deteriorationNameInput || inputElement === editDeteriorationNameInput) {
                 (inputElement === deteriorationNameInput ? photoNumberInput : editPhotoNumberInput).focus();
            }
        }
    });
  }

 function showPredictions(inputElement, predictionListElement, predictionData) {
    const inputText = inputElement.value.trim();
    predictionListElement.innerHTML = ''; // Clear previous predictions
    selectedPredictionIndex = -1; // Reset selection
    currentPredictionItems = [];

    // Basic filtering (case-insensitive, starts-with for first 2 chars if length >= 2)
    // More sophisticated filtering (like the spec's 2-char prefix) can be added
    const filteredPredictions = predictionData.filter(item => {
         const itemLower = item.toLowerCase();
         const inputLower = inputText.toLowerCase();
         if (inputText.length >= 2) {
             // Specification: Match first 2 chars for prediction trigger
             // This simple implementation filters based on the full input, adjust if needed.
              const inputPrefix = inputLower.substring(0, 2);
              // Example check: Does the item start with the 2-char prefix?
              // You might need a more complex matching logic based on spec (e.g., 「がひ」 -> 「外壁ひび割れ」)
              // For now, simple includes matching:
              return itemLower.includes(inputLower);
         } else if (inputText.length > 0) {
             return itemLower.includes(inputLower);
         } else {
             return false; // Don't show if input is empty
         }
    }).slice(0, 5); // Limit to 5 predictions

    if (filteredPredictions.length > 0 && inputText.length > 0) {
        currentPredictionItems = filteredPredictions;
        filteredPredictions.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = item;
            li.className = 'prediction-item';
            li.dataset.index = index;
            predictionListElement.appendChild(li);
        });
        predictionListElement.classList.remove('hidden');
        activePredictionList = predictionListElement;
        console.log(`Showing ${filteredPredictions.length} predictions for '${inputText}' in ${inputElement.id}`);
    } else {
        hidePredictionList(predictionListElement);
    }
}


  function hidePredictionList(predictionListElement) {
      if (predictionListElement && !predictionListElement.classList.contains('hidden')) {
        predictionListElement.classList.add('hidden');
        predictionListElement.innerHTML = '';
        if (activePredictionList === predictionListElement) {
            activePredictionList = null;
        }
        selectedPredictionIndex = -1;
        currentPredictionItems = [];
         console.log(`Hiding prediction list ${predictionListElement.id}`);
      }
  }

 function handlePredictionKeyDown(e, inputElement, predictionListElement) {
    const items = predictionListElement.querySelectorAll('li');
    if (items.length === 0) return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedPredictionIndex = (selectedPredictionIndex + 1) % items.length;
            updatePredictionSelection(items);
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedPredictionIndex = (selectedPredictionIndex - 1 + items.length) % items.length;
            updatePredictionSelection(items);
            break;
        case 'Enter':
        case 'Tab': // Allow Tab to select as well
             if (selectedPredictionIndex > -1) {
                 e.preventDefault();
                 inputElement.value = items[selectedPredictionIndex].textContent;
                 hidePredictionList(predictionListElement);
                  // Move focus after selection
                  if (inputElement === locationInput || inputElement === editLocationInput) {
                    (inputElement === locationInput ? deteriorationNameInput : editDeteriorationNameInput).focus();
                  } else if (inputElement === deteriorationNameInput || inputElement === editDeteriorationNameInput) {
                    (inputElement === deteriorationNameInput ? photoNumberInput : editPhotoNumberInput).focus();
                 }
             } else {
                  // If Enter/Tab is pressed without a selection, just hide the list
                  hidePredictionList(predictionListElement);
                  // Don't prevent default for Tab if no selection, allow normal tab behavior
                   if (e.key === 'Enter') e.preventDefault();
             }
            break;
        case 'Escape':
            e.preventDefault();
            hidePredictionList(predictionListElement);
            break;
    }
}


 function updatePredictionSelection(items) {
    items.forEach((item, index) => {
        if (index === selectedPredictionIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}


  // --- CSV Export ---
  function handleExportCsv() {
    const selectedBuilding = exportBuildingSelect.value;
    if (!selectedBuilding) {
        alert('ダウンロードする建物を選択してください。');
        return;
    }
    if (!currentSiteName) {
        alert('現場名が設定されていません。');
        return;
    }
    if (!deteriorationData[selectedBuilding] || Object.keys(deteriorationData[selectedBuilding]).length === 0) {
        alert(`${selectedBuilding} には登録済みの劣化情報がありません。`);
        return;
    }

    console.log(`Exporting CSV for site: ${currentSiteName}, building: ${selectedBuilding}`);

    const recordsToExport = Object.values(deteriorationData[selectedBuilding]).sort((a, b) => a.id - b.id);

    // CSV Header
    const header = ['番号', '場所', '劣化名', '写真番号'];
    // CSV Rows
    const rows = recordsToExport.map(record => [
        record.id,
        record.location,
        record.name,
        record.photo
    ]);

    // Combine header and rows
    const csvContent = [header, ...rows]
        .map(row => row.map(escapeCsvCell).join(','))
        .join('\r\n');

    // Create Blob and Download Link
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    // Create filename: 現場名_建物名_日付.csv
    const dateStr = surveyDateInput.value.replace(/-/g, '') || '日付未設定';
    const fileName = `${currentSiteName}_${selectedBuilding}_${dateStr}.csv`;
    link.setAttribute('download', fileName);

    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`CSV downloaded as ${fileName}`);
  }

  function escapeCsvCell(cellData) {
    const stringData = String(cellData === null || cellData === undefined ? '' : cellData);
    // Escape quotes and handle commas/newlines
    if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n') || stringData.includes('\r')) {
        return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  }

  // --- Utility Functions ---
  function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

  // --- Load/Save Logic (Placeholders) ---
  /*
  function loadInitialData() {
      // Try loading from LocalStorage first?
      // Then potentially load from Firebase
      console.log('Loading initial data (placeholder)...');
      // Example: Load buildings and data for the last used site/building
  }

  function saveBuildingToFirebase(site, building) {
      console.log(`Saving building ${building} for site ${site} to Firebase (placeholder)`);
      // db.ref(`sites/${site}/buildings/${building}`).set({ nextId: 1 });
  }

  function saveRecordToFirebase(site, building, recordId, recordData) {
      console.log(`Saving record ${recordId} for ${building} at site ${site} to Firebase (placeholder)`);
      // db.ref(`sites/${site}/data/${building}/${recordId}`).set(recordData);
  }

   function updateBuildingNextIdInFirebase(site, building, nextId) {
      console.log(`Updating nextId for ${building} at site ${site} to ${nextId} (placeholder)`);
      // db.ref(`sites/${site}/buildings/${building}/nextId`).set(nextId);
   }

   function updateRecordInFirebase(site, building, recordId, recordData) {
       console.log(`Updating record ${recordId} for ${building} at site ${site} in Firebase (placeholder)`);
       // db.ref(`sites/${site}/data/${building}/${recordId}`).update(recordData);
   }

   function deleteRecordFromFirebase(site, building, recordId) {
        console.log(`Deleting record ${recordId} for ${building} at site ${site} from Firebase (placeholder)`);
       // db.ref(`sites/${site}/data/${building}/${recordId}`).remove();
   }

   function loadFirebaseDataForSite(site) {
        console.log(`Loading data for site ${site} from Firebase (placeholder)`);
        // Listener for buildings
        // db.ref(`sites/${site}/buildings`).on('value', (snapshot) => {
        //     buildings = snapshot.val() || {};
        //     updateBuildingListUI();
        //     updateBuildingSelectors();
        //     console.log('Buildings loaded from Firebase:', buildings);
        // });

         // Listener for deterioration data (might need refining for multiple buildings)
         // This simplistic approach loads ALL data for the site. Consider loading per building.
         // db.ref(`sites/${site}/data`).on('value', (snapshot) => {
         //    deteriorationData = snapshot.val() || {};
         //    renderDeteriorationTable(); // Re-render the current building's table
         //    console.log('Deterioration data loaded from Firebase:', deteriorationData);
         // });
   }
   */

  // --- Start the application ---
  initializeApp();
}); 