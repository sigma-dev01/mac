/**
 * MAC Address Logger
 * This script interacts with the Node.js backend to gather real network information
 * including MAC addresses and system details, and provides functionality to save this data as a JSON file.
 */

// Main data object to store all collected information
let networkData = {
    timestamp: new Date().toISOString(),
    systemInfo: {
        hostname: null,
        platform: null,
        architecture: null,
        cpuModel: null,
        cpuCores: null,
        totalMemory: null,
        freeMemory: null,
        uptime: null,
        osVersion: null,
        username: null,
        diskInfo: null
    },
    deviceInfo: {
        interfaces: []
    },
    routerInfo: {
        macAddress: null,
        ipAddress: null,
        manufacturer: null
    },
    portScan: {
        localPorts: [],
        routerPorts: [],
        scanTime: null
    },
    logHistory: []
};

// DOM elements - will be initialized after DOM loads
let systemInfoElement;
let deviceInfoElement;
let routerInfoElement;
let softwareListElement;
let portScanResultsElement;
let logHistoryElement;
let statusElement;
let downloadButton;
let scanButton;
let viewLogsButton;
let logsModal;
let logsListElement;
let logDetailsContentElement;
let modalCloseButton;

/**
 * Initialize the application
 */
function init() {
    // Initialize DOM elements
    deviceInfoElement = document.getElementById('interfaceList');
    routerInfoElement = document.getElementById('routerInfo');
    systemInfoElement = document.getElementById('systemInfo');
    portScanResultsElement = document.getElementById('portScanResults');
    logHistoryElement = document.getElementById('logHistory');
    statusElement = document.getElementById('status');
    scanButton = document.getElementById('scanBtn');
    viewLogsButton = document.getElementById('viewLogsBtn');
    downloadButton = document.getElementById('downloadBtn');
    logsModal = document.getElementById('logsModal');
    logsListElement = document.getElementById('logsList');
    logDetailsContentElement = document.getElementById('logContent');
    modalCloseButton = document.querySelector('.close');
    
    // Set up event listeners
    setupEventListeners();
    
    // Automatically start the logger when the page loads - ONE TIME ONLY
    statusElement.textContent = 'Scanning network interfaces and router information...';
    logEvent('Scan started on page load');
    
    // Disable scan button during scan
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';
    
    // Start the network scan automatically once
    fetchNetworkInfo().finally(() => {
        // Re-enable scan button after scan completes
        scanButton.disabled = false;
        scanButton.textContent = 'Scan Network';
        statusElement.textContent = 'Scan completed. Click "Scan Network" to scan again.';
    });
}

/**
 * Display system information
 * @param {Object} sysInfo - System information object
 */
function displaySystemInfo(sysInfo) {
    if (!sysInfo || !sysInfo.hostname) {
        systemInfoElement.innerHTML = '<p>No system information available.</p>';
        return;
    }
    
    let html = '<div class="system-info-grid">';
    html += `
        <div class="info-section">
            <h3>Hardware</h3>
            <ul>
                <li><strong>Hostname:</strong> ${sysInfo.hostname}</li>
                <li><strong>CPU:</strong> ${sysInfo.cpuModel}</li>
                <li><strong>CPU Cores:</strong> ${sysInfo.cpuCores}</li>
                <li><strong>Architecture:</strong> ${sysInfo.architecture}</li>
                <li><strong>Total Memory:</strong> ${sysInfo.totalMemory}</li>
                <li><strong>Free Memory:</strong> ${sysInfo.freeMemory}</li>
            </ul>
        </div>
        <div class="info-section">
            <h3>Operating System</h3>
            <ul>
                <li><strong>Platform:</strong> ${sysInfo.platform}</li>
                <li><strong>OS Version:</strong> ${sysInfo.osVersion.replace(/\n/g, '<br>')}</li>
                <li><strong>Username:</strong> ${sysInfo.username}</li>
                <li><strong>Uptime:</strong> ${sysInfo.uptime}</li>
            </ul>
        </div>
    `;
    
    if (sysInfo.diskInfo) {
        html += `
            <div class="info-section full-width">
                <h3>Disk Information</h3>
                <pre>${sysInfo.diskInfo}</pre>
            </div>
        `;
    }
    
    // CPU info
    html += `
        <div class="info-item">
            <span class="info-label">CPU Model:</span>
            <span class="info-value">${sysInfo.cpuModel || 'Unknown'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">CPU Cores:</span>
            <span class="info-value">${sysInfo.cpuCores || 'Unknown'}</span>
        </div>
    `;
    
    // Memory info
    html += `
        <div class="info-item">
            <span class="info-label">Total Memory:</span>
            <span class="info-value">${sysInfo.totalMemory || 'Unknown'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Free Memory:</span>
            <span class="info-value">${sysInfo.freeMemory || 'Unknown'}</span>
        </div>
    `;
    
    // OS info
    html += `
        <div class="info-item">
            <span class="info-label">OS Version:</span>
            <span class="info-value">${sysInfo.osVersion || 'Unknown'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Uptime:</span>
            <span class="info-value">${sysInfo.uptime || 'Unknown'}</span>
        </div>
    `;
    
    // Hardware IDs
    html += `
        <div class="info-item">
            <span class="info-label">Hardware ID:</span>
            <span class="info-value">${sysInfo.hardwareId || 'Unknown'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">BIOS ID:</span>
            <span class="info-value">${sysInfo.biosId || 'Unknown'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Disk ID:</span>
            <span class="info-value">${sysInfo.diskId || 'Unknown'}</span>
        </div>
    `;
    
    html += '</div>';
    
    // Disk info (if available)
    if (sysInfo.diskInfo && sysInfo.diskInfo !== 'Unknown') {
        html += '<div class="disk-info">';
        html += '<h3>Disk Information</h3>';
        html += `<pre>${sysInfo.diskInfo}</pre>`;
        html += '</div>';
    }
    
    systemInfoElement.innerHTML = html;
}

/**
 * Display device interfaces information
 * @param {Array} interfaces - Array of network interfaces
 */
function displayDeviceInfo(interfaces) {
    if (!interfaces || interfaces.length === 0) {
        deviceInfoElement.innerHTML = '<p>No network interfaces detected.</p>';
        return;
    }
    
    let html = '<div class="interface-grid">';
    
    interfaces.forEach(iface => {
        html += `
            <div class="interface-item">
                <h3>${iface.name}</h3>
                <ul>
                    <li><strong>MAC Address:</strong> ${iface.mac}</li>
                    <li><strong>IP Address:</strong> ${iface.ip}</li>
                    <li><strong>Vendor:</strong> ${iface.vendor}</li>
                    <li><strong>Type:</strong> ${iface.type}</li>
                </ul>
            </div>
        `;
    });
    
    html += '</div>';
    deviceInfoElement.innerHTML = html;
}

/**
 * Display router information
 */
function displayRouterInfo(router) {
    if (!router || !router.macAddress) {
        routerInfoElement.innerHTML = '<p>No router information detected. Try scanning again.</p>';
        return;
    }
    
    const routerHTML = `
        <div class="info-row">
            <span class="info-label">Router IP:</span>
            <span class="info-value">${router.ipAddress}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Router MAC:</span>
            <span class="info-value">${router.macAddress}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Manufacturer:</span>
            <span class="info-value">${router.manufacturer}</span>
        </div>
    `;
    
    routerInfoElement.innerHTML = routerHTML;
}

// Software display function removed as it's no longer needed

/**
 * Display port scan results
 * @param {Object} portScan - Port scan results object
 */
function displayPortScanResults(portScan) {
    if (!portScan || (!portScan.localPorts.length && !portScan.routerPorts.length)) {
        portScanResultsElement.innerHTML = '<p>No port scan results available.</p>';
        return;
    }

    let html = '<div class="port-scan-results">';
    
    // Display scan time if available
    if (portScan.scanTime) {
        html += `<p>Scan completed in ${(portScan.scanTime / 1000).toFixed(2)} seconds</p>`;
    }
    
    // Local ports section
    html += '<div class="port-group">';
    html += '<h3>Local System Open Ports</h3>';
    
    if (portScan.localPorts.length === 0) {
        html += '<p>No open ports detected on local system.</p>';
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>Port</th>
                        <th>Service</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Sort ports numerically
        const sortedLocalPorts = [...portScan.localPorts].sort((a, b) => a.port - b.port);
        
        sortedLocalPorts.forEach(port => {
            html += `
                <tr>
                    <td class="port-open">${port.port}</td>
                    <td>${port.service || 'Unknown'}</td>
                    <td>${port.status}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
    }
    html += '</div>'; // End local ports group
    
    // Router ports section
    html += '<div class="port-group">';
    html += '<h3>Router Open Ports</h3>';
    
    if (portScan.routerPorts.length === 0) {
        html += '<p>No open ports detected on router.</p>';
    } else {
        html += `
            <table>
                <thead>
                    <tr>
                        <th>Port</th>
                        <th>Service</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Sort ports numerically
        const sortedRouterPorts = [...portScan.routerPorts].sort((a, b) => a.port - b.port);
        
        sortedRouterPorts.forEach(port => {
            html += `
                <tr>
                    <td class="port-open">${port.port}</td>
                    <td>${port.service || 'Unknown'}</td>
                    <td>${port.status}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
    }
    html += '</div>'; // End router ports group
    
    html += '</div>'; // End port scan results
    portScanResultsElement.innerHTML = html;
}

/**
 * Display log history
 */
function displayLogHistory(logs) {
    if (!logs || logs.length === 0) {
        logHistoryElement.innerHTML = '<p>No log entries yet...</p>';
        return;
    }
    
    let logsHTML = '';
    logs.forEach(log => {
        const date = new Date(log.timestamp);
        const formattedTime = date.toLocaleTimeString();
        
        logsHTML += `
            <div class="log-entry">
                <span class="log-time">[${formattedTime}]</span>
                <span class="log-message">${log.message}</span>
            </div>
        `;
    });
    
    logHistoryElement.innerHTML = logsHTML;
}

/**
 * Fetch network information from the server
 */
async function fetchNetworkInfo() {
    try {
        deviceInfoElement.innerHTML = '<p class="loading">Scanning network interfaces...</p>';
        routerInfoElement.innerHTML = '<p class="loading">Detecting router information...</p>';
        logHistoryElement.innerHTML = '<p class="loading">Loading logs...</p>';
        systemInfoElement.innerHTML = '<p class="loading">Loading system information...</p>';
        portScanResultsElement.innerHTML = '<p class="loading">Scanning for open ports...</p>';
        
        const response = await fetch('/api/network-info');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        networkData = await response.json();
        
        // Update UI with the fetched data
        displaySystemInfo(networkData.systemInfo);
        displayDeviceInfo(networkData.deviceInfo.interfaces);
        displayRouterInfo(networkData.routerInfo);
        displayPortScanResults(networkData.portScan);
        displayLogHistory(networkData.logHistory);
        
        return networkData;
    } catch (error) {
        console.error('Error fetching network info:', error);
        deviceInfoElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        routerInfoElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        logHistoryElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        
        // Server connection error is already shown in the UI elements above
        console.log("Server connection error:", {
            error: error.message,
            tip: "Make sure the Node.js server is running. Run 'npm install' and then 'npm start' in the project directory."
        });
    }
}

/**
 * Fetch previous logs from the server
 */
async function fetchLogs() {
    try {
        logsListElement.innerHTML = '<p class="loading">Loading logs...</p>';
        
        const response = await fetch('/api/logs');
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const logs = await response.json();
        
        if (logs.length === 0) {
            logsListElement.innerHTML = '<p>No logs found.</p>';
            return;
        }
        
        let logsHTML = '';
        logs.forEach(log => {
            const date = new Date(log.created);
            const formattedDate = date.toLocaleString();
            
            logsHTML += `
                <div class="log-file-item" data-filename="${log.name}">
                    <div>${log.name}</div>
                    <div><small>${formattedDate}</small></div>
                </div>
            `;
        });
        
        logsListElement.innerHTML = logsHTML;
        
        // Add event listeners to log items
        document.querySelectorAll('.log-file-item').forEach(item => {
            item.addEventListener('click', () => {
                const filename = item.getAttribute('data-filename');
                fetchLogDetails(filename);
            });
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        logsListElement.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

/**
 * Fetch details of a specific log
 */
async function fetchLogDetails(filename) {
    try {
        logDetailsContentElement.textContent = 'Loading log details...';
        
        const response = await fetch(`/api/logs/${filename}`);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const logData = await response.json();
        logDetailsContentElement.textContent = JSON.stringify(logData, null, 2);
    } catch (error) {
        console.error('Error fetching log details:', error);
        logDetailsContentElement.textContent = `Error: ${error.message}`;
    }
}

/**
 * Log an event to the history
 */
function logEvent(message) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        message: message
    };
    
    if (!networkData.logHistory) {
        networkData.logHistory = [];
    }
    
    networkData.logHistory.push(logEntry);
    displayLogHistory(networkData.logHistory);
}

/**
 * Display the log data in the UI
 */
function displayLogData() {
    const formattedData = JSON.stringify(networkData, null, 2);
    logContentElement.textContent = formattedData;
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Scan network button
    scanButton.addEventListener('click', async () => {
        try {
            scanButton.disabled = true;
            scanButton.textContent = 'Scanning...';
            await fetchNetworkInfo();
        } finally {
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Network';
        }
    });
    
    // View logs button
    viewLogsButton.addEventListener('click', () => {
        logsModal.style.display = 'block';
        fetchLogs();
    });
    
    // Modal close button
    modalCloseButton.addEventListener('click', () => {
        logsModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === logsModal) {
            logsModal.style.display = 'none';
        }
    });
    
    // Download button
    downloadButton.addEventListener('click', downloadLogData);
}

/**
 * Download the log data as a JSON file
 */
function downloadLogData() {
    const dataStr = JSON.stringify(networkData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(dataBlob);
    downloadLink.download = `mac-address-log-${new Date().toISOString().slice(0,10)}.json`;
    downloadLink.click();
    
    logEvent("Log data downloaded");
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);
