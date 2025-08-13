# Warehouse Bin Management System

A comprehensive React-based warehouse bin management application with Firebase backend integration. This system implements smart bin allocation, real-time inventory tracking, and efficient picking/put-away operations.

## Features

### 🏭 Core Warehouse Operations
- **Smart Bin Allocation**: AI-powered bin suggestions based on SKU compatibility and space optimization
- **Real-time Inventory Tracking**: Live updates across all connected devices using Firebase
- **Bin-to-Bin Moves**: Streamlined inventory transfers with barcode scanning
- **Hierarchical Organization**: Warehouse → Zone → Bin structure

### 📱 Modern UI/UX
- **Material-UI Design**: Professional, responsive interface
- **DataGrid Integration**: Virtualized tables for handling 50,000+ bins
- **Barcode Scanner Ready**: HID keyboard input support for handheld scanners
- **Mobile Responsive**: Works on tablets and mobile devices

### 🔥 Firebase Integration
- **Real-time Synchronization**: Instant updates across multiple operators
- **Offline Support**: Local caching with sync when reconnected
- **Serverless Architecture**: No backend server required
- **Built-in Authentication**: User management and role-based access

## Technology Stack

- **Frontend**: React 19, Material-UI v7, React Hook Form
- **Backend**: Firebase (Firestore, Auth)
- **Data Grid**: MUI X DataGrid with virtualization
- **State Management**: React Context + Custom Hooks
- **Real-time**: Firebase onSnapshot subscriptions

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Firebase project with Firestore enabled

### Installation

1. **Clone and install dependencies**:
```bash
npm install
```

2. **Configure Firebase**:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore Database
   - Enable Authentication (optional)
   - Copy your Firebase config to `src/firebase.js`

3. **Start development server**:
```bash
npm start
```

The app will open at http://localhost:3000

## Firebase Setup

### 1. Firestore Database Structure
```
warehouses/
  {warehouseId}/
    bins/
      {binId}: {
        code: "A-02-3-05",
        zoneId: "A",
        capacity: 100,
        currentQty: 25,
        sku: "SKU123",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp
      }

inventory/
  {skuId}: {
    name: "Product Name",
    totalQty: 1000,
    binAllocations: {
      binId1: 25,
      binId2: 50
    }
  }
```

### 2. Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /warehouses/{warehouseId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 3. Firestore Indexes
Create composite indexes for optimal query performance:
- `bins`: `warehouseId` + `zoneId` + `status`
- `bins`: `warehouseId` + `sku` + `status`
- `bins`: `warehouseId` + `code`

## Key Components

### BinsList Component
- **Features**: Paginated data grid, real-time updates, advanced filtering
- **Performance**: Handles 50,000+ bins with virtualization
- **Actions**: Create, edit, delete bins with inline editing

### ReceiveGoods Component
- **Smart Allocation**: AI-powered bin suggestions
- **Priority Logic**:
  1. Same SKU with available capacity
  2. Optimal empty bin in preferred zone  
  3. Any available bin with sufficient space

### BinMove Component
- **Guided Workflow**: 4-step process with validation
- **Barcode Ready**: Supports handheld scanner input
- **Transaction Safety**: Atomic moves with rollback on failure

## API Services

### BinService
```javascript
// Real-time bin subscription
BinService.subscribeToBins(warehouseId, callback, filters)

// Smart allocation
BinService.suggestBin(warehouseId, sku, qty, preferredZone)

// Atomic moves with transaction
BinService.moveBin(warehouseId, fromBinId, toBinId, qty, sku)
```

### Custom Hooks
```javascript
// Real-time bin data
const { bins, loading, error } = useBins(warehouseId, filters)

// Bin operations
const { createBin, updateBin, moveBin } = useBinOperations(warehouseId)

// Smart suggestions
const { suggestion, getSuggestion } = useBinSuggestion()
```

## Performance Optimizations

### Frontend
- **Virtualized Grids**: Smooth scrolling with 50,000+ rows
- **Debounced Search**: <200ms response time for bin lookup
- **Optimistic Updates**: Immediate UI feedback
- **Code Splitting**: Lazy loading for faster initial load

### Firebase
- **Compound Indexes**: Optimized for common filter combinations
- **Pagination**: `startAfter()` cursor-based pagination
- **Batch Operations**: Bulk updates with `writeBatch()`
- **Real-time Subscriptions**: Targeted listeners to minimize data transfer

## Deployment

### Build for Production
```bash
npm run build
```

### Firebase Hosting (Recommended)
```bash
npm install -g firebase-tools
firebase init hosting
firebase deploy
```

### Other Platforms
The build folder can be deployed to any static hosting service (Netlify, Vercel, AWS S3, etc.)

## Advanced Features

### Barcode Integration
- **HID Keyboard Mode**: Works with standard handheld scanners
- **Camera Scanning**: Optional QR/barcode camera scanning
- **Auto-focus**: Invisible input fields for seamless scanning

### Role-based Access
```javascript
// Admin users
- Manage warehouse layout
- Create/delete bins
- Bulk operations

// Operators  
- Receive goods
- Move inventory
- View bin status
```

### Offline Support
- **Local Caching**: Firebase automatically caches data
- **Sync on Reconnect**: Queued operations replay when online
- **Conflict Resolution**: Last-write-wins with timestamp comparison

## Troubleshooting

### Common Issues

1. **Firebase Connection**:
   - Verify config in `src/firebase.js`
   - Check Firebase project permissions
   - Ensure Firestore is enabled

2. **Performance**:
   - Enable Firestore indexes for queries
   - Use pagination for large datasets
   - Monitor Firebase usage quotas

3. **Real-time Updates**:
   - Check network connectivity
   - Verify Firestore security rules
   - Monitor browser console for errors

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or support:
- Create an issue in the GitHub repository
- Check the Firebase documentation for backend-related questions
- Review Material-UI documentation for UI components

















in settings report generation
show all the report type and report scope.
every report type needed like this stockmovements(complete) and fullreport(all scope)











///Paper size 79mm length

stockmovements pick (-)
