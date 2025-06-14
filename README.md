# MAC Address Logger

A Node.js-based tool for logging real MAC addresses of network devices and routers.

## Features

- Detects and displays real network interfaces with their MAC addresses
- Identifies router information including MAC address and manufacturer
- Logs all network scans and activities
- Stores logs in JSON format for future reference
- Provides a web interface to view and download collected data

## Requirements

- Node.js (v12 or higher)
- npm (Node Package Manager)

## Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:

```
npm install
```

## How to Use

1. Start the server:

```
npm start
```

2. Open your web browser and navigate to: `http://localhost:3000`
3. Click the "Scan Network" button to detect network interfaces and router information
4. View previous logs by clicking the "View Previous Logs" button
5. Download the current log data as a JSON file using the "Download Current Log as JSON" button

## How It Works

This application uses a Node.js server with the following packages:

- `express`: Web server framework
- `network`: For detecting network interfaces
- `default-gateway`: For finding the default gateway (router)
- `arp-a`: For querying the ARP table to find MAC addresses

The server provides the following API endpoints:

- `GET /api/network-info`: Scans the network and returns interface and router information
- `GET /api/logs`: Returns a list of all saved logs
- `GET /api/logs/:filename`: Returns the content of a specific log file

## Sample JSON Output

The application generates a JSON structure like this:

```json
{
  "timestamp": "2025-06-13T14:42:02.000Z",
  "deviceInfo": {
    "interfaces": [
      {
        "name": "Wi-Fi",
        "ip": "192.168.1.5",
        "mac": "AA:BB:CC:DD:EE:FF",
        "vendor": "Intel Corporate",
        "type": "wireless"
      },
      {
        "name": "Ethernet",
        "ip": "192.168.1.6",
        "mac": "11:22:33:44:55:66",
        "vendor": "Realtek",
        "type": "wired"
      }
    ]
  },
  "routerInfo": {
    "macAddress": "AA:BB:CC:11:22:33",
    "ipAddress": "192.168.1.1",
    "manufacturer": "NETGEAR"
  },
  "logHistory": [
    {
      "timestamp": "2025-06-13T14:42:05.000Z",
      "message": "Found 2 network interfaces"
    },
    {
      "timestamp": "2025-06-13T14:42:06.000Z",
      "message": "Router detected: IP=192.168.1.1, MAC=AA:BB:CC:11:22:33, Vendor=NETGEAR"
    }
  ]
}
```

## Troubleshooting

- **Error connecting to server**: Make sure the Node.js server is running with `npm start`
- **No network interfaces detected**: The application requires administrator/root privileges on some systems
- **Router MAC not detected**: Try running the application with elevated privileges

## Note on Permissions

This application requires appropriate system permissions to access network interface information and ARP tables. On some systems, you may need to run it with administrator/root privileges for full functionality.
