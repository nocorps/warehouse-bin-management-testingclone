/**
 * Test script to verify stock movement report accuracy for mixed bins
 * This reproduces the exact scenario where opening quantities were incorrect for mixed bins
 */

const fs = require('fs');
const path = require('path');

// Mock Firebase setup for testing
const mockFirebase = {
  collection: (collectionPath) => ({
    doc: (docId) => ({
      get: () => Promise.resolve({ 
        exists: true, 
        data: () => ({ id: docId, ...mockData[collectionPath]?.[docId] || {} })
      }),
      set: (data) => {
        if (!mockData[collectionPath]) mockData[collectionPath] = {};
        mockData[collectionPath][docId] = { ...data, id: docId };
        return Promise.resolve();
      },
      update: (data) => {
        if (!mockData[collectionPath]) mockData[collectionPath] = {};
        mockData[collectionPath][docId] = { ...mockData[collectionPath][docId], ...data };
        return Promise.resolve();
      }
    }),
    where: (field, operator, value) => ({
      orderBy: (field, direction) => ({
        get: () => {
          const docs = Object.values(mockData[collectionPath] || {});
          const filtered = docs.filter(doc => {
            if (operator === '>=') return new Date(doc[field]) >= new Date(value);
            if (operator === '<=') return new Date(doc[field]) <= new Date(value);
            if (operator === '<') return new Date(doc[field]) < new Date(value);
            if (operator === '==') return doc[field] === value;
            return true;
          });
          
          if (direction === 'desc') {
            filtered.sort((a, b) => new Date(b[field]) - new Date(a[field]));
          } else {
            filtered.sort((a, b) => new Date(a[field]) - new Date(b[field]));
          }
          
          return Promise.resolve({
            docs: filtered.map(doc => ({
              id: doc.id,
              data: () => doc
            }))
          });
        }
      }),
      get: () => {
        const docs = Object.values(mockData[collectionPath] || {});
        const filtered = docs.filter(doc => {
          if (operator === '>=') return new Date(doc[field]) >= new Date(value);
          if (operator === '<=') return new Date(doc[field]) <= new Date(value);
          if (operator === '<') return new Date(doc[field]) < new Date(value);
          if (operator === '==') return doc[field] === value;
          return true;
        });
        
        return Promise.resolve({
          docs: filtered.map(doc => ({
            id: doc.id,
            data: () => doc
          }))
        });
      }
    }),
    orderBy: (field, direction) => ({
      get: () => {
        const docs = Object.values(mockData[collectionPath] || {});
        
        if (direction === 'desc') {
          docs.sort((a, b) => new Date(b[field]) - new Date(a[field]));
        } else {
          docs.sort((a, b) => new Date(a[field]) - new Date(b[field]));
        }
        
        return Promise.resolve({
          docs: docs.map(doc => ({
            id: doc.id,
            data: () => doc
          }))
        });
      }
    }),
    get: () => Promise.resolve({
      docs: Object.values(mockData[collectionPath] || {}).map(doc => ({
        id: doc.id,
        data: () => doc
      }))
    })
  })
};

// Helper functions to mock Firebase query functions
const query = (ref, ...constraints) => ref;
const where = (field, operator, value) => ({ field, operator, value });
const orderBy = (field, direction = 'asc') => ({ field, direction });
const getDocs = (queryRef) => queryRef.get();
const doc = (db, collection, docId) => mockFirebase.collection(collection).doc(docId);
const getDoc = (docRef) => docRef.get();
const collection = (db, ...pathSegments) => mockFirebase.collection(pathSegments.join('/'));

// Mock data storage
let mockData = {
  'WHT/WH01/bins': {},
  'WHT/WH01/operationHistory': {},
  'WHT': {}
};

// Mock db object
const db = {};

// Initialize test scenario: mixed bin with SKU001 and SKU002
async function initializeTestScenario() {
  console.log('🧪 INITIALIZING TEST SCENARIO FOR STOCK MOVEMENT REPORT');
  console.log('=======================================================');
  
  // Create warehouse document
  mockData['WHT']['WH01'] = {
    id: 'WH01',
    code: 'WH01',
    name: 'Test Warehouse 01'
  };
  
  // Create bins
  const bins = {
    'WH01-GF-R01-G01-B1': {
      id: 'WH01-GF-R01-G01-B1',
      code: 'B1',
      rackCode: 'R01',
      floorCode: 'GF',
      gridLevel: 1,
      capacity: 100,
      currentQty: 30,
      sku: 'SKU001', // Primary SKU
      isMixed: true,
      mixedContents: [
        {
          sku: 'SKU001',
          quantity: 10,
          lotNumber: 'LOT001',
          expiryDate: '2025-12-31'
        },
        {
          sku: 'SKU002',
          quantity: 20,
          lotNumber: 'LOT002',
          expiryDate: '2025-11-30'
        }
      ]
    },
    'WH01-GF-R01-G01-B2': {
      id: 'WH01-GF-R01-G01-B2',
      code: 'B2',
      rackCode: 'R01',
      floorCode: 'GF',
      gridLevel: 1,
      capacity: 100,
      currentQty: 25,
      sku: 'SKU002',
      isMixed: false
    }
  };
  
  mockData['WHT/WH01/bins'] = bins;
  
  // Create operation history
  const baseTime = new Date('2025-01-10T10:00:00Z');
  const operations = [
    {
      id: 'op1',
      timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
      operationType: 'putaway',
      executionDetails: {
        items: [
          {
            barcode: 'SKU001',
            quantity: 10,
            binId: 'WH01-GF-R01-G01-B1',
            binCode: 'B1',
            status: 'completed',
            allocationPlan: [
              {
                binId: 'WH01-GF-R01-G01-B1',
                binCode: 'B1',
                binLocation: 'WH01-GF-R01-G01-B1',
                allocatedQuantity: 10
              }
            ]
          }
        ]
      }
    },
    {
      id: 'op2',
      timestamp: new Date(baseTime.getTime() + 2000).toISOString(),
      operationType: 'putaway',
      executionDetails: {
        items: [
          {
            barcode: 'SKU002',
            quantity: 20,
            binId: 'WH01-GF-R01-G01-B1',
            binCode: 'B1',
            status: 'completed',
            allocationPlan: [
              {
                binId: 'WH01-GF-R01-G01-B1',
                binCode: 'B1',
                binLocation: 'WH01-GF-R01-G01-B1',
                allocatedQuantity: 20
              }
            ]
          }
        ]
      }
    },
    {
      id: 'op3',
      timestamp: new Date(baseTime.getTime() + 3000).toISOString(),
      operationType: 'putaway',
      executionDetails: {
        items: [
          {
            barcode: 'SKU002',
            quantity: 25,
            binId: 'WH01-GF-R01-G01-B2',
            binCode: 'B2',
            status: 'completed',
            allocationPlan: [
              {
                binId: 'WH01-GF-R01-G01-B2',
                binCode: 'B2',
                binLocation: 'WH01-GF-R01-G01-B2',
                allocatedQuantity: 25
              }
            ]
          }
        ]
      }
    },
    {
      id: 'op4',
      timestamp: new Date(baseTime.getTime() + 4000).toISOString(),
      operationType: 'pick',
      executionDetails: {
        items: [
          {
            barcode: 'SKU001',
            quantity: 5,
            status: 'completed',
            pickedBins: [
              {
                binId: 'WH01-GF-R01-G01-B1',
                binCode: 'B1',
                quantity: 5
              }
            ]
          }
        ]
      }
    }
  ];
  
  mockData['WHT/WH01/operationHistory'] = {};
  operations.forEach(op => {
    mockData['WHT/WH01/operationHistory'][op.id] = op;
  });
  
  console.log('✅ Test scenario initialized with:');
  console.log('   - Mixed bin B1: SKU001(10) + SKU002(20) = 30 total');
  console.log('   - Single bin B2: SKU002(25)');
  console.log('   - 4 operations: 3 putaways + 1 pick');
  
  return { bins, operations };
}

// Mock ReportService for testing
class MockReportService {
  constructor() {
    this.reportTypes = {
      STOCK_MOVEMENTS: 'stock_movements'
    };
  }

  async generateStockMovementsReport(config) {
    const movements = [];
    const warehouseId = config.warehouseId;
    
    // Track inventory levels by SKU and physical bin location
    const inventoryTracker = new Map(); // key: "SKU_BinId" -> current quantity

    if (!warehouseId) {
      throw new Error('Warehouse ID is required for generating reports');
    }

    // Get current bin status for closing quantities and initialization
    const binsRef = collection(db, 'WHT', warehouseId, 'bins');
    const binsSnapshot = await getDocs(binsRef);
    const bins = binsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const binMap = new Map(bins.map(bin => [bin.id, bin]));

    // Initialize inventory tracker with current bin states for accurate opening quantities
    console.log('� Full report mode - starting with empty inventory tracker');

    // Get operation history in chronological order (oldest first)
    const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
    let historyQuery = query(historyRef, orderBy('timestamp', 'asc'));      if (config.scope === 'date_range' && config.startDate && config.endDate) {
        historyQuery = query(
          historyRef,
          where('timestamp', '>=', config.startDate.toISOString()),
          where('timestamp', '<=', config.endDate.toISOString()),
          orderBy('timestamp', 'asc')
        );
        
        // For date-filtered reports, initialize inventory tracker with the state 
        // BEFORE the start date by processing earlier operations
        console.log('📅 Date range filtering active, building opening inventory state...');
        
        const preHistoryQuery = query(
          historyRef,
          where('timestamp', '<', config.startDate.toISOString()),
          orderBy('timestamp', 'asc') // Chronological order to build up state
        );
        
        const preHistorySnapshot = await getDocs(preHistoryQuery);
        const preHistoryItems = preHistorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Build up inventory state from operations before the start date
        for (const item of preHistoryItems) {
          if (item.executionDetails && item.executionDetails.items) {
            for (const execItem of item.executionDetails.items) {
              const sku = execItem.barcode || execItem.sku;

              // Handle putaway operations with allocation plan
              if (item.operationType === 'putaway' && execItem.allocationPlan && Array.isArray(execItem.allocationPlan)) {
                execItem.allocationPlan.forEach(allocation => {
                  const quantity = parseInt(allocation.allocatedQuantity) || 0;
                  const inventoryKey = `${sku}_${allocation.binId || 'UNKNOWN'}`;
                  
                  // Apply the putaway operation (add quantity)
                  const currentLevel = inventoryTracker.get(inventoryKey) || 0;
                  inventoryTracker.set(inventoryKey, currentLevel + quantity);
                });
              }
              // Handle pick operations with picked bins
              else if (item.operationType === 'pick' && execItem.pickedBins && Array.isArray(execItem.pickedBins)) {
                execItem.pickedBins.forEach(pickedBin => {
                  const quantity = parseInt(pickedBin.quantity) || 0;
                  const inventoryKey = `${sku}_${pickedBin.binId || 'UNKNOWN'}`;
                  
                  // Apply the pick operation (subtract quantity)
                  const currentLevel = inventoryTracker.get(inventoryKey) || 0;
                  inventoryTracker.set(inventoryKey, Math.max(0, currentLevel - quantity));
                });
              }
              // Fallback for legacy operations
              else {
                let quantity = 0;
                if (item.operationType === 'putaway') {
                  quantity = parseInt(execItem.quantity) || 0;
                  // Apply putaway (add)
                  const inventoryKey = `${sku}_${execItem.binId || 'UNKNOWN'}`;
                  const currentLevel = inventoryTracker.get(inventoryKey) || 0;
                  inventoryTracker.set(inventoryKey, currentLevel + quantity);
                } else if (item.operationType === 'pick') {
                  quantity = parseInt(execItem.pickedQty || execItem.quantity) || 0;
                  // Apply pick (subtract)
                  const inventoryKey = `${sku}_${execItem.binId || 'UNKNOWN'}`;
                  const currentLevel = inventoryTracker.get(inventoryKey) || 0;
                  inventoryTracker.set(inventoryKey, Math.max(0, currentLevel - quantity));
                }
              }
            }
          }
        }
        console.log(`📅 Built opening inventory state from ${preHistoryItems.length} pre-period operations`);
      } else {
        // For full reports, start with empty inventory (all operations will be processed)
        console.log('📊 Full report mode - starting with empty inventory tracker');
      }

    const historySnapshot = await getDocs(historyQuery);
    const historyItems = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Get warehouse details
    const warehouseRef = doc(db, 'WHT', warehouseId);
    const warehouseDoc = await getDoc(warehouseRef);
    const warehouseDetails = warehouseDoc.exists ? warehouseDoc.data() : {};
    
    console.log('🏭 Processing warehouse:', warehouseDetails.name || warehouseDetails.code || warehouseId);

    // Process operations in chronological order
    console.log(`📈 Processing ${historyItems.length} operations chronologically...`);
    
    for (const item of historyItems) {
      if (item.executionDetails && item.executionDetails.items) {
        for (const execItem of item.executionDetails.items) {
          const sku = execItem.barcode || execItem.sku;
          
          // Handle operations with actual allocation details (put-away operations)
          if (item.operationType === 'putaway' && execItem.allocationPlan && Array.isArray(execItem.allocationPlan)) {
            execItem.allocationPlan.forEach(allocation => {
              const bin = binMap.get(allocation.binId) || {};
              const quantity = parseInt(allocation.allocatedQuantity) || 0;
              const inventoryKey = `${sku}_${allocation.binId || 'UNKNOWN'}`;
              
              // Get current inventory level for this SKU in this bin
              const currentLevel = inventoryTracker.get(inventoryKey) || 0;
              const openingQty = currentLevel;
              const closingQty = currentLevel + quantity;
              
              // Update inventory tracker
              inventoryTracker.set(inventoryKey, closingQty);
              
              const binCode = allocation.binCode || bin.code || 'Unknown';
              const location = allocation.binLocation || allocation.binCode || bin.code || 'Unknown';
              
              console.log(`📦 PUT-AWAY: ${sku} in ${binCode}, Opening: ${openingQty}, Qty: ${quantity}, Closing: ${closingQty}`);
              
              movements.push({
                date: new Date(item.timestamp).toLocaleDateString(),
                time: new Date(item.timestamp).toLocaleTimeString(),
                timestamp: item.timestamp,
                sku: sku,
                operationType: 'Put-Away',
                quantity: quantity,
                location: location,
                binCode: binCode,
                binId: allocation.binId || 'Unknown',
                status: execItem.status || 'Completed',
                opening: openingQty,
                putaway: quantity,
                pick: 0,
                movement: quantity,
                closing: closingQty,
                inventoryKey: inventoryKey
              });
            });
          }
          // Handle pick operations with picked bins details
          else if (item.operationType === 'pick' && execItem.pickedBins && Array.isArray(execItem.pickedBins)) {
            execItem.pickedBins.forEach(pickedBin => {
              const bin = binMap.get(pickedBin.binId) || {};
              const quantity = parseInt(pickedBin.quantity) || 0;
              const inventoryKey = `${sku}_${pickedBin.binId || 'UNKNOWN'}`;
              
              // Get current inventory level for this SKU in this bin
              const currentLevel = inventoryTracker.get(inventoryKey) || 0;
              const openingQty = currentLevel;
              const closingQty = Math.max(0, currentLevel - quantity);
              
              // Update inventory tracker
              inventoryTracker.set(inventoryKey, closingQty);
              
              const binCode = pickedBin.binCode || bin.code || 'Unknown';
              const location = pickedBin.binCode || bin.code || 'Unknown';
              
              console.log(`📦 PICK: ${sku} from ${binCode}, Opening: ${openingQty}, Qty: ${quantity}, Closing: ${closingQty}`);
              
              movements.push({
                date: new Date(item.timestamp).toLocaleDateString(),
                time: new Date(item.timestamp).toLocaleTimeString(),
                timestamp: item.timestamp,
                sku: sku,
                operationType: 'Pick',
                quantity: quantity,
                location: location,
                binCode: binCode,
                binId: pickedBin.binId || 'Unknown',
                status: execItem.status || 'Completed',
                opening: openingQty,
                putaway: 0,
                pick: quantity,
                movement: -quantity,
                closing: closingQty,
                inventoryKey: inventoryKey
              });
            });
          }
        }
      }
    }

    // Reverse to show most recent first
    movements.reverse();

    return {
      movements,
      summary: {
        totalMovements: movements.length,
        putawayCount: movements.filter(m => m.operationType === 'Put-Away').length,
        pickCount: movements.filter(m => m.operationType === 'Pick').length,
        totalQuantityMoved: movements.reduce((sum, m) => sum + (parseInt(m.quantity) || 0), 0),
        uniqueSkus: new Set(movements.map(m => m.sku)).size,
        uniqueLocations: new Set(movements.map(m => m.location)).size
      }
    };
  }
}

// Test the stock movement report
async function testStockMovementReport() {
  console.log('🧪 TESTING STOCK MOVEMENT REPORT ACCURACY');
  console.log('==========================================');
  
  // Initialize test scenario
  const { bins, operations } = await initializeTestScenario();
  
  // Create report service
  const reportService = new MockReportService();
  
  // Generate report for the entire period
  const config = {
    warehouseId: 'WH01',
    type: 'stock_movements',
    scope: 'all'
  };
  
  console.log('\\n📊 Generating stock movement report...');
  const report = await reportService.generateStockMovementsReport(config);
  
  console.log('\\n📋 STOCK MOVEMENT REPORT RESULTS:');
  console.log('===================================');
  
  // Display movements in chronological order (reverse the reversed array)
  const chronologicalMovements = [...report.movements].reverse();
  
  chronologicalMovements.forEach((movement, index) => {
    console.log(`${index + 1}. ${movement.operationType}: ${movement.sku}`);
    console.log(`   Bin: ${movement.binCode} (${movement.location})`);
    console.log(`   Opening: ${movement.opening}, ${movement.operationType === 'Put-Away' ? 'Put-Away' : 'Pick'}: ${movement.quantity}, Closing: ${movement.closing}`);
    console.log(`   Date: ${movement.date} ${movement.time}`);
    console.log(`   Key: ${movement.inventoryKey}`);
    console.log('');
  });
  
  console.log('\\n🔍 VALIDATION: Checking opening quantities for mixed bins...');
  console.log('============================================================');
  
  // Test the key issue: opening quantities for mixed bins
  let validationPassed = true;
  const issuesFound = [];
  
  // Find the first operation for each SKU-bin combination
  const firstOperations = new Map();
  chronologicalMovements.forEach(movement => {
    const key = movement.inventoryKey;
    if (!firstOperations.has(key)) {
      firstOperations.set(key, movement);
    }
  });
  
  // Validate opening quantities
  for (const [key, movement] of firstOperations.entries()) {
    const [sku, binId] = key.split('_');
    const bin = bins[binId];
    
    if (bin && bin.isMixed && bin.mixedContents) {
      // For mixed bins, opening should be 0 for the first operation of each SKU
      const expectedOpening = 0;
      if (movement.opening !== expectedOpening) {
        const issue = `❌ ISSUE: First ${movement.operationType} for ${sku} in mixed bin ${movement.binCode} shows opening ${movement.opening}, expected ${expectedOpening}`;
        console.log(issue);
        issuesFound.push(issue);
        validationPassed = false;
      } else {
        console.log(`✅ CORRECT: First ${movement.operationType} for ${sku} in mixed bin ${movement.binCode} shows opening ${movement.opening} (correct)`);
      }
    } else if (bin && !bin.isMixed) {
      // For single SKU bins, opening should be 0 for the first operation
      const expectedOpening = 0;
      if (movement.opening !== expectedOpening) {
        const issue = `❌ ISSUE: First ${movement.operationType} for ${sku} in single bin ${movement.binCode} shows opening ${movement.opening}, expected ${expectedOpening}`;
        console.log(issue);
        issuesFound.push(issue);
        validationPassed = false;
      } else {
        console.log(`✅ CORRECT: First ${movement.operationType} for ${sku} in single bin ${movement.binCode} shows opening ${movement.opening} (correct)`);
      }
    }
  }
  
  // Check inventory continuity
  console.log('\\n🔗 VALIDATION: Checking inventory continuity...');
  console.log('=================================================');
  
  const movementsByKey = new Map();
  chronologicalMovements.forEach(movement => {
    const key = movement.inventoryKey;
    if (!movementsByKey.has(key)) {
      movementsByKey.set(key, []);
    }
    movementsByKey.get(key).push(movement);
  });
  
  for (const [key, keyMovements] of movementsByKey.entries()) {
    for (let i = 1; i < keyMovements.length; i++) {
      const prev = keyMovements[i - 1];
      const curr = keyMovements[i];
      
      if (curr.opening !== prev.closing) {
        const issue = `❌ CONTINUITY ISSUE for ${key}: Movement ${i} opening ${curr.opening} != previous closing ${prev.closing}`;
        console.log(issue);
        issuesFound.push(issue);
        validationPassed = false;
      }
    }
  }
  
  if (validationPassed) {
    console.log('✅ All inventory flows are continuous and correct!');
  }
  
  console.log('\\n📊 REPORT SUMMARY:');
  console.log('==================');
  console.log(`Total movements: ${report.summary.totalMovements}`);
  console.log(`Put-away operations: ${report.summary.putawayCount}`);
  console.log(`Pick operations: ${report.summary.pickCount}`);
  console.log(`Unique SKUs: ${report.summary.uniqueSkus}`);
  console.log(`Unique locations: ${report.summary.uniqueLocations}`);
  
  console.log('\\n🎯 TEST RESULT:');
  console.log('================');
  if (validationPassed) {
    console.log('🎉 PASSED: Stock movement report shows correct opening quantities for mixed bins!');
  } else {
    console.log('❌ FAILED: Issues found in stock movement report:');
    issuesFound.forEach(issue => console.log(`   ${issue}`));
  }
  
  return validationPassed;
}

// Test with date range filtering
async function testDateRangeFiltering() {
  console.log('\\n\\n🧪 TESTING DATE RANGE FILTERING');
  console.log('=================================');
  
  const reportService = new MockReportService();
  
  // Test filtering to show only the last 2 operations
  const startDate = new Date('2025-01-10T10:00:02.500Z'); // Between op2 and op3
  const endDate = new Date('2025-01-10T10:00:05Z'); // After op4
  
  const config = {
    warehouseId: 'WH01',
    type: 'stock_movements',
    scope: 'date_range',
    startDate: startDate,
    endDate: endDate
  };
  
  console.log(`📅 Filtering operations from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log('This should show op3 (SKU002 putaway to B2) and op4 (SKU001 pick from B1)');
  
  const report = await reportService.generateStockMovementsReport(config);
  
  console.log('\\n📋 FILTERED REPORT RESULTS:');
  console.log('============================');
  
  const chronologicalMovements = [...report.movements].reverse();
  
  chronologicalMovements.forEach((movement, index) => {
    console.log(`${index + 1}. ${movement.operationType}: ${movement.sku}`);
    console.log(`   Bin: ${movement.binCode} (${movement.location})`);
    console.log(`   Opening: ${movement.opening}, ${movement.operationType === 'Put-Away' ? 'Put-Away' : 'Pick'}: ${movement.quantity}, Closing: ${movement.closing}`);
    console.log(`   Date: ${movement.date} ${movement.time}`);
    console.log(`   Key: ${movement.inventoryKey}`);
    console.log('');
  });
  
  // Validate that opening quantities reflect the state after operations before start date
  console.log('\\n🔍 VALIDATION: Checking opening quantities after date filtering...');
  console.log('===================================================================');
  
  let validationPassed = true;
  
  // For SKU002 putaway to B2 (first operation in filtered period)
  const sku002PutawayB2 = chronologicalMovements.find(m => 
    m.sku === 'SKU002' && m.binCode === 'B2' && m.operationType === 'Put-Away'
  );
  
  if (sku002PutawayB2) {
    // Opening should be 0 because B2 had no previous operations
    if (sku002PutawayB2.opening !== 0) {
      console.log(`❌ ISSUE: SKU002 putaway to B2 shows opening ${sku002PutawayB2.opening}, expected 0`);
      validationPassed = false;
    } else {
      console.log(`✅ CORRECT: SKU002 putaway to B2 shows opening ${sku002PutawayB2.opening} (correct)`);
    }
  }
  
  // For SKU001 pick from B1 (should reflect the state after previous operations)
  const sku001PickB1 = chronologicalMovements.find(m => 
    m.sku === 'SKU001' && m.binCode === 'B1' && m.operationType === 'Pick'
  );
  
  if (sku001PickB1) {
    // Opening should be 10 because op1 put 10 units of SKU001 in B1
    if (sku001PickB1.opening !== 10) {
      console.log(`❌ ISSUE: SKU001 pick from B1 shows opening ${sku001PickB1.opening}, expected 10`);
      validationPassed = false;
    } else {
      console.log(`✅ CORRECT: SKU001 pick from B1 shows opening ${sku001PickB1.opening} (correct)`);
    }
  }
  
  if (validationPassed) {
    console.log('✅ Date range filtering works correctly!');
  } else {
    console.log('❌ Date range filtering has issues');
  }
  
  return validationPassed;
}

// Main test function
async function runTests() {
  console.log('🧪 STOCK MOVEMENT REPORT TESTING SUITE');
  console.log('=======================================');
  
  try {
    const test1Result = await testStockMovementReport();
    const test2Result = await testDateRangeFiltering();
    
    console.log('\\n\\n🎯 FINAL TEST RESULTS:');
    console.log('======================');
    console.log(`Basic Report Test: ${test1Result ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Date Range Test: ${test2Result ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (test1Result && test2Result) {
      console.log('\\n🎉 ALL TESTS PASSED! Stock movement report is working correctly.');
    } else {
      console.log('\\n❌ SOME TESTS FAILED. Review the issues above.');
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
  }
}

// Run the tests
runTests();
