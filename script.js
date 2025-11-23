let rawData = [];
let charts = {}; // Object to store chart instances

// Configuration for Chart.js
const chartOptions = {
    responsive: true,
    plugins: {
        legend: { position: 'top' },
        title: { display: false }
    },
    scales: {
        x: { ticks: { color: '#333' }, grid: { color: '#eee' } },
        y: { ticks: { color: '#333' }, grid: { color: '#eee' } }
    }
};

/**
 * Robustly parses a "DD/MM/YYYY" date string into a Date object.
 */
function parseDate(dateString) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
        // Return a Date object (YYYY, MM-1, DD)
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return null;
}

// Helper function to format a Date object into "YYYY-MM-DD" for the input field
function formatDateForInput(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- NEW ID USAGE CALCULATION ---

/**
 * Calculates the count of unique 'ID Used' grouped by Team, Shift, and TL.
 * @param {Array} data - The filtered dataset.
 * @returns {Object} Maps containing unique ID sets for each group.
 */
function calculateIDUsageMetrics(data) {
    const teamIDs = new Map();
    const shiftIDs = new Map();
    const tlIDs = new Map();

    data.forEach(item => {
        const idUsed = item['ID Used'];
        const team = item['Team'];
        const shift = item['Shift'];
        const tl = item['TL'];

        // Only count valid IDs
        if (idUsed && typeof idUsed === 'string' && idUsed.trim() !== '') {
            const trimmedID = idUsed.trim();
            
            // By Team
            if (team) {
                const teamKey = String(team);
                if (!teamIDs.has(teamKey)) teamIDs.set(teamKey, new Set());
                teamIDs.get(teamKey).add(trimmedID);
            }

            // By Shift
            if (shift) {
                if (!shiftIDs.has(shift)) shiftIDs.set(shift, new Set());
                shiftIDs.get(shift).add(trimmedID);
            }

            // By TL
            if (tl) {
                if (!tlIDs.has(tl)) tlIDs.set(tl, new Set());
                tlIDs.get(tl).add(trimmedID);
            }
        }
    });

    return { teamIDs, shiftIDs, tlIDs };
}


// --- MAIN METRICS CALCULATION ---

function calculateMetrics(data) {
    if (data.length === 0) {
        return {
            overallAHT: '0.00',
            totalVolume: 0,
            unassignedVolume: 0,
            tlMetrics: [],
            shiftMetrics: [],
            ahtData: { 'Notification': 0, 'Room Status': 0, 'Zone Events': 0 }, 
            volumeData: { 'Notification': 0, 'Room Status': 0, 'Zone Events': 0 },
            employeeMetrics: [],
            tlTeamMap: [] 
        };
    }

    const tlMap = new Map();
    const shiftMap = new Map();
    const employeeMap = new Map(); 
    
    let totalVolume = 0;
    let totalWeightedTime = 0;
    let unassignedVolume = 0;
    
    let sumAHTNotifGlobal = 0;
    let sumAHTRoomGlobal = 0;
    let sumAHTZoneGlobal = 0;

    data.forEach(item => {
        const totalNotif = parseInt(item['Total Notification']) || 0;
        const totalRoom = parseInt(item['Total Room Update']) || 0;
        const totalZone = parseInt(item['Total Zone Update']) || 0;
        const ahtNotif = parseFloat(item['AHT - Notification']) || 0;
        const ahtRoom = parseFloat(item['AHT - Room Status']) || 0;
        const ahtZone = parseFloat(item['AHT - Zone Events']) || 0;

        const dayVolume = totalNotif + totalRoom + totalZone;
        const dayWeightedTime = 
            (totalNotif * ahtNotif) +
            (totalRoom * ahtRoom) +
            (totalZone * ahtZone);
        
        totalVolume += dayVolume;
        totalWeightedTime += dayWeightedTime;

        sumAHTNotifGlobal += ahtNotif;
        sumAHTRoomGlobal += ahtRoom;
        sumAHTZoneGlobal += ahtZone;

        // --- EMP ID Handling for Unassigned Work ---
        const empId = item['EMP ID'] ? item['EMP ID'].trim() : '';

        if (!empId || empId.toUpperCase() === '#N/A' || empId.toUpperCase() === 'N/A') {
            unassignedVolume += dayVolume;
        }
        
        // --- Employee Aggregation ---
        if (empId && empId.toUpperCase() !== '#N/A' && empId.toUpperCase() !== 'N/A') {
            const empKey = empId; 
            const currentEmp = employeeMap.get(empKey) || {
                name: item['Employee Name'] || 'N/A',
                empId: empId,
                team: item['Team'] || 'N/A', 
                totalVolume: 0,
                totalWeightedTime: 0,
                notifVolume: 0,
                notifWeightedTime: 0, 
                roomVolume: 0,
                roomWeightedTime: 0,  
                zoneVolume: 0,
                zoneWeightedTime: 0,  
            };
            
            // Update team assignment (takes the team from the current row)
            currentEmp.team = item['Team'] || currentEmp.team; 

            currentEmp.totalVolume += dayVolume;
            currentEmp.totalWeightedTime += dayWeightedTime;
            
            currentEmp.notifVolume += totalNotif;
            currentEmp.notifWeightedTime += (totalNotif * ahtNotif); 
            
            currentEmp.roomVolume += totalRoom;
            currentEmp.roomWeightedTime += (totalRoom * ahtRoom); 
            
            currentEmp.zoneVolume += totalZone;
            currentEmp.zoneWeightedTime += (totalZone * ahtZone); 

            employeeMap.set(empKey, currentEmp);
        }


        // --- TL Aggregation (Including Team Number) ---
        const tl = item['TL'];
        const team = item['Team'];
        if (tl) {
            const currentTL = tlMap.get(tl) || { 
                volume: 0, 
                weightedTime: 0, 
                count: 0, 
                sumAHTNotif: 0,
                sumAHTRoom: 0,
                sumAHTZone: 0,
                teams: new Set() 
            };

            currentTL.volume += dayVolume;
            currentTL.weightedTime += dayWeightedTime;
            currentTL.sumAHTNotif += ahtNotif;
            currentTL.sumAHTRoom += ahtRoom;
            currentTL.sumAHTZone += ahtZone;
            currentTL.count += 1;
            
            if (team) {
                currentTL.teams.add(team);
            }
            
            tlMap.set(tl, currentTL);
        }

        // Shift Aggregation
        const shift = item['Shift'];
        const currentShift = shiftMap.get(shift) || { volume: 0 };
        currentShift.volume += dayVolume;
        shiftMap.set(shift, currentShift);
    });

    const overallAHT = totalVolume > 0 ? (totalWeightedTime / totalVolume).toFixed(2) : '0.00';
    
    // TL Metrics
    const tlMetrics = Array.from(tlMap.entries()).map(([tl, metrics]) => ({
        tl,
        volume: metrics.volume,
        aht: metrics.volume > 0 ? (metrics.weightedTime / metrics.volume).toFixed(2) : '0.00',
        ahtByTask: {
            'Notification': metrics.count > 0 ? (metrics.sumAHTNotif / metrics.count) : 0,
            'Room Status': metrics.count > 0 ? (metrics.sumAHTRoom / metrics.count) : 0,
            'Zone Events': metrics.count > 0 ? (metrics.sumAHTZone / metrics.count) : 0,
        }
    }));
    
    // Employee Metrics
    const employeeMetrics = Array.from(employeeMap.values()).map(emp => ({
        ...emp,
        overallAHT: emp.totalVolume > 0 ? (emp.totalWeightedTime / emp.totalVolume).toFixed(2) : '0.00',
        // Calculate individual AHTs 
        notifAHT: emp.notifVolume > 0 ? (emp.notifWeightedTime / emp.notifVolume).toFixed(2) : '0.00', 
        roomAHT: emp.roomVolume > 0 ? (emp.roomWeightedTime / emp.roomVolume).toFixed(2) : '0.00',   
        zoneAHT: emp.zoneVolume > 0 ? (emp.zoneWeightedTime / emp.zoneVolume).toFixed(2) : '0.00',   
    })).sort((a, b) => b.totalVolume - a.totalVolume); 

    // TL Team Map
    const tlTeamMap = Array.from(tlMap.entries()).map(([tl, metrics]) => ({
        tl,
        teams: Array.from(metrics.teams).sort().join(', ') 
    }));


    // Global AHT (for KPIs)
    const countGlobal = data.length;
    const ahtData = {
        'Notification': countGlobal > 0 ? (sumAHTNotifGlobal / countGlobal) : 0,
        'Room Status': countGlobal > 0 ? (sumAHTRoomGlobal / countGlobal) : 0,
        'Zone Events': countGlobal > 0 ? (sumAHTZoneGlobal / countGlobal) : 0,
    };

    // Volume by Task Type (Global Sum)
    const volumeData = {
        'Notification': data.reduce((sum, item) => sum + (parseInt(item['Total Notification']) || 0), 0),
        'Room Status': data.reduce((sum, item) => sum + (parseInt(item['Total Room Update']) || 0), 0),
        'Zone Events': data.reduce((sum, item) => sum + (parseInt(item['Total Zone Update']) || 0), 0),
    };

    return {
        overallAHT,
        totalVolume,
        unassignedVolume, 
        tlMetrics,
        shiftMetrics: Array.from(shiftMap.entries()).map(([shift, metrics]) => ({ shift, volume: metrics.volume })),
        ahtData, 
        volumeData,
        employeeMetrics,
        tlTeamMap 
    };
}

// --- CHART & TABLE RENDERING FUNCTIONS ---

function updateKPIs(metrics) {
    document.getElementById('kpiVolume').innerText = (metrics.totalVolume || 0).toLocaleString();
    document.getElementById('kpiAHT').innerText = metrics.overallAHT || '0.00';
    
    const avgNotifAHT = (metrics.ahtData && metrics.ahtData['Notification']) ? metrics.ahtData['Notification'].toFixed(2) : '0.00';
    document.getElementById('kpiNotifAHT').innerText = avgNotifAHT; 

    const avgRoomAHT = (metrics.ahtData && metrics.ahtData['Room Status']) ? metrics.ahtData['Room Status'].toFixed(2) : '0.00';
    document.getElementById('kpiRoomAHT').innerText = avgRoomAHT;
    
    const avgZoneAHT = (metrics.ahtData && metrics.ahtData['Zone Events']) ? metrics.ahtData['Zone Events'].toFixed(2) : '0.00';
    document.getElementById('kpiZoneAHT').innerText = avgZoneAHT;

    document.getElementById('kpiUnassigned').innerText = (metrics.unassignedVolume || 0).toLocaleString();
}

function createChart(chartId, type, data, options) {
    if (charts[chartId]) {
        charts[chartId].destroy(); 
    }
    const ctx = document.getElementById(chartId);
    if (ctx) { 
        const context = ctx.getContext('2d');
        charts[chartId] = new Chart(context, { type, data, options });
    }
}

function renderVolumeByTask(metrics) {
    const labels = Object.keys(metrics.volumeData);
    const data = Object.values(metrics.volumeData);
    createChart('volumeByTaskChart', 'pie', {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: ['#007bff', '#28a745', '#ffc107'],
        }]
    }, {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: false }
        }
    });
}

function renderTLVolume(metrics) {
    const allTLs = metrics.tlMetrics.sort((a, b) => b.volume - a.volume); 

    // Calculate height based on the number of TLs to ensure labels are not cramped.
    const calculatedHeight = Math.max(300, allTLs.length * 40 + 80); 

    const canvas = document.getElementById('tlVolumeChart');
    if(canvas) {
         canvas.style.height = `${calculatedHeight}px`;
    }

    createChart('tlVolumeChart', 'bar', {
        labels: allTLs.map(m => m.tl),
        datasets: [{
            label: 'Total Volume',
            data: allTLs.map(m => m.volume),
            backgroundColor: '#17a2b8',
        }]
    }, {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
            x: { beginAtZero: true },
            y: { autoSkip: false } 
        }
    });
}

/**
 * FIX: Now reliably manages the canvas element by referencing the parent container's ID.
 */
function renderShiftVolume(metrics) {
    const shiftLabels = metrics.shiftMetrics.map(m => m.shift);
    const shiftData = metrics.shiftMetrics.map(m => m.volume);
    
    // The container is referenced by its new ID 'shiftVolumeChartCard'
    const chartCard = document.getElementById('shiftVolumeChartCard'); 
    if (!chartCard) {
         console.error("Shift chart container ('shiftVolumeChartCard') not found. Check index.html.");
         return;
    }

    // Get references to the canvas and potential message
    let canvas = document.getElementById('shiftVolumeChart');
    let message = chartCard.querySelector('p');

    // Destroy existing chart instance (if any)
    if (charts['shiftVolumeChart']) {
        charts['shiftVolumeChart'].destroy();
        delete charts['shiftVolumeChart'];
    }

    if (shiftData.every(v => v === 0) || shiftData.length === 0) {
        // No Data: Show Message
        if (canvas) canvas.remove(); // Remove the canvas
        if (!message) {
            // Add the message if it doesn't exist
            chartCard.insertAdjacentHTML('beforeend', '<p style="text-align: center; margin-top: 50px; color: #777;">No shift volume data available for the current filters.</p>');
        }
        return;
    }
    
    // Data Exists: Show Chart
    if (message) message.remove(); // Remove the message
    
    if (!canvas) {
        // Re-create canvas if it was removed
        canvas = document.createElement('canvas');
        canvas.id = 'shiftVolumeChart';
        // Insert the canvas after the h2 element (first child)
        const h2 = chartCard.querySelector('h2');
        if (h2) {
             h2.insertAdjacentElement('afterend', canvas);
        } else {
             chartCard.appendChild(canvas);
        }
    }
    
    // Now that the canvas is guaranteed to be in the DOM, render the chart
    createChart('shiftVolumeChart', 'doughnut', {
        labels: shiftLabels,
        datasets: [{
            data: shiftData,
            backgroundColor: ['#6f42c1', '#fd7e14', '#20c997'],
        }]
    }, {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: false }
        }
    });
}

function renderTLTeamMap(tlTeamMap) {
    const container = document.getElementById('tlTeamMapCard');
    
    if (tlTeamMap.length === 0) {
        container.innerHTML = '<h2>Team Leader & Team Assignment</h2><p style="text-align: center; margin-top: 50px; color: #777;">No TL-Team data available.</p>';
        return;
    }
    
    const sortedMap = tlTeamMap.sort((a, b) => a.tl.localeCompare(b.tl));

    let contentHTML = `
        <table class="tl-team-table">
            <thead>
                <tr>
                    <th>Team Leader</th>
                    <th>Team Number(s)</th>
                </tr>
            </thead>
            <tbody>
    `;

    sortedMap.forEach(item => {
        contentHTML += `
            <tr>
                <td>${item.tl || 'N/A'}</td>
                <td>${item.teams || 'N/A'}</td>
            </tr>
        `;
    });
    
    contentHTML += `</tbody></table>`;
    
    container.innerHTML = `<h2>Team Leader & Team Assignment</h2>` + contentHTML;
}


function renderTLAHTChart(tlMetric) {
    const chartId = `ahtByTaskChart_${tlMetric.tl.replace(/[^a-zA-Z0-9]/g, '')}`;
    const container = document.getElementById('tlAHTChartsContainer');

    const chartCard = document.createElement('div');
    chartCard.className = 'chart-card';
    chartCard.innerHTML = `
        <h2>${tlMetric.tl} - AHT by Task Type (s)</h2>
        <canvas id="${chartId}"></canvas>
    `;
    container.appendChild(chartCard);

    const labels = Object.keys(tlMetric.ahtByTask);
    const data = Object.values(tlMetric.ahtByTask).map(aht => aht.toFixed(2));
    
    createChart(chartId, 'bar', {
        labels: labels,
        datasets: [{
            label: 'Avg AHT (s)',
            data: data,
            backgroundColor: ['#dc3545', '#ff851b', '#0097a7'],
        }]
    }, {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
    });
}

function renderAllTLAHTCharts(metrics) {
    const container = document.getElementById('tlAHTChartsContainer');
    
    Object.keys(charts).forEach(id => {
        if (id.startsWith('ahtByTaskChart_')) {
            charts[id].destroy();
            delete charts[id];
        }
    });
    container.innerHTML = ''; 

    metrics.tlMetrics.forEach(tlMetric => {
        renderTLAHTChart(tlMetric);
    });
}

function renderEmployeePerformanceTable(metrics, selectedTL, selectedTeam) {
    const container = document.getElementById('employeeDetailsContainer');
    const titleElement = document.getElementById('employeeDetailTitle');
    const data = metrics.employeeMetrics;

    if (data.length === 0) {
        let titleText = "No employee data available for the selected date range/filters.";
        if (selectedTL !== 'all' && selectedTeam !== 'all') {
            titleText = `No employee data found for Team Leader: ${selectedTL} in Team ${selectedTeam} in the selected range.`;
        } else if (selectedTL !== 'all') {
            titleText = `No employee data found for Team Leader: ${selectedTL} in the selected range.`;
        }
        titleElement.textContent = titleText;
        container.querySelector('.employee-table')?.remove(); 
        return;
    }

    let headerText;
    if (selectedTL === 'all') {
        headerText = "Employee Performance Details (All Teams)";
    } else if (selectedTeam !== 'all') {
        headerText = `Employee Performance Details for Team Leader: ${selectedTL} (Team ${selectedTeam})`;
    } else {
        headerText = `Employee Performance Details for Team Leader: ${selectedTL} (All Teams)`;
    }
    titleElement.textContent = headerText;

    let tableHTML = `
        <table class="employee-table">
            <thead>
                <tr>
                    <th>Employee Name</th>
                    <th>EMP ID</th>
                    <th>Team</th>
                    <th>Total Volume</th>
                    <th>Overall AHT (s)</th>
                    <th>Notification Volume</th>
                    <th>Room Status Volume</th>
                    <th>Zone Event Volume</th>
                    <th>Notification AHT (s)</th>
                    <th>Room Status AHT (s)</th>
                    <th>Zone Event AHT (s)</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(emp => {
        tableHTML += `
            <tr>
                <td>${emp.name || 'N/A'}</td>
                <td>${emp.empId || 'N/A'}</td>
                <td>${emp.team || 'N/A'}</td>
                <td>${emp.totalVolume.toLocaleString()}</td>
                <td>${emp.overallAHT}</td>
                <td>${emp.notifVolume.toLocaleString()}</td>
                <td>${emp.roomVolume.toLocaleString()}</td>
                <td>${emp.zoneVolume.toLocaleString()}</td>
                <td>${emp.notifAHT}</td>
                <td>${emp.roomAHT}</td>
                <td>${emp.zoneAHT}</td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    
    let existingTable = container.querySelector('.employee-table');
    if (existingTable) {
        existingTable.outerHTML = tableHTML;
    } else {
        container.insertAdjacentHTML('beforeend', tableHTML);
    }
}

/**
 * Renders the count of unique 'ID Used' grouped by Team, Shift, and TL.
 * @param {Object} idUsageMetrics - Maps containing unique ID sets.
 */
function renderIDUsageSummary(idUsageMetrics) {
    const { teamIDs, shiftIDs, tlIDs } = idUsageMetrics;

    const renderMap = (map, elementId, keyPrefix = '') => {
        // Convert Map of Sets to array of objects for sorting and rendering
        const dataArray = Array.from(map.entries())
            .map(([key, idSet]) => ({
                key: keyPrefix + key,
                count: idSet.size
            }))
            .sort((a, b) => b.count - a.count); // Sort by count descending

        const targetElement = document.getElementById(elementId);
        if (!targetElement) return;

        if (dataArray.length === 0) {
            targetElement.innerHTML = `<p style="color: #999; margin: 0;">No unique IDs found.</p>`;
            return;
        }

        let html = '';
        dataArray.forEach(item => {
            html += `
                <div>
                    <strong>${item.key}:</strong> ${item.count.toLocaleString()} unique IDs
                </div>
            `;
        });
        targetElement.innerHTML = html;
    };

    renderMap(teamIDs, 'countByTeam', 'Team ');
    renderMap(shiftIDs, 'countByShift');
    renderMap(tlIDs, 'countByTL');
}


function populateTLFilter(data) {
    const tlSet = new Set(data.map(item => item['TL']).filter(tl => tl)); 
    const filter = document.getElementById('tlFilter');
    filter.innerHTML = '<option value="all">All Team Leads</option>'; 
    tlSet.forEach(tl => {
        const option = document.createElement('option');
        option.value = tl;
        option.textContent = tl;
        filter.appendChild(option);
    });
}

/**
 * Populates the Team filter dropdown based on the selected TL and date-filtered data.
 */
function populateTeamFilter(tl, data) {
    const teamFilterGroup = document.getElementById('teamFilterGroup');
    const filter = document.getElementById('teamFilter');
    
    // Only show and populate if a specific TL is selected
    if (tl === 'all') {
        teamFilterGroup.style.display = 'none';
        return;
    }
    
    teamFilterGroup.style.display = 'flex'; // Show the filter
    
    // Find all unique teams for the selected TL in the current date range
    const tlData = data.filter(item => item['TL'] === tl);
    // Use String() conversion to ensure consistency with filter value
    const teamSet = new Set(tlData.map(item => String(item['Team'])).filter(team => team && team !== 'null' && team !== 'N/A')); 

    const currentSelectedTeam = filter.value;
    
    // Rebuild options
    filter.innerHTML = '<option value="all">All Teams (TL)</option>'; 
    Array.from(teamSet).sort().forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = `Team ${team}`;
        filter.appendChild(option);
    });
    
    // Restore previous selection if it's still a valid option
    if (currentSelectedTeam && Array.from(teamSet).includes(currentSelectedTeam)) {
         filter.value = currentSelectedTeam;
    } else {
         filter.value = 'all'; // Default back to 'all' if the selected team is no longer valid
    }
}

function populateDateFilters(data) {
    const dateElements = data.map(item => parseDate(item['Date'])).filter(d => d && !isNaN(d));
    if (dateElements.length === 0) return;

    const minDate = new Date(Math.min(...dateElements));
    const maxDate = new Date(Math.max(...dateElements));

    document.getElementById('startDateFilter').value = formatDateForInput(minDate);
    document.getElementById('endDateFilter').value = formatDateForInput(maxDate);
}

// --- MAIN CONTROL FUNCTIONS ---

function renderDashboard() {
    const selectedTL = document.getElementById('tlFilter').value;
    const startDateStr = document.getElementById('startDateFilter').value;
    const endDateStr = document.getElementById('endDateFilter').value;

    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;
    
    const startOfDay = (d) => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;

    // 1. Filter Data by Date
    const dateFilteredData = rawData.filter(item => {
        const itemDate = parseDate(item['Date']);
        if (!itemDate || isNaN(itemDate)) return false; 

        const itemDateOnly = startOfDay(itemDate);
        
        let withinStart = true;
        if (startDate) {
            withinStart = itemDateOnly >= startOfDay(startDate);
        }

        let withinEnd = true;
        if (endDate) {
            withinEnd = itemDateOnly <= startOfDay(endDate);
        }
        
        return withinStart && withinEnd;
    });

    // 2. Calculate GLOBAL Metrics (Metrics for ALL TLs in the date range)
    const globalMetrics = calculateMetrics(dateFilteredData);
    
    // 3. Populate Team Filter based on selected TL
    populateTeamFilter(selectedTL, dateFilteredData); 
    
    // 4. Read the selected Team filter value
    const selectedTeam = document.getElementById('teamFilter').value;
    
    // 5. Filter by TL
    let tlSpecificData = selectedTL === 'all'
        ? dateFilteredData
        : dateFilteredData.filter(item => item['TL'] === selectedTL);
        
    // 6. Filter by Team (only applies if a specific TL is selected AND a specific Team is selected)
    if (selectedTL !== 'all' && selectedTeam !== 'all') {
        const teamStr = selectedTeam; 
        // Filter where the 'Team' column matches the selected string value
        tlSpecificData = tlSpecificData.filter(item => String(item['Team']) === teamStr);
    }
    
    // 7. Calculate TL-SPECIFIC Metrics & ID Usage
    const tlSpecificMetrics = calculateMetrics(tlSpecificData);
    const idUsageMetrics = calculateIDUsageMetrics(tlSpecificData); // New calculation
    
    // 8. Update Visuals
    
    // NEW: ID Usage Summary reflects the filtered data set
    renderIDUsageSummary(idUsageMetrics); 

    // KPIs, Volume by Task, and Shift Volume reflect the filtered data set (TL Specific/Team Specific)
    updateKPIs(tlSpecificMetrics);
    renderVolumeByTask(tlSpecificMetrics);
    renderShiftVolume(tlSpecificMetrics); 
    
    // AHT charts reflect the filtered data set (TL Specific/Team Specific)
    renderAllTLAHTCharts(tlSpecificMetrics); 
    
    // Employee table reflects the filtered data set
    renderEmployeePerformanceTable(tlSpecificMetrics, selectedTL, selectedTeam);
    
    // Global views use global metrics (TL Team Map and TL Volume Chart should always show ALL TLs in the date range)
    renderTLTeamMap(globalMetrics.tlTeamMap);
    renderTLVolume(globalMetrics);
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        let jsonText = e.target.result;
        
        try {
            // 1. Remove BOM (Byte Order Mark) if present
            if (jsonText.charCodeAt(0) === 0xFEFF) {
                jsonText = jsonText.substring(1);
            }
            
            // 2. Aggressive cleanup: Remove all control characters and non-standard whitespace, then trim.
            let cleanedJsonText = jsonText.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim(); 

            // 3. Final Parsing attempt
            rawData = JSON.parse(cleanedJsonText);
            
            populateDateFilters(rawData);
            populateTLFilter(rawData);
            
            renderDashboard(); 
        } catch (error) {
            console.error("File parsing error:", error, "Text snippet (first 500 chars):", jsonText.substring(0, 500));
            alert('Error parsing JSON file. Please ensure the file is a valid JSON array. Check your browser\'s console (F12) for more details on the error.');
            rawData = []; 
            // Render dashboard with empty data
            renderDashboard(); 
        }
    };
    reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
     // Initial render with empty data
     const emptyMetrics = calculateMetrics([]);
     updateKPIs(emptyMetrics);
     renderVolumeByTask(emptyMetrics);
     renderShiftVolume(emptyMetrics);
     renderTLVolume(emptyMetrics);
     renderTLTeamMap(emptyMetrics.tlTeamMap);
     renderIDUsageSummary(calculateIDUsageMetrics([])); // Initial render for new section
     document.getElementById('employeeDetailTitle').textContent = "Select a Team Lead from the filter above to view detailed team performance.";
});