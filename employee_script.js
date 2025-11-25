let rawData = [];
let charts = {};

// Daily Task Volume Target
const DAILY_TASK_TARGET = 1800;

const chartOptions = {
    responsive: true,
    // Add aspect ratio to make charts larger/taller (e.g., 2:1 ratio)
    aspectRatio: 2.5, // Increase size significantly for better date visibility
    maintainAspectRatio: true,
    plugins: {
        legend: { position: 'top' },
        title: { display: false }
    },
    scales: {
        x: { 
            ticks: { 
                color: '#333', 
                // *** IMPORTANT: Force display of all ticks/dates on the X-axis ***
                autoSkip: false,
                maxRotation: 45,
                minRotation: 45
            }, 
            grid: { color: '#eee' } 
        },
        y: { beginAtZero: true, ticks: { color: '#333' }, grid: { color: '#eee' } }
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

// --- METRICS CALCULATION ---

/**
 * Calculates aggregate and daily metrics for a specific employee.
 * @param {Array} data - The filtered dataset for one employee.
 * @returns {Object} Aggregate KPIs and a list of daily performance records.
 */
function calculateEmployeeMetrics(data) {
    if (data.length === 0) {
        return {
            overallAHT: '0.00',
            totalVolume: 0,
            ahtData: { 'Notification': '0.00', 'Room Status': '0.00', 'Zone Events': '0.00' }, 
            dailyPerformance: [],
            employeeName: 'N/A',
            empId: 'N/A',
            teamId: null // Default teamId
        };
    }

    let totalVolume = 0;
    let totalWeightedTime = 0;
    
    let notifVolume = 0;
    let notifWeightedTime = 0; 
    
    let roomVolume = 0;
    let roomWeightedTime = 0;  
    
    let zoneVolume = 0;
    let zoneWeightedTime = 0; 
    
    let employeeName = data[0]['Employee Name'] || 'N/A';
    let empId = data[0]['EMP ID'] ? String(data[0]['EMP ID']).trim() : 'N/A';
    let teamId = null; 
    
    const dailyPerformanceMap = new Map();

    data.forEach(item => {
        const dateKey = item['Date'];
        const totalNotif = parseInt(item['Total Notification']) || 0;
        const totalRoom = parseInt(item['Total Room Update']) || 0;
        const totalZone = parseInt(item['Total Zone Update']) || 0;
        const ahtNotif = parseFloat(item['AHT - Notification']) || 0;
        const ahtRoom = parseFloat(item['AHT - Room Status']) || 0;
        const ahtZone = parseFloat(item['AHT - Zone Events']) || 0;
        
        // Capture teamId from the first record
        if (teamId === null && item['Team']) {
            teamId = parseInt(item['Team']);
        }

        const dayVolume = totalNotif + totalRoom + totalZone;
        const dayWeightedTime = 
            (totalNotif * ahtNotif) +
            (totalRoom * ahtRoom) +
            (totalZone * ahtZone);
        
        totalVolume += dayVolume;
        totalWeightedTime += dayWeightedTime;
        
        notifVolume += totalNotif;
        notifWeightedTime += (totalNotif * ahtNotif); 
            
        roomVolume += totalRoom;
        roomWeightedTime += (totalRoom * ahtRoom); 
            
        zoneVolume += totalZone;
        zoneWeightedTime += (totalZone * ahtZone); 
        
        // Daily Aggregation
        let dailyMetrics = dailyPerformanceMap.get(dateKey) || {
            date: dateKey,
            totalVolume: 0,
            weightedTime: 0,
            notifVolume: 0,
            notifWeightedTime: 0, 
            roomVolume: 0,
            roomWeightedTime: 0,  
            zoneVolume: 0,
            zoneWeightedTime: 0,  
        };

        dailyMetrics.totalVolume += dayVolume;
        dailyMetrics.weightedTime += dayWeightedTime;
        dailyMetrics.notifVolume += totalNotif;
        dailyMetrics.notifWeightedTime += (totalNotif * ahtNotif); 
        dailyMetrics.roomVolume += totalRoom;
        dailyMetrics.roomWeightedTime += (totalRoom * ahtRoom); 
        dailyMetrics.zoneVolume += totalZone;
        dailyMetrics.zoneWeightedTime += (totalZone * ahtZone); 
        
        dailyPerformanceMap.set(dateKey, dailyMetrics);
    });

    const overallAHT = totalVolume > 0 ? (totalWeightedTime / totalVolume).toFixed(2) : '0.00';
    
    // Aggregate AHT by Task Type (using overall sums)
    const ahtData = {
        'Notification': notifVolume > 0 ? (notifWeightedTime / notifVolume).toFixed(2) : '0.00',
        'Room Status': roomVolume > 0 ? (roomWeightedTime / roomVolume).toFixed(2) : '0.00',
        'Zone Events': zoneVolume > 0 ? (zoneWeightedTime / zoneVolume).toFixed(2) : '0.00',
    };
    
    // Process daily records for final output and sort by date
    const dailyPerformance = Array.from(dailyPerformanceMap.values())
        .map(day => ({
            ...day,
            overallAHT: day.totalVolume > 0 ? (day.weightedTime / day.totalVolume).toFixed(2) : '0.00',
            notifAHT: day.notifVolume > 0 ? (day.notifWeightedTime / day.notifVolume).toFixed(2) : '0.00',
            roomAHT: day.roomVolume > 0 ? (day.roomWeightedTime / day.roomVolume).toFixed(2) : '0.00',
            zoneAHT: day.zoneVolume > 0 ? (day.zoneWeightedTime / day.zoneVolume).toFixed(2) : '0.00',
        }))
        .sort((a, b) => parseDate(a.date) - parseDate(b.date)); // Sort by date ascending

    return {
        overallAHT,
        totalVolume,
        ahtData, 
        dailyPerformance,
        employeeName,
        empId,
        teamId // Added teamId
    };
}

// --- CHART & TABLE RENDERING FUNCTIONS ---

function updateKPIs(metrics) {
    document.getElementById('kpiVolume').innerText = (metrics.totalVolume || 0).toLocaleString();
    document.getElementById('kpiAHT').innerText = metrics.overallAHT || '0.00';
    
    document.getElementById('kpiNotifAHT').innerText = metrics.ahtData['Notification'] || '0.00'; 
    document.getElementById('kpiRoomAHT').innerText = metrics.ahtData['Room Status'] || '0.00';
    document.getElementById('kpiZoneAHT').innerText = metrics.ahtData['Zone Events'] || '0.00';
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

/**
 * Renders the daily trend charts for Volume and all AHT types.
 */
function renderEmployeeTrends(dailyPerformance, employeeName) {
    const dates = dailyPerformance.map(d => d.date);
    const volumes = dailyPerformance.map(d => d.totalVolume);
    const ahts = dailyPerformance.map(d => parseFloat(d.overallAHT));
    // NEW AHT data
    const notifAhts = dailyPerformance.map(d => parseFloat(d.notifAHT));
    const roomAhts = dailyPerformance.map(d => parseFloat(d.roomAHT));
    const zoneAhts = dailyPerformance.map(d => parseFloat(d.zoneAHT));
    
    const trendCharts = [
        { id: 'volumeTrendChart', messageId: 'volumeTrendMessage', title: 'Daily Volume Trend', data: volumes, label: 'Total Volume', color: '#007bff' },
        { id: 'ahtTrendChart', messageId: 'ahtTrendMessage', title: 'Daily Overall AHT Trend (s)', data: ahts, label: 'Overall AHT (s)', color: '#dc3545' },
        // NEW Charts
        { id: 'notifAHTTrendChart', messageId: 'notifAHTTrendMessage', title: 'Daily Notification AHT Trend (s)', data: notifAhts, label: 'Notification AHT (s)', color: '#28a745' },
        { id: 'roomAHTTrendChart', messageId: 'roomAHTTrendMessage', title: 'Daily Room Status AHT Trend (s)', data: roomAhts, label: 'Room Status AHT (s)', color: '#ffc107' },
        { id: 'zoneAHTTrendChart', messageId: 'zoneAHTTrendMessage', title: 'Daily Zone Event AHT Trend (s)', data: zoneAhts, label: 'Zone Event AHT (s)', color: '#17a2b8' },
    ];

    trendCharts.forEach(chartInfo => {
        const canvas = document.getElementById(chartInfo.id);
        const message = document.getElementById(chartInfo.messageId);
        
        const hasData = dailyPerformance.length > 0;

        // Toggle visibility based on data presence
        if (message) message.style.display = hasData ? 'none' : 'block';
        if (canvas) canvas.style.display = hasData ? 'block' : 'none';

        if (!hasData) return;

        createChart(chartInfo.id, 'line', {
            labels: dates,
            datasets: [{
                label: chartInfo.label,
                data: chartInfo.data,
                backgroundColor: chartInfo.color + '40', // light fill
                borderColor: chartInfo.color,
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        }, {
            ...chartOptions,
            plugins: { ...chartOptions.plugins, title: { display: true, text: `${employeeName} - ${chartInfo.label}` } }
        });
    });
}

/**
 * Renders the performance feedback message based on total volume.
 */
function renderPerformanceFeedback(metrics) {
    const container = document.getElementById('performanceFeedbackContainer');
    if (!container) return;

    const targetTeams = [3, 4, 6];
    // *** MODIFICATION 1: Use the constant DAILY_TASK_TARGET (1800) ***
    const volumeThreshold = DAILY_TASK_TARGET; 
    
    // We check the AVERAGE daily volume for the selected period, not the total volume.
    const numberOfDays = metrics.dailyPerformance.length;
    const avgDailyVolume = numberOfDays > 0 ? metrics.totalVolume / numberOfDays : 0;

    const empName = metrics.employeeName !== 'N/A' ? metrics.employeeName : 'Employee';

    let message = '';
    let bgColor = 'bg-gray-100 text-gray-700 border-gray-400'; // Default neutral style
    
    // Check if an employee is selected/data exists
    if (metrics.empId === 'N/A' || metrics.totalVolume === 0) {
        message = 'Select an employee and upload data to view performance feedback.';
    } else if (targetTeams.includes(metrics.teamId)) {
        // Rule applies to Team 3, 4, or 6
        // *** MODIFICATION 2: Performance check against AVERAGE daily volume ***
        if (avgDailyVolume < volumeThreshold) {
            message = `Performance Review (Team ${metrics.teamId}): The employee's average daily task count is **${avgDailyVolume.toFixed(0).toLocaleString()}**, which is below the target of **${volumeThreshold.toLocaleString()}**. Focus on increasing daily volume across all task types.`;
            bgColor = 'bg-red-100 text-red-800 border-red-400'; // Needs Improvement
        } else {
            message = `Performance Review (Team ${metrics.teamId}): Excellent Job! The employee's average daily task count is **${avgDailyVolume.toFixed(0).toLocaleString()}**, meeting or exceeding the minimum target of **${volumeThreshold.toLocaleString()}**. Keep up the great work!`;
            bgColor = 'bg-green-100 text-green-800 border-green-400'; // Good Performance
        }
    } else {
        // Rule doesn't apply to other teams or team data is missing
        message = `Performance Review: Total tasks handled is ${metrics.totalVolume.toLocaleString()} over ${numberOfDays} day(s). Specific volume targets for Team ${metrics.teamId || 'N/A'} are not defined in this custom report.`;
        bgColor = 'bg-blue-100 text-blue-800 border-blue-400'; // Informational
    }
    
    container.className = `p-4 mt-4 mb-6 rounded-lg border-l-4 shadow-md ${bgColor}`;
    container.innerHTML = `<p class="font-semibold">${empName}:</p><p class="mt-1">${message}</p>`;
}


/**
 * Renders the detailed daily performance table.
 */
function renderEmployeeDailyTable(dailyPerformance, employeeName) {
    const container = document.getElementById('dailyDetailsContainer');
    const titleElement = document.getElementById('dailyDetailTitle');
    
    const tableId = 'employeeDailyTable';
    let existingTable = document.getElementById(tableId);

    if (dailyPerformance.length === 0) {
        titleElement.textContent = `No daily records found for ${employeeName} in the selected range.`;
        if (existingTable) existingTable.remove(); 
        return;
    }

    titleElement.textContent = `${employeeName}'s Daily Performance Records`;

    let tableHTML = `
        <table id="${tableId}" class="employee-daily-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Total Volume</th>
                    <th>Overall AHT (s)</th>
                    <th>Notif Volume</th>
                    <th>Notif AHT (s)</th>
                    <th>Room Volume</th>
                    <th>Room AHT (s)</th>
                    <th>Zone Volume</th>
                    <th>Zone AHT (s)</th>
                </tr>
            </thead>
            <tbody>
    `;

    dailyPerformance.forEach(day => {
        tableHTML += `
            <tr>
                <td>${day.date}</td>
                <td>${day.totalVolume.toLocaleString()}</td>
                <td>${day.overallAHT}</td>
                <td>${day.notifVolume.toLocaleString()}</td>
                <td>${day.notifAHT}</td>
                <td>${day.roomVolume.toLocaleString()}</td>
                <td>${day.roomAHT}</td>
                <td>${day.zoneVolume.toLocaleString()}</td>
                <td>${day.zoneAHT}</td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    
    if (existingTable) {
        existingTable.outerHTML = tableHTML;
    } else {
        container.insertAdjacentHTML('beforeend', tableHTML);
    }
}


function populateTLFilter(data) {
    const tlSet = new Set(data.map(item => item['TL']).filter(tl => tl)); 
    const filter = document.getElementById('tlFilter');
    const currentSelection = filter.value;
    
    filter.innerHTML = '<option value="all">All Team Leads</option>'; 
    tlSet.forEach(tl => {
        const option = document.createElement('option');
        option.value = tl;
        option.textContent = tl;
        filter.appendChild(option);
    });
    // Restore selection
    if (Array.from(tlSet).includes(currentSelection) || currentSelection === 'all') {
        filter.value = currentSelection;
    }
}

function populateEmployeeFilter(data) {
    // Unique key: Employee Name (EMP ID)
    const employeeMap = new Map();
    data.forEach(item => {
        const name = item['Employee Name'] ? item['Employee Name'].trim() : 'N/A';
        const id = item['EMP ID'] ? String(item['EMP ID']).trim() : 'N/A';
        // Only include records with a valid ID
        if (id !== 'N/A' && id.toUpperCase() !== '#N/A') {
            const key = `${name} (${id})`;
            // Store the ID as the value and the descriptive name as the key
            employeeMap.set(key, id); 
        }
    });
    
    const filter = document.getElementById('employeeFilter');
    const currentSelectionId = filter.value; // Store the ID
    
    filter.innerHTML = '<option value="none">Select Employee</option>'; 
    
    // Sort keys (descriptive names) alphabetically
    const sortedKeys = Array.from(employeeMap.keys()).sort();
    
    sortedKeys.forEach(key => {
        const id = employeeMap.get(key);
        const option = document.createElement('option');
        option.value = id; 
        option.textContent = key;
        filter.appendChild(option);
    });
    
    // Restore selection if the ID is still present
    if (Array.from(employeeMap.values()).includes(currentSelectionId)) {
        filter.value = currentSelectionId;
    }
}


function populateDateFilters(data) {
    const dateElements = data.map(item => parseDate(item['Date'])).filter(d => d && !isNaN(d));
    if (dateElements.length === 0) return;

    const minDate = new Date(Math.min(...dateElements));
    const maxDate = new Date(Math.max(...dateElements));

    // Only update if filters are empty
    if (!document.getElementById('startDateFilter').value) {
        document.getElementById('startDateFilter').value = formatDateForInput(minDate);
    }
    if (!document.getElementById('endDateFilter').value) {
        document.getElementById('endDateFilter').value = formatDateForInput(maxDate);
    }
}

// --- MAIN CONTROL FUNCTIONS ---

function renderDashboard() {
    const selectedEmpId = document.getElementById('employeeFilter').value;
    const selectedTL = document.getElementById('tlFilter').value;
    const startDateStr = document.getElementById('startDateFilter').value;
    const endDateStr = document.getElementById('endDateFilter').value;

    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;
    
    const startOfDay = (d) => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
    
    // 1. Filter Data by Date and TL
    let filteredData = rawData.filter(item => {
        const itemDate = parseDate(item['Date']);
        if (!itemDate || isNaN(itemDate)) return false; 

        const itemDateOnly = startOfDay(itemDate);
        
        let withinDate = true;
        if (startDate) {
            withinDate = itemDateOnly >= startOfDay(startDate);
        }
        if (endDate) {
            // Check against end date, setting time to end of day to include the full day
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            withinDate = withinDate && (itemDateOnly <= endOfDay);
        }

        let tlMatch = selectedTL === 'all' || item['TL'] === selectedTL;
        
        return withinDate && tlMatch;
    });

    // Repopulate the Employee filter after date/TL filtering to show only valid options
    populateEmployeeFilter(filteredData);
    
    // 2. Filter data down to the selected employee (using the selectedEmpId from the filter)
    let employeeData = filteredData;
    if (selectedEmpId !== 'none') {
         employeeData = filteredData.filter(item => String(item['EMP ID']).trim() === selectedEmpId);
    } else {
         // If no employee is selected, we show empty state
         employeeData = [];
    }

    // 3. Calculate Metrics for the selected employee
    const metrics = calculateEmployeeMetrics(employeeData);
    
    // 4. Update Visuals
    
    // Update dashboard title to show selected employee
    const dashboardTitle = document.getElementById('dashboardTitle');
    if (selectedEmpId !== 'none' && metrics.employeeName !== 'N/A') {
        dashboardTitle.innerHTML = `👤 ${metrics.employeeName} (${metrics.empId}) Performance & Progress`;
    } else {
        dashboardTitle.innerHTML = '👤 Individual Employee Performance & Progress';
    }

    updateKPIs(metrics);
    renderPerformanceFeedback(metrics); // NEW: Performance Feedback
    renderEmployeeTrends(metrics.dailyPerformance, metrics.employeeName);
    renderEmployeeDailyTable(metrics.dailyPerformance, metrics.employeeName);
}

/**
 * Handles Excel file upload and conversion to JSON using SheetJS.
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
            populateEmployeeFilter(rawData); 
            
            renderDashboard(); 

        } catch (error) {
            console.error("File processing error:", error);
            // Custom console log message (replacing alert)
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
     const emptyMetrics = calculateEmployeeMetrics([]);
     document.getElementById('dashboardTitle').innerHTML = '👤 Individual Employee Performance & Progress';
     updateKPIs(emptyMetrics);
     renderPerformanceFeedback(emptyMetrics);
     renderEmployeeTrends(emptyMetrics.dailyPerformance, emptyMetrics.employeeName);
     renderEmployeeDailyTable(emptyMetrics.dailyPerformance, emptyMetrics.employeeName);
});