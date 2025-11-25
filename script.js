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
 * Safely parses a date string in DD/MM/YYYY format.
 * Includes defensive coding to prevent TypeError if the input is not a string.
 * @param {string} dateString - The date string to parse (e.g., "01/11/2025").
 * @returns {Date | null} A Date object or null if parsing fails.
 */
function parseDate(dateString) {
    // === CRITICAL FIX START: Check if the input is a valid string ===
    if (typeof dateString !== 'string' || dateString.trim() === '') {
      // If it's not a string, or is just an empty string, return null 
      // to indicate invalid data, preventing the TypeError.
      console.warn('Invalid date value encountered:', dateString);
      return null;
    }
    // === CRITICAL FIX END ===
  
    // Assuming the date format is DD/MM/YYYY based on the uploaded data
    const parts = dateString.split('/');
    
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed (Jan=0, Feb=1, etc.)
      const year = parseInt(parts[2], 10);
      
      // Check for valid numbers
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(year, month, day);
      }
    }
  
    // Return null if the format or data is incorrect
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
            tlMetrics: [], // Now TL-Team specific
            shiftMetrics: [],
            ahtData: { 'Notification': 0, 'Room Status': 0, 'Zone Events': 0 }, 
            volumeData: { 'Notification': 0, 'Room Status': 0, 'Zone Events': 0 },
            employeeMetrics: [],
            tlTeamMap: [] // Remains TL-specific
        };
    }

    const tlMap = new Map(); // Used for TL/Team metrics (volume, AHT by Task)
    const shiftMap = new Map();
    const employeeMap = new Map(); 
    const tlTeamMapRestore = new Map(); // Used specifically for generating the TL & Team Assignment table (tlTeamMap)
    
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
        const empId = item['EMP ID'] ? String(item['EMP ID']).trim() : '';

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


        // --- TL/Team Aggregation (Composite Key: TL|Team) ---
        const tl = item['TL'];
        const team = item['Team'];
        const teamStr = String(team); // Ensure team is a string for keying
        
        if (tl && teamStr && teamStr !== 'N/A' && teamStr !== 'null') {
            // Composite Key for TL Metrics (to break down volume and AHT by team)
            const tlTeamKey = `${tl}|${teamStr}`; 
            
            const currentTLTeam = tlMap.get(tlTeamKey) || { 
                tl: tl,
                team: teamStr, // Store team number
                volume: 0, 
                weightedTime: 0, 
                count: 0, 
                sumAHTNotif: 0,
                sumAHTRoom: 0,
                sumAHTZone: 0,
            };

            currentTLTeam.volume += dayVolume;
            currentTLTeam.weightedTime += dayWeightedTime;
            currentTLTeam.sumAHTNotif += ahtNotif;
            currentTLTeam.sumAHTRoom += ahtRoom;
            currentTLTeam.sumAHTZone += ahtZone;
            currentTLTeam.count += 1;
            
            tlMap.set(tlTeamKey, currentTLTeam);
        }
        
        // --- TL Team Map Restoration (TL-only aggregation for the assignment table) ---
        if (tl) {
            const currentTL = tlTeamMapRestore.get(tl) || { teams: new Set() };
            if (teamStr && teamStr !== 'N/A' && teamStr !== 'null') {
                currentTL.teams.add(teamStr);
            }
            tlTeamMapRestore.set(tl, currentTL);
        }


        // Shift Aggregation
        const shift = item['Shift'];
        const currentShift = shiftMap.get(shift) || { volume: 0 };
        currentShift.volume += dayVolume;
        shiftMap.set(shift, currentShift);
    });

    const overallAHT = totalVolume > 0 ? (totalWeightedTime / totalVolume).toFixed(2) : '0.00';
    
    // TL Metrics (Now TL-Team Breakdown)
    const tlMetrics = Array.from(tlMap.values()).map(metrics => ({
        tl: metrics.tl,
        team: metrics.team, // Now includes the team number
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

    // TL Team Map (Assignment Table - Aggregated by TL only)
    const tlTeamMap = Array.from(tlTeamMapRestore.entries()).map(([tl, metrics]) => ({
        tl,
        // Sort teams numerically before joining
        teams: Array.from(metrics.teams).sort((a, b) => parseInt(a) - parseInt(b)).join(', ') 
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

/**
 * UPDATED: Now shows a separate bar for each team managed by a TL.
 */
function renderTLVolume(metrics) {
    // The metrics.tlMetrics now contains objects with { tl, team, volume, ... }
    const tlTeamVolumeData = metrics.tlMetrics.map(m => ({
        // Create the composite label
        label: `${m.tl} (Team ${m.team})`, 
        volume: m.volume,
        tl: m.tl,
        team: m.team
    }));
    
    // Primary sort: by TL name (A-Z)
    // Secondary sort: by Team number (ascending)
    const allTLs = tlTeamVolumeData.sort((a, b) => {
        const tlCompare = a.tl.localeCompare(b.tl);
        if (tlCompare !== 0) return tlCompare;
        
        // Convert team strings to numbers for proper numeric sorting
        return parseInt(a.team) - parseInt(b.team);
    }); 

    // Calculate height based on the number of entries
    const calculatedHeight = Math.max(300, allTLs.length * 40 + 80); 

    const canvas = document.getElementById('tlVolumeChart');
    if(canvas) {
         canvas.style.height = `${calculatedHeight}px`;
    }

    createChart('tlVolumeChart', 'bar', {
        labels: allTLs.map(m => m.label), // Use the new composite label
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

function renderShiftVolume(metrics) {
    const shiftLabels = metrics.shiftMetrics.map(m => m.shift);
    const shiftData = metrics.shiftMetrics.map(m => m.volume);
    
    // The container is referenced by its ID 'shiftVolumeChartCard'
    const chartCard = document.getElementById('shiftVolumeChartCard'); 
    if (!chartCard) {
         console.error("Shift chart container ('shiftVolumeChartCard') not found. Check index.html.");
         return;
    }

    // Get references to the canvas and potential message
    let canvas = document.getElementById('shiftVolumeChart');
    // Look for the p element within the card container
    let message = chartCard.querySelector('p'); 

    // Destroy existing chart instance (if any)
    if (charts['shiftVolumeChart']) {
        charts['shiftVolumeChart'].destroy();
        delete charts['shiftVolumeChart'];
    }

    if (shiftData.every(v => v === 0) || shiftData.length === 0) {
        // No Data: Show Message
        if (canvas) canvas.style.display = 'none'; // Hide the canvas
        if (!message) {
            // Add the message if it doesn't exist
             chartCard.insertAdjacentHTML('beforeend', '<p style="text-align: center; margin-top: 50px; color: #777;">No shift volume data available for the current filters.</p>');
             message = chartCard.querySelector('p');
        }
        if (message) message.style.display = 'block';
        return;
    }
    
    // Data Exists: Show Chart
    if (message) message.style.display = 'none'; // Hide the message
    
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
    
    if (canvas) canvas.style.display = 'block';

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
        container.innerHTML = '<h2>Team Leader & Team Assignment</h2><p>No TL-Team data available.</p>';
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
    // The TL Metric is now TL|Team specific, so the chart title reflects this.
    const chartId = `ahtByTaskChart_${tlMetric.tl.replace(/[^a-zA-Z0-9]/g, '')}_${tlMetric.team}`;
    const container = document.getElementById('tlAHTChartsContainer');

    const chartCard = document.createElement('div');
    chartCard.className = 'chart-card';
    chartCard.innerHTML = `
        <h2>${tlMetric.tl} (Team ${tlMetric.team}) - AHT by Task Type (s)</h2>
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
    
    // Destroy existing charts
    Object.keys(charts).forEach(id => {
        if (id.startsWith('ahtByTaskChart_')) {
            charts[id].destroy();
            delete charts[id];
        }
    });
    container.innerHTML = ''; 

    // Sort metrics by TL name then by team number
    const sortedMetrics = metrics.tlMetrics.sort((a, b) => {
        const tlCompare = a.tl.localeCompare(b.tl);
        if (tlCompare !== 0) return tlCompare;
        return parseInt(a.team) - parseInt(b.team);
    });

    sortedMetrics.forEach(tlMetric => {
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

    // Clear and reset the container content placeholder
    const summaryContent = document.getElementById('idUsageSummaryContent');
    if (summaryContent) summaryContent.innerHTML = '';
    
    // Append the newly rendered content
    if (summaryContent) {
        summaryContent.insertAdjacentHTML('beforeend', `<div id="countByTeam"></div>`);
        summaryContent.insertAdjacentHTML('beforeend', `<div id="countByShift"></div>`);
        summaryContent.insertAdjacentHTML('beforeend', `<div id="countByTL"></div>`);
    }

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
    Array.from(teamSet).sort((a, b) => parseInt(a) - parseInt(b)).forEach(team => {
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
    
    // AHT charts reflect the filtered data set, now broken down by TL and Team
    renderAllTLAHTCharts(tlSpecificMetrics); 
    
    // Employee table reflects the filtered data set
    renderEmployeePerformanceTable(tlSpecificMetrics, selectedTL, selectedTeam);
    
    // Global views use global metrics (TL Team Map and TL Volume Chart should always show ALL TLs in the date range)
    // IMPORTANT: renderTLVolume is now using the TL|Team metrics for breakdown, even when using globalMetrics
    renderTLTeamMap(globalMetrics.tlTeamMap);
    renderTLVolume(globalMetrics);
}

/**
 * NEW: Handles Excel file upload and conversion to JSON using SheetJS.
 */
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            // 1. Read the workbook data as a binary string
            const data = e.target.result;
            // Use window.XLSX globally available from the CDN script
            const workbook = XLSX.read(data, { type: 'binary' });

            // 2. Assume the data is in the first sheet and get the worksheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // 3. Convert the sheet to a JSON array (array of objects)
            // header: 1 means interpret the first row as column headers
            rawData = XLSX.utils.sheet_to_json(worksheet);

            if (rawData.length === 0) {
                 throw new Error("The Excel sheet is empty or has no recognizable data.");
            }
            
            // 4. Setup filters and render dashboard
            populateDateFilters(rawData);
            populateTLFilter(rawData);
            
            renderDashboard(); 

        } catch (error) {
            console.error("File processing error:", error);
            // Replaced alert() with console log to follow instructions
            console.log('Error processing the file. Please ensure it is a valid Excel file (.xlsx or .xls) and the data is in the FIRST sheet with headers in the first row.');
            rawData = []; 
            renderDashboard(); 
        }
    };
    
    // Crucial: Read the file as a binary string for SheetJS
    reader.readAsBinaryString(file);
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