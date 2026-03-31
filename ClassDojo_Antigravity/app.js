document.addEventListener('DOMContentLoaded', () => {

    // --- State Management ---
    let students = JSON.parse(localStorage.getItem('cdData_students')) || [];
    let groups = JSON.parse(localStorage.getItem('cdData_groups')) || [];
    let logs = JSON.parse(localStorage.getItem('cdData_logs')) || [];
    let pointItems = JSON.parse(localStorage.getItem('cdData_items')) || {
        positive: [
            { id: 1, label: '幫助他人', value: 1, icon: '🤝', ignoreTotal: false },
            { id: 2, label: '專心上課', value: 1, icon: '🎯', ignoreTotal: false },
            { id: 3, label: '踴躍參與', value: 1, icon: '🙋', ignoreTotal: false },
            { id: 4, label: '努力學習', value: 1, icon: '💪', ignoreTotal: false },
        ],
        needsWork: [
            { id: 5, label: '不專心', value: -1, icon: '📵', ignoreTotal: false },
            { id: 6, label: '上課講話', value: -1, icon: '🗣️', ignoreTotal: false },
            { id: 7, label: '未帶學用品', value: -1, icon: '🤷', ignoreTotal: false },
        ]
    };
    
    let settings = JSON.parse(localStorage.getItem('cdData_settings')) || {
        fontSize: 'medium',
        columns: 5,
        enableSound: true
    };

    // View States
    let currentView = 'students'; // 'students' or 'groups'
    let isMultiSelectMode = false;
    let selectedStudentIds = new Set();
    
    // Context for Award Modal
    let awardContextIds = []; // Array of student IDs to receive points
    let currentProfileId = null; // Used for Profile History / Editing
    let editingGroupId = null; // Used when editing a group

    // Undo State
    let lastActionLogIds = [];
    let undoTimeout = null;

    let currentSort = 'score'; // 'score' or 'name'

    const saveData = () => {
        localStorage.setItem('cdData_students', JSON.stringify(students));
        localStorage.setItem('cdData_groups', JSON.stringify(groups));
        localStorage.setItem('cdData_logs', JSON.stringify(logs));
        localStorage.setItem('cdData_items', JSON.stringify(pointItems));
        localStorage.setItem('cdData_settings', JSON.stringify(settings));
    };


    // --- Audio Feedback (Web Audio API) ---
    let audioCtx = null;
    const playSound = (type) => {
        if (!settings.enableSound) return;
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'positive') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
        } else if (type === 'negative') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.3);
            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
        }
    };


    // --- DOM Elements ---
    const studentGrid = document.getElementById('studentGrid');
    const groupGrid = document.getElementById('groupGrid');
    
    // View Tabs
    const viewTabBtns = document.querySelectorAll('.view-tab-btn');

    // Multi-Select
    const toggleMultiSelectBtn = document.getElementById('toggleMultiSelectBtn');
    const multiSelectBar = document.getElementById('multiSelectBar');
    const multiSelectCount = document.getElementById('multiSelectCount');
    const multiAwardBtn = document.getElementById('multiAwardBtn');
    const cancelMultiBtn = document.getElementById('cancelMultiBtn');

    // Undo Toast
    const undoToast = document.getElementById('undoToast');
    const undoActionBtn = document.getElementById('undoActionBtn');
    const undoMessage = document.getElementById('undoMessage');

    // Modals
    const addStudentModal = document.getElementById('addStudentModal');
    const editStudentModal = document.getElementById('editStudentModal');
    const manageGroupModal = document.getElementById('manageGroupModal');
    const studentProfileModal = document.getElementById('studentProfileModal');
    const settingsModal = document.getElementById('settingsModal');
    const reportsModal = document.getElementById('reportsModal');

    // Profile Modal elements
    const currentProfileName = document.getElementById('currentProfileName');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const profileHistoryTabBtn = document.getElementById('profileHistoryTabBtn');
    const positiveItemsGrid = document.getElementById('positiveItems');
    const needsWorkItemsGrid = document.getElementById('needsWorkItems');
    const studentHistoryList = document.getElementById('studentHistoryList');

    // Display Settings
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const gridColsRange = document.getElementById('gridColsRange');
    const gridColsLabel = document.getElementById('gridColsLabel');

    // Create Group Elements
    const groupNameInput = document.getElementById('groupNameInput');
    const groupStudentSelectionGrid = document.getElementById('groupStudentSelectionGrid');


    // --- Helper Functions ---
    const generateAvatar = (name, style = 'fun-emoji') => {
        return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
    };

    const applySettings = () => {
        document.body.dataset.fontSize = settings.fontSize;
        document.documentElement.style.setProperty('--grid-cols', settings.columns);
        
        // Update UI controls to match
        fontSizeSelect.value = settings.fontSize;
        gridColsRange.value = settings.columns;
        gridColsLabel.textContent = settings.columns;
        const soundSettingCbx = document.getElementById('enableSoundSetting');
        if(soundSettingCbx) soundSettingCbx.checked = settings.enableSound;
    };


    // --- Core Rendering Functions ---

    const renderStudents = () => {
        studentGrid.innerHTML = '';
        
        const sortedStudents = [...students].sort((a,b) => a.name.localeCompare(b.name, 'zh-TW'));
        sortedStudents.forEach(student => {
            const card = document.createElement('div');
            card.className = 'student-card';
            if (isMultiSelectMode && selectedStudentIds.has(student.id)) {
                card.classList.add('selected');
            }

            card.onclick = () => {
                if (isMultiSelectMode) {
                    toggleStudentSelection(student.id);
                } else {
                    openAwardModal([student.id], student.name, student.id);
                }
            };

            let absoluteTotal = 0;
            logs.forEach(log => {
                if (log.studentId === student.id) absoluteTotal += log.points;
            });

            let pointClass = 'student-points';
            if (absoluteTotal > 0) pointClass += ' positive-total';
            if (absoluteTotal < 0) pointClass += ' negative-total';

            const avatarUrl = student.avatarUrl || generateAvatar(student.name, student.avatarStyle || 'fun-emoji');

            card.innerHTML = `
                ${isMultiSelectMode ? `<div class="selection-check">${selectedStudentIds.has(student.id) ? '✓' : ''}</div>` : ''}
                <img src="${avatarUrl}" class="student-avatar" alt="${student.name}">
                <div class="student-name">${student.name}</div>
                <div class="${pointClass}">${absoluteTotal}</div>
            `;
            studentGrid.appendChild(card);
        });
    };

    const renderGroups = () => {
        groupGrid.innerHTML = '';
        
        // Add "Create Group" card
        const createCard = document.createElement('div');
        createCard.className = 'student-card create-group-card';
        createCard.onclick = () => openManageGroupModal();
        createCard.innerHTML = `
            <div class="student-avatar" style="background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size: 2rem; color: #64748b;">+</div>
            <div class="student-name">新增群組</div>
        `;
        groupGrid.appendChild(createCard);

        groups.forEach(group => {
            const card = document.createElement('div');
            card.className = 'student-card group-card';
            
            // Edit button overlay
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-group-inline-btn';
            editBtn.innerHTML = '⚙️';
            editBtn.onclick = (e) => { e.stopPropagation(); openManageGroupModal(group.id); };
            card.appendChild(editBtn);

            card.onclick = () => {
                if (group.studentIds.length === 0) return alert('群組內沒有學生，請先編輯群組加入學生。');
                openAwardModal(group.studentIds, `群組：${group.name}`, null);
            };

            let groupTotal = 0;
            group.studentIds.forEach(sid => {
                logs.forEach(log => {
                    if (log.studentId === sid) groupTotal += log.points;
                });
            });

            const pointsStr = groupTotal > 0 ? `+${groupTotal}` : groupTotal;
            let pointClass = 'student-points';
            if (groupTotal > 0) pointClass += ' positive-total';
            if (groupTotal < 0) pointClass += ' negative-total';
            
            const content = document.createElement('div');
            content.style.display = 'flex'; content.style.flexDirection = 'column'; content.style.alignItems = 'center'; content.style.pointerEvents = 'none';
            content.innerHTML = `
                <div class="group-icon">👥</div>
                <div class="student-name">${group.name}</div>
                <div class="group-member-count">${group.studentIds.length} 位成員</div>
                <div class="${pointClass}" style="margin-top: 5px">${pointsStr}</div>
            `;
            card.appendChild(content);

            groupGrid.appendChild(card);
        });
    };

    const toggleStudentSelection = (id) => {
        if (selectedStudentIds.has(id)) selectedStudentIds.delete(id);
        else selectedStudentIds.add(id);
        
        multiSelectCount.textContent = `已選擇 ${selectedStudentIds.size} 位學生`;
        renderStudents();
    };

    const openAwardModal = (idsArray, titleName, profileIdContext) => {
        awardContextIds = idsArray;
        currentProfileId = profileIdContext; // Can be null if opening for group or multi-select

        currentProfileName.textContent = titleName;
        
        // Setup permissions
        if (currentProfileId) {
            editProfileBtn.classList.remove('hidden');
            profileHistoryTabBtn.classList.remove('hidden');
        } else {
            editProfileBtn.classList.add('hidden');
            profileHistoryTabBtn.classList.add('hidden');
            // Force return to award tab if history was open
            switchProfileTab('award');
        }

        switchProfileTab('award');
        switchAwardTab('positive');
        openModal(studentProfileModal);
    };

    const awardPoints = (itemId, label, points) => {
        if(awardContextIds.length === 0) return;

        let newLogIds = [];

        awardContextIds.forEach(studentId => {
            const studentIndex = students.findIndex(s => s.id === studentId);
            if(studentIndex > -1) {
                const logId = Date.now() + Math.random();
                logs.push({
                    id: logId,
                    studentId: studentId,
                    itemId: itemId,
                    label: label,
                    points: points,
                    timestamp: Date.now()
                });
                newLogIds.push(logId);
            }
        });

        saveData();
        playSound(points > 0 ? 'positive' : 'negative');
        createPointAnimation(points, awardContextIds.length);
        
        renderStudents();
        if(currentView === 'groups') renderGroups();
        if(currentProfileId && !studentProfileModal.classList.contains('hidden')) {
            renderHistory();
        }

        // Setup Undo
        lastActionLogIds = newLogIds;
        showUndoToast(points > 0 ? `+${points} 給予 ${awardContextIds.length} 位學生` : `${points} 扣除 ${awardContextIds.length} 位學生`);
        
        // Auto close or clear select
        setTimeout(() => {
            if(document.querySelector('.main-tabs .tab-btn.active').dataset.profileTab === 'award') {
                closeModal(studentProfileModal);
                if (isMultiSelectMode) {
                    toggleMultiSelectMode(); // Exit multi-select after awarding
                }
            }
        }, 500);
    };


    // --- Multi-select Logic ---
    const toggleMultiSelectMode = () => {
        isMultiSelectMode = !isMultiSelectMode;
        selectedStudentIds.clear();
        multiSelectCount.textContent = `已選擇 0 位學生`;
        
        if (isMultiSelectMode) {
            multiSelectBar.classList.remove('hidden');
            toggleMultiSelectBtn.classList.add('active-mode');
            toggleMultiSelectBtn.innerHTML = '❌ 退出選擇';
            // Force View to Students
            switchMainView('students');
        } else {
            multiSelectBar.classList.add('hidden');
            toggleMultiSelectBtn.classList.remove('active-mode');
            toggleMultiSelectBtn.innerHTML = '☑️ 多選模式';
        }
        renderStudents();
    };


    // --- View Navigation ---
    const switchMainView = (viewName) => {
        currentView = viewName;
        viewTabBtns.forEach(btn => {
            if (btn.dataset.view === viewName) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (viewName === 'students') {
            studentGrid.classList.remove('hidden');
            groupGrid.classList.add('hidden');
            renderStudents();
        } else {
            studentGrid.classList.add('hidden');
            groupGrid.classList.remove('hidden');
            renderGroups();
            if(isMultiSelectMode) toggleMultiSelectMode(); // disable multi select if in group modes
        }
    };


    // --- Undo Logic ---
    const showUndoToast = (msg) => {
        undoMessage.textContent = msg;
        undoToast.classList.remove('hidden');
        
        if(undoTimeout) clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            undoToast.classList.add('hidden');
            lastActionLogIds = [];
        }, 6000);
    };

    undoActionBtn.onclick = () => {
        if(lastActionLogIds.length > 0) {
            logs = logs.filter(log => !lastActionLogIds.includes(log.id));
            saveData();
            lastActionLogIds = [];
            
            undoToast.classList.add('hidden');
            if(undoTimeout) clearTimeout(undoTimeout);
            
            renderStudents();
            if(currentView === 'groups') renderGroups();
            if(currentProfileId && !studentProfileModal.classList.contains('hidden')) renderHistory();
            
            // Make an undo sound
            playSound('negative'); // Just a feedback sound
        }
    };


    // --- Group Management Modal ---
    const openManageGroupModal = (groupId = null) => {
        editingGroupId = groupId;
        const groupModalTitle = document.getElementById('groupModalTitle');
        const deleteGroupBtn = document.getElementById('deleteGroupBtn');

        groupStudentSelectionGrid.innerHTML = '';
        
        let existingStudentIds = [];
        if (groupId) {
            const group = groups.find(g => g.id === groupId);
            groupModalTitle.textContent = '編輯群組';
            groupNameInput.value = group.name;
            existingStudentIds = group.studentIds || [];
            deleteGroupBtn.classList.remove('hidden');
        } else {
            groupModalTitle.textContent = '新增群組';
            groupNameInput.value = '';
            deleteGroupBtn.classList.add('hidden');
        }

        students.forEach(student => {
            const label = document.createElement('label');
            label.className = 'group-student-select-item';
            const isChecked = existingStudentIds.includes(student.id);
            
            label.innerHTML = `
                <input type="checkbox" value="${student.id}" ${isChecked ? 'checked' : ''}>
                <img src="${student.avatarUrl || generateAvatar(student.name, student.avatarStyle)}" class="small-avatar">
                <span>${student.name}</span>
            `;
            groupStudentSelectionGrid.appendChild(label);
        });

        openModal(manageGroupModal);
    };

    document.getElementById('saveGroupBtn').onclick = () => {
        const name = groupNameInput.value.trim();
        if(!name) return alert('請輸入群組名稱');

        const checkboxes = groupStudentSelectionGrid.querySelectorAll('input[type="checkbox"]');
        const selectedIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));

        if(selectedIds.length === 0) return alert('請至少選擇一位學生');

        if (editingGroupId) {
            const group = groups.find(g => g.id === editingGroupId);
            group.name = name;
            group.studentIds = selectedIds;
        } else {
            groups.push({
                id: Date.now(),
                name: name,
                studentIds: selectedIds
            });
        }

        saveData();
        renderGroups();
        closeModal(manageGroupModal);
    };

    document.getElementById('deleteGroupBtn').onclick = () => {
        if(confirm('確定要刪除這個群組嗎？（不影響學生個人紀錄）')) {
            groups = groups.filter(g => g.id !== editingGroupId);
            saveData();
            renderGroups();
            closeModal(manageGroupModal);
        }
    };


    // --- Student Editing Logic ---
    const _editNameInput = document.getElementById('editStudentName');
    const _editStyleSelect = document.getElementById('editStudentAvatarStyle');
    const _editAvatarPreview = document.getElementById('editStudentAvatarPreview');
    let _tempAvatarSeed = '';

    editProfileBtn.onclick = () => {
        if(!currentProfileId) return;
        const student = students.find(s => s.id === currentProfileId);
        if(!student) return;

        _editNameInput.value = student.name;
        const currentStyle = student.avatarStyle || 'fun-emoji';
        _editStyleSelect.value = currentStyle;
        _tempAvatarSeed = student.avatarSeed || student.name;
        
        updateEditAvatarPreview();
        
        closeModal(studentProfileModal);
        openModal(editStudentModal);
    };

    const updateEditAvatarPreview = () => {
        const style = _editStyleSelect.value;
        const url = generateAvatar(_tempAvatarSeed, style);
        _editAvatarPreview.src = url;
    };

    _editStyleSelect.onchange = updateEditAvatarPreview;
    
    document.getElementById('randomizeAvatarBtn').onclick = () => {
        _tempAvatarSeed = Math.random().toString(36).substring(7);
        updateEditAvatarPreview();
    };

    document.getElementById('saveEditStudentBtn').onclick = () => {
        const newName = _editNameInput.value.trim();
        if(!newName) return;

        const student = students.find(s => s.id === currentProfileId);
        student.name = newName;
        student.avatarStyle = _editStyleSelect.value;
        student.avatarSeed = _tempAvatarSeed;
        student.avatarUrl = generateAvatar(_tempAvatarSeed, student.avatarStyle); // precompute it

        saveData();
        renderStudents();
        renderReports();
        closeModal(editStudentModal);
    };

    document.getElementById('deleteStudentBtn').onclick = () => {
        if(confirm('警告：這將會永久刪除此學生及其所有的點數紀錄！確定嗎？')) {
            students = students.filter(s => s.id !== currentProfileId);
            logs = logs.filter(l => l.studentId !== currentProfileId);
            groups.forEach(g => {
                g.studentIds = g.studentIds.filter(id => id !== currentProfileId);
            });
            saveData();
            renderStudents();
            closeModal(editStudentModal);
        }
    };


    // --- Settings & Advanced Controls ---
    const enableSoundSetting = document.getElementById('enableSoundSetting');
    if (enableSoundSetting) {
        enableSoundSetting.onchange = (e) => {
            settings.enableSound = e.target.checked;
            saveData();
        };
    }

    fontSizeSelect.onchange = (e) => {
        settings.fontSize = e.target.value;
        applySettings();
        saveData();
    };

    gridColsRange.oninput = (e) => {
        const val = e.target.value;
        settings.columns = parseInt(val);
        gridColsLabel.textContent = val;
        applySettings();
        saveData();
    };

    document.getElementById('resetAllPointsBtn').onclick = () => {
        if(confirm('⚠️ 極限警告 ⚠️\\n確定要將【所有學生】的點數強制歸零嗎？這相當於一個學期的重新開始。\\n(系統會自動寫入負向調整分數，讓目前的總分歸零)')) {
            const sure = confirm('請再次確認！這個動作不可復原！');
            if(sure) {
                const now = Date.now();
                students.forEach(student => {
                    let absoluteTotal = 0;
                    logs.forEach(log => {
                        if (log.studentId === student.id) absoluteTotal += log.points;
                    });
                    
                    if (absoluteTotal !== 0) {
                        logs.push({
                            id: now + student.id,
                            studentId: student.id,
                            itemId: null,
                            label: '學期重置歸零',
                            points: -absoluteTotal,
                            timestamp: now,
                            ignoreTotal: false
                        });
                    }
                });
                saveData();
                renderStudents();
                if(currentView === 'groups') renderGroups();
                alert('所有學生點數已歸零！');
                closeModal(settingsModal);
            }
        }
    };


    // All that rest remains the same (Reports, Items, Initialization)
    // --- Reports Logic --- (Simplified for brevity, refer to old one)
    const reportsList = document.getElementById('reportsList');
    const timeRangeFilter = document.getElementById('timeRangeFilter');
    const customDateContainer = document.getElementById('customDateContainer');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');

    const getReportsTimeRange = () => {
        const val = timeRangeFilter.value;
        if (val === 'all') return null;

        const start = new Date();
        const end = new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        if (val === 'today') {
            return { start: start.getTime(), end: end.getTime() };
        } else if (val === 'week') {
            const day = start.getDay() || 7;
            start.setDate(start.getDate() - day + 1);
            end.setDate(start.getDate() + 6);
            return { start: start.getTime(), end: end.getTime() };
        } else if (val === 'month') {
            start.setDate(1);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
            return { start: start.getTime(), end: end.getTime() };
        } else if (val === 'custom') {
            if (startDateFilter.value && endDateFilter.value) {
                const s = new Date(startDateFilter.value);
                const e = new Date(endDateFilter.value);
                s.setHours(0, 0, 0, 0);
                e.setHours(23, 59, 59, 999);
                return { start: s.getTime(), end: e.getTime() };
            }
        }
        return null;
    };

    const isItemIgnored = (itemId) => {
        if (!itemId) return false;
        const allItems = [...pointItems.positive, ...pointItems.needsWork];
        const itemDef = allItems.find(i => i.id === itemId);
        return itemDef ? itemDef.ignoreTotal : false;
    };

    window.renderReports = () => {
        reportsList.innerHTML = '';
        const range = getReportsTimeRange();

        let reportData = students.map(student => {
            let total = 0;
            logs.forEach(log => {
                if (log.studentId === student.id) {
                    if (range && (log.timestamp < range.start || log.timestamp > range.end)) return;
                    if (!isItemIgnored(log.itemId)) {
                        total += log.points;
                    }
                }
            });
            return { ...student, calculatedPoints: total };
        });

        if (currentSort === 'name') reportData.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
        else reportData.sort((a, b) => b.calculatedPoints - a.calculatedPoints);

        if (reportData.length === 0) {
            reportsList.innerHTML = '<li class="empty-state">沒有學生資料</li>';
        } else {
            reportData.forEach((data, index) => {
                const li = document.createElement('li');
                li.className = 'report-item';
                li.style.cursor = 'pointer';
                
                if (currentReportFilterStudentId === data.id) {
                    li.style.border = '2px solid var(--primary-color)';
                    li.style.background = '#eff6ff';
                }

                li.onclick = () => {
                    currentReportFilterStudentId = data.id;
                    currentReportActivityPage = 1;
                    document.getElementById('reportActivityTitle').textContent = data.name + ' 的紀錄';
                    document.getElementById('resetReportFilterBtn').classList.remove('hidden');
                    window.renderReports();
                };
                
                let valClass = '';
                if (data.calculatedPoints > 0) valClass = 'positive-val';
                if (data.calculatedPoints < 0) valClass = 'negative-val';

                li.innerHTML = `
                    <div class="report-item-left">
                        <span class="report-rank">#${index + 1}</span>
                        <img src="${data.avatarUrl || generateAvatar(data.name, data.avatarStyle)}" class="report-avatar">
                        <span class="report-name">${data.name}</span>
                    </div>
                    <div class="report-item-right ${valClass}">
                        ${data.calculatedPoints > 0 ? '+' + data.calculatedPoints : data.calculatedPoints}
                    </div>
                `;
                reportsList.appendChild(li);
            });
        }
        
        renderReportActivity();
    };

    let currentReportActivityPage = 1;
    let currentReportFilterStudentId = null;
    const itemsPerPage = 20;

    const renderReportActivity = () => {
        const range = getReportsTimeRange();
        const activityList = document.getElementById('reportActivityList');
        activityList.innerHTML = '';

        let filteredLogs = logs.filter(log => {
            if (range && (log.timestamp < range.start || log.timestamp > range.end)) return false;
            if (currentReportFilterStudentId && log.studentId !== currentReportFilterStudentId) return false;
            return true;
        });

        filteredLogs.sort((a,b) => b.timestamp - a.timestamp);

        const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
        if (currentReportActivityPage > totalPages) currentReportActivityPage = totalPages;

        document.getElementById('reportPageInfo').textContent = `頁數 ${currentReportActivityPage} / ${totalPages}`;
        document.getElementById('reportPrevPageBtn').disabled = currentReportActivityPage === 1;
        document.getElementById('reportNextPageBtn').disabled = currentReportActivityPage === totalPages;

        const startIdx = (currentReportActivityPage - 1) * itemsPerPage;
        const pageLogs = filteredLogs.slice(startIdx, startIdx + itemsPerPage);

        if (pageLogs.length === 0) {
            activityList.innerHTML = '<li class="empty-state">沒有找到紀錄</li>';
            return;
        }

        pageLogs.forEach(log => {
            const dt = new Date(log.timestamp);
            const student = students.find(s => s.id === log.studentId);
            const isIgnored = isItemIgnored(log.itemId);
            const valClass = log.points > 0 ? 'positive-val' : 'negative-val';
            
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="history-item-left">
                    <span class="history-date">${dt.toLocaleString('zh-TW', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })} • ${student ? student.name : '未知'}</span>
                    <span class="history-label">${log.label} ${isIgnored ? '<span class="ignore-badge">不計入報表</span>' : ''}</span>
                </div>
                <div class="history-item-right ${valClass}">
                    ${log.points > 0 ? '+' + log.points : log.points}
                </div>
            `;
            activityList.appendChild(li);
        });
    };

    document.getElementById('reportPrevPageBtn').onclick = () => {
        if(currentReportActivityPage > 1) { currentReportActivityPage--; renderReportActivity(); }
    };
    document.getElementById('reportNextPageBtn').onclick = () => {
        currentReportActivityPage++; renderReportActivity();
    };

    document.getElementById('resetReportFilterBtn').onclick = () => {
        currentReportFilterStudentId = null;
        currentReportActivityPage = 1;
        document.getElementById('reportActivityTitle').textContent = '全班最近紀錄';
        document.getElementById('resetReportFilterBtn').classList.add('hidden');
        window.renderReports();
    };

    const onReportsFilterChange = () => {
        if (timeRangeFilter.value === 'custom') customDateContainer.classList.remove('hidden');
        else customDateContainer.classList.add('hidden');
        window.renderReports();
    };
    timeRangeFilter.addEventListener('change', onReportsFilterChange);
    startDateFilter.addEventListener('change', onReportsFilterChange);
    endDateFilter.addEventListener('change', onReportsFilterChange);

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            window.renderReports();
        };
    });


    // --- Other Profile History ---
    const renderHistory = () => {
        if (!currentProfileId) return;
        studentHistoryList.innerHTML = '';
        const studentLogs = logs.filter(log => log.studentId === currentProfileId)
                                .sort((a, b) => b.timestamp - a.timestamp);

        if (studentLogs.length === 0) {
            studentHistoryList.innerHTML = '<li class="empty-state">此學生沒有任何紀錄</li>';
        } else {
            studentLogs.forEach(log => {
                const li = document.createElement('li');
                const dt = new Date(log.timestamp);
                const isIgnored = isItemIgnored(log.itemId);
                const valClass = log.points > 0 ? 'positive-val' : 'negative-val';
                
                li.innerHTML = `
                    <div class="history-item-left">
                        <span class="history-date">${dt.toLocaleString('zh-TW', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                        <span class="history-label">${log.label} ${isIgnored ? '<span class="ignore-badge" title="未計入報表總分">不計入報表</span>' : ''}</span>
                    </div>
                    <div class="history-item-right ${valClass}">
                        ${log.points > 0 ? '+' + log.points : log.points}
                        <button class="delete-log-btn" onclick="deleteLog(${log.id})">🗑️</button>
                    </div>
                `;
                studentHistoryList.appendChild(li);
            });
        }
    };


    // --- Render Items ---
    const renderPointItems = () => {
        positiveItemsGrid.innerHTML = '';
        pointItems.positive.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'point-item-btn positive';
            btn.innerHTML = `
                <div class="point-icon">${item.icon}</div>
                <div class="point-label">${item.label}</div>
                <div class="point-value">+${item.value}</div>
                ${item.ignoreTotal ? '<div class="ignore-badge" style="position:absolute; top:4px; right:4px">不列入報表</div>' : ''}
            `;
            btn.onclick = () => awardPoints(item.id, item.label, item.value);
            positiveItemsGrid.appendChild(btn);
        });

        needsWorkItemsGrid.innerHTML = '';
        pointItems.needsWork.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'point-item-btn negative';
            btn.innerHTML = `
                <div class="point-icon">${item.icon}</div>
                <div class="point-label">${item.label}</div>
                <div class="point-value">${item.value}</div>
                ${item.ignoreTotal ? '<div class="ignore-badge" style="position:absolute; top:4px; right:4px">不列入報表</div>' : ''}
            `;
            btn.onclick = () => awardPoints(item.id, item.label, item.value);
            needsWorkItemsGrid.appendChild(btn);
        });

        // Settings Modal Items rendering
        settingsPositiveList.innerHTML = '';
        pointItems.positive.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="item-info">
                    <span>${item.icon} ${item.label} ${item.ignoreTotal ? '<span class="ignore-badge">不計入報表</span>' : ''}</span>
                    <span class="item-value">+${item.value}</span>
                </div>
                <button class="remove-item-btn" onclick="removePointItem('positive', ${item.id})">×</button>
            `;
            settingsPositiveList.appendChild(li);
        });

        settingsNeedsWorkList.innerHTML = '';
        pointItems.needsWork.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="item-info">
                    <span>${item.icon} ${item.label}  ${item.ignoreTotal ? '<span class="ignore-badge">不計入報表</span>' : ''}</span>
                    <span class="item-value">${item.value}</span>
                </div>
                <button class="remove-item-btn" onclick="removePointItem('needsWork', ${item.id})">×</button>
            `;
            settingsNeedsWorkList.appendChild(li);
        });
    };

    window.removePointItem = (category, id) => {
        pointItems[category] = pointItems[category].filter(item => item.id !== id);
        saveData();
        renderPointItems();
    };

    document.getElementById('addPositiveBtn').onclick = () => addNewPointItem('positive');
    document.getElementById('addNeedsWorkBtn').onclick = () => addNewPointItem('needsWork');

    const addNewPointItem = (category) => {
        const isPos = category === 'positive';
        const labelInput = isPos ? newPositiveLabel : newNeedsWorkLabel;
        const valueInput = isPos ? newPositiveValue : newNeedsWorkValue;
        const ignoreCheck = isPos ? newPositiveIgnore : newNeedsWorkIgnore;
        
        const label = labelInput.value.trim();
        let value = parseInt(valueInput.value);
        if(!label || isNaN(value)) return;

        if(!isPos && value > 0) value = -value;
        const icon = isPos ? '⭐' : '🚩';

        pointItems[category].push({
            id: Date.now(),
            label,
            value,
            icon,
            ignoreTotal: ignoreCheck.checked
        });
        saveData();
        renderPointItems();

        labelInput.value = '';
        valueInput.value = isPos ? '1' : '-1';
        ignoreCheck.checked = false;
    };


    const addStudent = () => {
        const newStudentNameInput = document.getElementById('newStudentName');
        const inputStr = newStudentNameInput.value.trim();
        if(!inputStr) return;
        
        const names = inputStr.split('\n').map(n => n.trim()).filter(n => n.length > 0);
        
        names.forEach((name, index) => {
            const newStudent = { id: Date.now() + index, name: name, avatarStyle: 'fun-emoji' };
            students.push(newStudent);
        });

        saveData();
        renderStudents();
        closeModal(addStudentModal);
        newStudentNameInput.value = '';
    };
    document.getElementById('saveStudentBtn').onclick = addStudent;


    // --- Global Base Events ---

    toggleMultiSelectBtn.onclick = toggleMultiSelectMode;
    cancelMultiBtn.onclick = toggleMultiSelectMode;
    multiAwardBtn.onclick = () => {
        if(selectedStudentIds.size === 0) return alert('請先選擇學生！');
        openAwardModal(Array.from(selectedStudentIds), `給予 ${selectedStudentIds.size} 位學生點數`, null);
    };

    viewTabBtns.forEach(btn => {
        btn.onclick = () => switchMainView(btn.dataset.view);
    });

    const createPointAnimation = (points, batchMultiplier = 1) => {
        for(let i=0; i < Math.min(batchMultiplier, 5); i++) {
            setTimeout(() => {
                const animEl = document.createElement('div');
                animEl.className = 'point-animation';
                animEl.textContent = points > 0 ? `+${points}` : points;
                animEl.style.color = points > 0 ? 'var(--positive-color)' : 'var(--negative-color)';
                
                animEl.style.left = (50 + (Math.random()*10 - 5)) + '%';
                animEl.style.top = (40 + (Math.random()*10 - 5)) + '%';
                animEl.style.transform = 'translate(-50%, -50%)';
                
                document.body.appendChild(animEl);
                setTimeout(() => { animEl.remove(); }, 1000);
            }, i * 100);
        }
    };

    // Modal Switchers
    const openModal = (modal) => modal.classList.remove('hidden');
    const closeModal = (modal) => modal.classList.add('hidden');

    const switchProfileTab = (tabName) => {
        document.querySelectorAll('#studentProfileModal .main-tabs .tab-btn').forEach(btn => {
            if(btn.dataset.profileTab === tabName) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        document.querySelectorAll('#studentProfileModal .profile-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tabName === 'award') document.getElementById('profileAwardTab').classList.add('active');
        else {
            document.getElementById('profileHistoryTab').classList.add('active');
            renderHistory();
        }
    };
    document.querySelectorAll('#studentProfileModal .main-tabs .tab-btn').forEach(btn => {
        btn.onclick = () => switchProfileTab(btn.dataset.profileTab);
    });

    const switchAwardTab = (tabName) => {
        document.querySelectorAll('#studentProfileModal .sub-tabs .sub-tab-btn').forEach(btn => {
            if(btn.dataset.awardTab === tabName) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        document.querySelectorAll('#studentProfileModal .award-content').forEach(content => content.classList.remove('active'));
        
        if (tabName === 'positive') document.getElementById('positiveItems').classList.add('active');
        else document.getElementById('needsWorkItems').classList.add('active');
    };
    document.querySelectorAll('#studentProfileModal .sub-tabs .sub-tab-btn').forEach(btn => {
        btn.onclick = () => switchAwardTab(btn.dataset.awardTab);
    });

    // Top Level Buttons
    document.getElementById('addStudentBtn').onclick = () => openModal(addStudentModal);
    document.getElementById('settingsBtn').onclick = () => openModal(settingsModal);
    document.getElementById('reportsBtn').onclick = () => { window.renderReports(); openModal(reportsModal); };

    // Close Modals
    document.querySelectorAll('.add-close').forEach(btn => btn.onclick = () => closeModal(addStudentModal));
    document.querySelectorAll('.profile-close').forEach(btn => btn.onclick = () => closeModal(studentProfileModal));
    document.querySelectorAll('.settings-close').forEach(btn => btn.onclick = () => closeModal(settingsModal));
    document.querySelectorAll('.reports-close').forEach(btn => btn.onclick = () => closeModal(reportsModal));
    document.querySelectorAll('.edit-student-close').forEach(btn => btn.onclick = () => closeModal(editStudentModal));
    document.querySelectorAll('.group-close').forEach(btn => btn.onclick = () => closeModal(manageGroupModal));


    // --- Boot sequence ---
    applySettings();
    renderStudents();
    renderPointItems();
});
