let rawData = [];
let charts = {}; 

const chartOptions = {
    responsive: true,
    plugins: {
        legend: { position: 'top' },
        title: { display: false }
    },
    scales: {
        x: { ticks: { color: '#333' }, grid: { color: '#eee' } },
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
            empId: 'N/A'
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
    let empId = data[0]['EMP ID'] || 'N/A';
    
    const dailyPerformanceMap = new Map();

    data.forEach(item => {
        const dateKey = item['Date'];
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
        empId
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
 * Renders the daily trend charts for Volume and AHT.
 */
function renderEmployeeTrends(dailyPerformance, employeeName) {
    const dates = dailyPerformance.map(d => d.date);
    const volumes = dailyPerformance.map(d => d.totalVolume);
    const ahts = dailyPerformance.map(d => parseFloat(d.overallAHT));
    
    const trendCharts = [
        { id: 'volumeTrendChart', messageId: 'volumeTrendMessage', title: 'Daily Volume Trend', data: volumes, label: 'Total Volume', color: '#007bff' },
        { id: 'ahtTrendChart', messageId: 'ahtTrendMessage', title: 'Daily Overall AHT Trend (s)', data: ahts, label: 'Overall AHT (s)', color: '#dc3545' }
    ];

    trendCharts.forEach(chartInfo => {
        const canvas = document.getElementById(chartInfo.id);
        const message = document.getElementById(chartInfo.messageId);
        
        // Hide message, show canvas
        if (message) message.style.display = 'none';
        if (canvas) canvas.style.display = 'block';

        if (dailyPerformance.length === 0) {
            // Show message, hide canvas
            if (message) message.style.display = 'block';
            if (canvas) canvas.style.display = 'none';
            return;
        }

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
 * Renders the detailed daily performance table.
 */
function renderEmployeeDailyTable(dailyPerformance, employeeName) {
    const container = document.getElementById('dailyDetailsContainer');
    const titleElement = document.getElementById('dailyDetailTitle');
    
    if (dailyPerformance.length === 0) {
        titleElement.textContent = `No daily records found for ${employeeName} in the selected range.`;
        container.querySelector('.employee-daily-table')?.remove(); 
        return;
    }

    titleElement.textContent = `${employeeName}'s Daily Performance Records`;

    let tableHTML = `
        <table class="employee-daily-table" style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
                <tr style="background-color: #001f3f; color: white;">
                    <th>Date</th>
                    <th>Total Task</th>
                    <th>Overall AHT (s)</th>
                    <th>Notification</th>
                    <th>Notif AHT (s)</th>
                    <th>Room Status</th>
                    <th>Room AHT (s)</th>
                    <th>Zone Event</th>
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
    
    let existingTable = container.querySelector('.employee-daily-table');
    if (existingTable) {
        existingTable.outerHTML = tableHTML;
    } else {
        container.insertAdjacentHTML('beforeend', tableHTML);
    }
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

function populateEmployeeFilter(data) {
    // Unique key: Employee Name (EMP ID)
    const employeeMap = new Map();
    data.forEach(item => {
        const name = item['Employee Name'] ? item['Employee Name'].trim() : 'N/A';
        const id = item['EMP ID'] ? item['EMP ID'].trim() : 'N/A';
        // Only include records with a valid ID
        if (id !== 'N/A' && id.toUpperCase() !== '#N/A') {
            const key = `${name} (${id})`;
            employeeMap.set(key, id);
        }
    });
    
    const filter = document.getElementById('employeeFilter');
    const currentSelection = filter.value;
    
    filter.innerHTML = '<option value="none">Select Employee</option>'; 
    
    // Sort keys alphabetically
    const sortedKeys = Array.from(employeeMap.keys()).sort();
    
    sortedKeys.forEach(key => {
        const id = employeeMap.get(key);
        const option = document.createElement('option');
        // We use the ID as the value for filtering
        option.value = id; 
        option.textContent = key;
        filter.appendChild(option);
    });
    
    // Restore selection if it still exists
    if (employeeMap.has(currentSelection)) {
        filter.value = currentSelection;
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
            withinDate = withinDate && (itemDateOnly <= startOfDay(endDate));
        }

        let tlMatch = selectedTL === 'all' || item['TL'] === selectedTL;
        
        return withinDate && tlMatch;
    });

    // We must repopulate the Employee filter after date/TL filtering to show only valid options
    // This allows the employee filter to drive the final view
    populateEmployeeFilter(filteredData);
    
    // 2. Filter data down to the selected employee (using the selectedEmpId from the filter)
    let employeeData = filteredData;
    if (selectedEmpId !== 'none') {
         employeeData = filteredData.filter(item => item['EMP ID'] === selectedEmpId);
    } else {
         // If no employee is selected, we show empty state
         employeeData = [];
    }

    // 3. Calculate Metrics for the selected employee
    const metrics = calculateEmployeeMetrics(employeeData);
    
    // 4. Update Visuals
    
    // Update dashboard title to show selected employee
    const dashboardTitle = document.querySelector('.dashboard-container h1');
    if (selectedEmpId !== 'none' && metrics.employeeName !== 'N/A') {
        dashboardTitle.innerHTML = `👤 ${metrics.employeeName} (${metrics.empId}) Performance & Progress`;
    } else {
        dashboardTitle.innerHTML = '👤 Individual Employee Performance & Progress';
    }

    updateKPIs(metrics);
    renderEmployeeTrends(metrics.dailyPerformance, metrics.employeeName);
    renderEmployeeDailyTable(metrics.dailyPerformance, metrics.employeeName);
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
            
            // Populate filters based on ALL raw data initially
            populateDateFilters(rawData);
            populateTLFilter(rawData);
            populateEmployeeFilter(rawData);
            
            renderDashboard(); 
        } catch (error) {
            console.error("File parsing error:", error, "Text snippet (first 500 chars):", jsonText.substring(0, 500));
            alert('Error parsing JSON file. Please ensure the file is a valid JSON array.');
            rawData = []; 
            renderDashboard(); 
        }
    };
    reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
     // Initial render with empty data
     const emptyMetrics = calculateEmployeeMetrics([]);
     updateKPIs(emptyMetrics);
     renderEmployeeTrends(emptyMetrics.dailyPerformance, emptyMetrics.employeeName);
     renderEmployeeDailyTable(emptyMetrics.dailyPerformance, emptyMetrics.employeeName);
});