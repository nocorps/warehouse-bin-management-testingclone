/**
 * Test script to reproduce and debug inventory calculation issues
 * This script simulates putaway followed by pick operations using the same data
 * to verify that inventory calculations are correct and no phantom quantities remain
 */

const fs = require('fs');
const path = require('path');

// Mock Firebase functions for testing
const mockFirebase = {
  collection: (path) => ({
    doc: (id) => ({
      get: () => Promise.resolve({ 
        exists: true, 
        data: () => ({ id, ...mockData[path]?.[id] || {} })
      }),
      set: (data) => {
        if (!mockData[path]) mockData[path] = {};
        mockData[path][id] = { ...data, id };
        console.log(`📝 SET ${path}/${id}:`, data);
        return Promise.resolve();
      },
      update: (data) => {
        if (!mockData[path]) mockData[path] = {};
        mockData[path][id] = { ...mockData[path][id], ...data };
        console.log(`📝 UPDATE ${path}/${id}:`, data);
        return Promise.resolve();
      }
    }),
    where: () => ({
      get: () => Promise.resolve({
        docs: Object.values(mockData[path] || {}).map(doc => ({
          id: doc.id,
          data: () => doc
        }))
      })
    })
  })
};

// Mock data storage
let mockData = {
  bins: {},
  putAwayTasks: {},
  pickTasks: {}
};

// Initialize test warehouse with bins
function initializeTestWarehouse() {
  console.log('🏭 Initializing test warehouse...');
  
  // Create test bins
  const testBins = [
    {
      id: 'bin1',
      code: 'WH1-GF-R01-G01-A1',
      capacity: 100,
      currentQty: 0,
      status: 'available',
      sku: null,
      lotNumber: null,
      expiryDate: null,
      mixedContents: null
    },
    {
      id: 'bin2',
      code: 'WH1-GF-R01-G01-A2',
      capacity: 100,
      currentQty: 0,
      status: 'available',
      sku: null,
      lotNumber: null,
      expiryDate: null,
      mixedContents: null
    },
    {
      id: 'bin3',
      code: 'WH1-GF-R01-G01-B1',
      capacity: 100,
      currentQty: 0,
      status: 'available',
      sku: null,
      lotNumber: null,
      expiryDate: null,
      mixedContents: null
    }
  ];

  testBins.forEach(bin => {
    mockData.bins[bin.id] = bin;
  });

  console.log('✅ Test warehouse initialized with', testBins.length, 'bins');
}

// Test data that simulates putaway-template.xlsx content
const testInventoryData = [
  { sku: 'SKU001', quantity: 50, lotNumber: 'LOT001', expiryDate: '2025-12-31' },
  { sku: 'SKU002', quantity: 30, lotNumber: 'LOT002', expiryDate: '2025-11-30' },
  { sku: 'SKU003', quantity: 25, lotNumber: 'LOT003', expiryDate: '2025-10-31' },
  { sku: 'SKU001', quantity: 20, lotNumber: 'LOT004', expiryDate: '2025-09-30' }, // Mixed bin scenario
];

// Enhanced test data that reproduces the specific mixed bin issue from logs
const mixedBinScenarioData = [
  // Create bins with multiple SKUs that will create the exact scenario from the logs
  { sku: 'SKU001', quantity: 10, lotNumber: 'LOT001', expiryDate: '2025-12-31', binTarget: 'bin1' },
  { sku: 'SKU002', quantity: 10, lotNumber: 'LOT002', expiryDate: '2025-11-30', binTarget: 'bin2' },
  { sku: 'SKU003', quantity: 8, lotNumber: 'LOT003', expiryDate: '2025-10-31', binTarget: 'bin2' }, // Mixed with SKU002
  { sku: 'SKU004', quantity: 10, lotNumber: 'LOT004', expiryDate: '2025-09-30', binTarget: 'bin3' },
  { sku: 'SKU005', quantity: 5, lotNumber: 'LOT005', expiryDate: '2025-08-31', binTarget: 'bin3' }, // Mixed with SKU004
  { sku: 'SKU006', quantity: 2, lotNumber: 'LOT006', expiryDate: '2025-07-31', binTarget: 'bin3' }, // Triple mixed
  { sku: 'SKU007', quantity: 7, lotNumber: 'LOT007', expiryDate: '2025-06-30', binTarget: 'bin3' }, // Quad mixed
];

// Pick operations that will expose the inventory calculation issues
const problematicPickSequence = [
  { sku: 'SKU001', quantity: 6 },  // Should pick from bin1, reducing it to 4
  { sku: 'SKU002', quantity: 8 },  // Should pick from bin2, but this will affect SKU003 availability
  { sku: 'SKU003', quantity: 8 },  // This should fail if SKU002 pick affected the mixed bin incorrectly
  { sku: 'SKU004', quantity: 5 },  // Should pick from bin3, but this will affect other SKUs in same bin
  { sku: 'SKU005', quantity: 5 },  // This should fail if previous pick calculation was wrong
  { sku: 'SKU006', quantity: 2 },  // Should work if mixed bin calculations are correct
  { sku: 'SKU007', quantity: 7 },  // Should work if mixed bin calculations are correct
];

// Simulate putaway operations
async function simulatePutaway(inventoryData) {
  console.log('\n🔄 Starting PUTAWAY operations...');
  
  for (let i = 0; i < inventoryData.length; i++) {
    const item = inventoryData[i];
    const binId = `bin${(i % 3) + 1}`; // Distribute across 3 bins
    const bin = mockData.bins[binId];
    
    console.log(`\n📦 Putaway ${i + 1}: ${item.sku} qty:${item.quantity} → ${bin.code}`);
    
    // Current bin state
    const currentQty = bin.currentQty || 0;
    const newTotalQty = currentQty + item.quantity;
    
    console.log(`  Before: currentQty=${currentQty}, mixedContents=${bin.mixedContents ? JSON.stringify(bin.mixedContents) : 'null'}`);
    
    // Update bin using putaway logic
    if (currentQty === 0) {
      // New placement
      bin.currentQty = newTotalQty;
      bin.status = 'occupied';
      bin.sku = item.sku;
      bin.lotNumber = item.lotNumber;
      bin.expiryDate = item.expiryDate;
      bin.mixedContents = null;
      console.log(`  ✅ NEW_PLACEMENT: Set bin to ${item.sku} qty:${newTotalQty}`);
    } else if (bin.sku === item.sku) {
      // Same SKU consolidation
      bin.currentQty = newTotalQty;
      console.log(`  ✅ SAME_SKU_CONSOLIDATION: Updated qty from ${currentQty} to ${newTotalQty}`);
    } else {
      // Mixed SKU storage
      if (!bin.mixedContents) {
        // Initialize mixed contents
        bin.mixedContents = [
          {
            sku: bin.sku,
            quantity: currentQty,
            lotNumber: bin.lotNumber,
            expiryDate: bin.expiryDate
          },
          {
            sku: item.sku,
            quantity: item.quantity,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate
          }
        ];
      } else {
        // Add to existing mixed contents
        const existingContent = bin.mixedContents.find(content => 
          content.sku === item.sku && 
          content.lotNumber === item.lotNumber &&
          content.expiryDate === item.expiryDate
        );
        
        if (existingContent) {
          existingContent.quantity += item.quantity;
        } else {
          bin.mixedContents.push({
            sku: item.sku,
            quantity: item.quantity,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate
          });
        }
      }
      bin.currentQty = newTotalQty;
      console.log(`  ✅ MIXED_SKU_STORAGE: Added ${item.sku} qty:${item.quantity}, total:${newTotalQty}`);
    }
    
    console.log(`  After: currentQty=${bin.currentQty}, mixedContents=${bin.mixedContents ? JSON.stringify(bin.mixedContents) : 'null'}`);
  }
  
  console.log('\n📊 PUTAWAY COMPLETE - Final bin states:');
  Object.values(mockData.bins).forEach(bin => {
    if (bin.currentQty > 0) {
      console.log(`  ${bin.code}: qty=${bin.currentQty}, sku=${bin.sku}, mixed=${bin.mixedContents ? 'YES' : 'NO'}`);
      if (bin.mixedContents) {
        bin.mixedContents.forEach(content => {
          console.log(`    - ${content.sku}: ${content.quantity}`);
        });
      }
    }
  });
}

// Simulate pick operations
async function simulatePick(inventoryData) {
  console.log('\n🔄 Starting PICK operations...');
  
  for (let i = 0; i < inventoryData.length; i++) {
    const item = inventoryData[i];
    console.log(`\n📤 Pick ${i + 1}: ${item.sku} qty:${item.quantity}`);
    
    // Find bins with this SKU
    const availableBins = Object.values(mockData.bins).filter(bin => {
      if (bin.sku === item.sku && bin.currentQty > 0) return true;
      if (bin.mixedContents) {
        return bin.mixedContents.some(content => content.sku === item.sku && content.quantity > 0);
      }
      return false;
    });
    
    console.log(`  Found ${availableBins.length} bins with ${item.sku}`);
    
    let remainingToPick = item.quantity;
    
    for (const bin of availableBins) {
      if (remainingToPick <= 0) break;
      
      console.log(`    Checking bin ${bin.code}:`);
      
      let skuLocation = 'primary';
      let availableQty = 0;
      
      if (bin.sku === item.sku) {
        availableQty = bin.currentQty;
      } else if (bin.mixedContents) {
        const matchingContent = bin.mixedContents.find(content => content.sku === item.sku);
        if (matchingContent) {
          skuLocation = 'mixed';
          availableQty = matchingContent.quantity;
        }
      }
      
      const pickQty = Math.min(remainingToPick, availableQty);
      
      console.log(`      Available: ${availableQty}, Picking: ${pickQty}, Location: ${skuLocation}`);
      
      if (pickQty > 0) {
        // Update bin based on pick
        if (skuLocation === 'primary') {
          // Picking from primary SKU
          const newTotalQty = bin.currentQty - pickQty;
          bin.currentQty = newTotalQty;
          
          if (newTotalQty === 0) {
            // Bin becomes empty
            bin.status = 'available';
            bin.sku = null;
            bin.lotNumber = null;
            bin.expiryDate = null;
            bin.mixedContents = null;
            console.log(`      ✅ Bin emptied completely`);
          } else {
            console.log(`      ✅ Primary SKU qty reduced to ${newTotalQty}`);
          }
        } else {
          // Picking from mixed contents
          const updatedMixedContents = bin.mixedContents.map(content => {
            if (content.sku === item.sku) {
              return { ...content, quantity: content.quantity - pickQty };
            }
            return content;
          }).filter(content => content.quantity > 0); // Remove entries with 0 quantity
          
          const newTotalQty = updatedMixedContents.reduce((sum, content) => sum + content.quantity, 0);
          
          if (newTotalQty === 0) {
            // Bin becomes completely empty
            bin.currentQty = 0;
            bin.status = 'available';
            bin.sku = null;
            bin.lotNumber = null;
            bin.expiryDate = null;
            bin.mixedContents = null;
            console.log(`      ✅ Mixed bin emptied completely`);
          } else if (updatedMixedContents.length === 1) {
            // Only one SKU left, convert back to simple bin
            const remainingContent = updatedMixedContents[0];
            bin.currentQty = remainingContent.quantity;
            bin.status = 'occupied';
            bin.sku = remainingContent.sku;
            bin.lotNumber = remainingContent.lotNumber;
            bin.expiryDate = remainingContent.expiryDate;
            bin.mixedContents = null;
            console.log(`      ✅ Converted back to simple bin: ${remainingContent.sku} qty:${remainingContent.quantity}`);
          } else {
            // Still mixed, update the contents and total quantity
            bin.currentQty = newTotalQty;
            bin.status = 'occupied';
            bin.mixedContents = updatedMixedContents;
            console.log(`      ✅ Updated mixed contents, total qty: ${newTotalQty}`);
          }
        }
        
        remainingToPick -= pickQty;
      }
    }
    
    if (remainingToPick > 0) {
      console.log(`  ⚠️  Could not pick full quantity. Remaining: ${remainingToPick}`);
    } else {
      console.log(`  ✅ Pick completed successfully`);
    }
  }
  
  console.log('\n📊 PICK COMPLETE - Final bin states:');
  Object.values(mockData.bins).forEach(bin => {
    console.log(`  ${bin.code}: qty=${bin.currentQty}, sku=${bin.sku}, mixed=${bin.mixedContents ? 'YES' : 'NO'}`);
    if (bin.mixedContents) {
      bin.mixedContents.forEach(content => {
        console.log(`    - ${content.sku}: ${content.quantity}`);
      });
    }
  });
}

// Analyze final state for issues
function analyzeInventoryState() {
  console.log('\n🔍 ANALYZING FINAL INVENTORY STATE...');
  
  let totalInventory = 0;
  let phantomEntries = [];
  let issues = [];
  
  Object.values(mockData.bins).forEach(bin => {
    totalInventory += bin.currentQty;
    
    // Check for phantom entries
    if (bin.currentQty === 0) {
      if (bin.sku !== null) {
        issues.push(`❌ Bin ${bin.code}: currentQty=0 but sku=${bin.sku} (should be null)`);
      }
      if (bin.mixedContents !== null) {
        issues.push(`❌ Bin ${bin.code}: currentQty=0 but mixedContents not null: ${JSON.stringify(bin.mixedContents)}`);
      }
      if (bin.status !== 'available') {
        issues.push(`❌ Bin ${bin.code}: currentQty=0 but status=${bin.status} (should be 'available')`);
      }
    } else {
      // Bin has quantity, check consistency
      if (bin.mixedContents) {
        const mixedTotal = bin.mixedContents.reduce((sum, content) => sum + content.quantity, 0);
        if (mixedTotal !== bin.currentQty) {
          issues.push(`❌ Bin ${bin.code}: currentQty=${bin.currentQty} but mixedContents sum=${mixedTotal}`);
        }
      }
    }
  });
  
  console.log(`📊 Total inventory remaining: ${totalInventory}`);
  
  if (issues.length === 0) {
    console.log('✅ No inventory calculation issues found!');
  } else {
    console.log(`❌ Found ${issues.length} inventory calculation issues:`);
    issues.forEach(issue => console.log('  ' + issue));
  }
  
  return {
    totalInventory,
    issues: issues.length,
    details: issues
  };
}

// Main test function
async function runInventoryTest() {
  console.log('🧪 STARTING INVENTORY CALCULATION TEST');
  console.log('=====================================');
  
  // Initialize
  initializeTestWarehouse();
  
  // Simulate putaway operations
  await simulatePutaway(testInventoryData);
  
  // Simulate pick operations using the same data
  await simulatePick(testInventoryData);
  
  // Analyze results
  const results = analyzeInventoryState();
  
  console.log('\n📋 TEST SUMMARY:');
  console.log('================');
  console.log(`Expected final inventory: 0`);
  console.log(`Actual final inventory: ${results.totalInventory}`);
  console.log(`Issues found: ${results.issues}`);
  
  if (results.totalInventory === 0 && results.issues === 0) {
    console.log('🎉 TEST PASSED: Inventory calculations are correct!');
  } else {
    console.log('❌ TEST FAILED: Inventory calculation issues detected!');
    if (results.details.length > 0) {
      console.log('\nDetailed issues:');
      results.details.forEach(detail => console.log('  ' + detail));
    }
  }
  
  return results;
}

// New function to test the exact race condition issue from the logs
async function runMixedBinRaceConditionTest() {
  console.log('\n🧪 TESTING MIXED BIN RACE CONDITION ISSUE');
  console.log('=========================================');
  console.log('This test reproduces the exact issue where Phase 1 shows availability');
  console.log('but Phase 2 execution fails with "insufficient quantity" errors');
  
  // Reset test environment
  mockData = { bins: {}, putAwayTasks: {}, pickTasks: {} };
  
  // Initialize with more bins to simulate real warehouse
  const enhancedBins = [
    { id: 'bin1', code: 'WH01-GF-R01-G01-A1', capacity: 100, currentQty: 0, status: 'available', sku: null, lotNumber: null, expiryDate: null, mixedContents: null },
    { id: 'bin2', code: 'WH01-GF-R01-G01-A2', capacity: 100, currentQty: 0, status: 'available', sku: null, lotNumber: null, expiryDate: null, mixedContents: null },
    { id: 'bin3', code: 'WH01-GF-R01-G01-A3', capacity: 100, currentQty: 0, status: 'available', sku: null, lotNumber: null, expiryDate: null, mixedContents: null },
    { id: 'bin4', code: 'WH01-GF-R01-G01-B1', capacity: 100, currentQty: 0, status: 'available', sku: null, lotNumber: null, expiryDate: null, mixedContents: null },
    { id: 'bin5', code: 'WH01-GF-R01-G01-B2', capacity: 100, currentQty: 0, status: 'available', sku: null, lotNumber: null, expiryDate: null, mixedContents: null },
    { id: 'bin6', code: 'WH01-GF-R01-G01-B3', capacity: 100, currentQty: 0, status: 'available', sku: null, lotNumber: null, expiryDate: null, mixedContents: null },
  ];
  
  enhancedBins.forEach(bin => {
    mockData.bins[bin.id] = bin;
  });
  
  console.log('✅ Enhanced warehouse initialized with', enhancedBins.length, 'bins');
  
  // Create the exact mixed bin scenario that causes the race condition
  const raceConditionData = [
    // Create bins similar to the log scenario
    { sku: 'SKU001', quantity: 10, lotNumber: 'LOT001', expiryDate: '2025-12-31' }, // bin1: pure
    { sku: 'SKU001', quantity: 10, lotNumber: 'LOT001', expiryDate: '2025-12-31' }, // bin2: pure
    { sku: 'SKU001', quantity: 10, lotNumber: 'LOT001', expiryDate: '2025-12-31' }, // bin3: pure
    { sku: 'SKU001', quantity: 6, lotNumber: 'LOT001', expiryDate: '2025-12-31' },  // bin4: 6 SKU001
    { sku: 'SKU002', quantity: 4, lotNumber: 'LOT002', expiryDate: '2025-11-30' },  // bin4: mixed (6 SKU001 + 4 SKU002)
    { sku: 'SKU002', quantity: 10, lotNumber: 'LOT002', expiryDate: '2025-11-30' }, // bin5: pure
    { sku: 'SKU002', quantity: 2, lotNumber: 'LOT002', expiryDate: '2025-11-30' },  // bin6: 2 SKU002
    { sku: 'SKU003', quantity: 8, lotNumber: 'LOT003', expiryDate: '2025-10-31' },  // bin6: mixed (2 SKU002 + 8 SKU003)
  ];
  
  // Simulate putaway to create the mixed bin scenario
  await simulatePutaway(raceConditionData);
  
  console.log('\n🔍 PHASE 1: AVAILABILITY CHECK SIMULATION');
  console.log('==========================================');
  
  // Simulate the availability checks that would happen in Phase 1
  const pickRequests = [
    { sku: 'SKU001', quantity: 36, description: 'Should pick from bins 1,2,3,4 (6 from mixed bin)' },
    { sku: 'SKU002', quantity: 16, description: 'Should pick from bins 5,6 (but bin6 is mixed!)' },
    { sku: 'SKU003', quantity: 8, description: 'Should pick from bin6 (mixed with SKU002)' },
  ];
  
  const availabilityResults = [];
  
  for (const request of pickRequests) {
    console.log(`\n📋 Checking availability for ${request.sku} (${request.quantity} units)...`);
    console.log(`   ${request.description}`);
    
    // Calculate total available quantity
    let totalAvailable = 0;
    const availableBins = [];
    
    Object.values(mockData.bins).forEach(bin => {
      if (bin.sku === request.sku && bin.currentQty > 0) {
        totalAvailable += bin.currentQty;
        availableBins.push({
          binCode: bin.code,
          availableQty: bin.currentQty,
          type: 'primary'
        });
      } else if (bin.mixedContents) {
        const matchingContent = bin.mixedContents.find(content => content.sku === request.sku);
        if (matchingContent && matchingContent.quantity > 0) {
          totalAvailable += matchingContent.quantity;
          availableBins.push({
            binCode: bin.code,
            availableQty: matchingContent.quantity,
            type: 'mixed',
            totalBinQty: bin.currentQty,
            mixedWith: bin.mixedContents.filter(c => c.sku !== request.sku).map(c => `${c.sku}:${c.quantity}`).join(', ')
          });
        }
      }
    });
    
    const isFullyAvailable = totalAvailable >= request.quantity;
    console.log(`   Available: ${totalAvailable}, Required: ${request.quantity}, Status: ${isFullyAvailable ? '✅ FULLY AVAILABLE' : '❌ INSUFFICIENT'}`);
    
    if (availableBins.length > 0) {
      console.log('   Bins found:');
      availableBins.forEach(bin => {
        if (bin.type === 'mixed') {
          console.log(`     - ${bin.binCode}: ${bin.availableQty} units (MIXED with ${bin.mixedWith}, total: ${bin.totalBinQty})`);
        } else {
          console.log(`     - ${bin.binCode}: ${bin.availableQty} units (PRIMARY)`);
        }
      });
    }
    
    availabilityResults.push({
      sku: request.sku,
      requested: request.quantity,
      available: totalAvailable,
      isFullyAvailable,
      bins: availableBins
    });
  }
  
  console.log('\n🚀 PHASE 2: EXECUTION SIMULATION');
  console.log('==================================');
  console.log('Now executing the picks to see if they match Phase 1 expectations...');
  
  // Now execute the picks in sequence and see if they match expectations
  const executionResults = [];
  
  for (let i = 0; i < pickRequests.length; i++) {
    const request = pickRequests[i];
    const phaseOneResult = availabilityResults[i];
    
    console.log(`\n📦 Executing pick ${i + 1}: ${request.sku} (${request.quantity} units)`);
    console.log(`   Phase 1 showed: ${phaseOneResult.available} available, expected ${phaseOneResult.isFullyAvailable ? 'SUCCESS' : 'FAILURE'}`);
    
    // Capture bin states before pick
    const binStatesBefore = JSON.parse(JSON.stringify(mockData.bins));
    
    // Execute the pick
    await simulateIndividualPick(request);
    
    // Analyze what actually happened
    const binStatesAfter = mockData.bins;
    const actualChanges = [];
    
    Object.keys(binStatesBefore).forEach(binId => {
      const before = binStatesBefore[binId];
      const after = binStatesAfter[binId];
      
      if (before.currentQty !== after.currentQty || 
          JSON.stringify(before.mixedContents) !== JSON.stringify(after.mixedContents)) {
        actualChanges.push({
          binCode: before.code,
          qtyBefore: before.currentQty,
          qtyAfter: after.currentQty,
          mixedBefore: before.mixedContents,
          mixedAfter: after.mixedContents
        });
      }
    });
    
    console.log(`   Actual changes: ${actualChanges.length} bins modified`);
    if (actualChanges.length > 0) {
      actualChanges.forEach(change => {
        console.log(`     - ${change.binCode}: ${change.qtyBefore} → ${change.qtyAfter}`);
        if (change.mixedBefore || change.mixedAfter) {
          console.log(`       Mixed before: ${change.mixedBefore ? JSON.stringify(change.mixedBefore) : 'null'}`);
          console.log(`       Mixed after: ${change.mixedAfter ? JSON.stringify(change.mixedAfter) : 'null'}`);
        }
      });
    }
    
    executionResults.push({
      request,
      phaseOneExpected: phaseOneResult,
      actualChanges,
      success: actualChanges.length > 0
    });
  }
  
  console.log('\n🔍 RACE CONDITION ANALYSIS');
  console.log('===========================');
  
  let raceConditionsDetected = 0;
  
  for (let i = 0; i < executionResults.length; i++) {
    const result = executionResults[i];
    const phaseOneExpected = result.phaseOneExpected.isFullyAvailable;
    const actualSuccess = result.success;
    
    if (phaseOneExpected !== actualSuccess) {
      raceConditionsDetected++;
      console.log(`❌ RACE CONDITION DETECTED for ${result.request.sku}:`);
      console.log(`   Phase 1 predicted: ${phaseOneExpected ? 'SUCCESS' : 'FAILURE'}`);
      console.log(`   Phase 2 actual: ${actualSuccess ? 'SUCCESS' : 'FAILURE'}`);
      console.log(`   This indicates inventory calculation inconsistency!`);
    } else {
      console.log(`✅ ${result.request.sku}: Phase 1 and Phase 2 consistent`);
    }
  }
  
  console.log(`\n📊 RACE CONDITION TEST SUMMARY:`);
  console.log(`   Total picks tested: ${executionResults.length}`);
  console.log(`   Race conditions detected: ${raceConditionsDetected}`);
  console.log(`   Test result: ${raceConditionsDetected === 0 ? '🎉 PASSED - No race conditions' : '❌ FAILED - Race conditions detected'}`);
  
  if (raceConditionsDetected > 0) {
    console.log('\n🔧 RECOMMENDATIONS:');
    console.log('   1. Implement proper bin locking during picks');
    console.log('   2. Refresh bin data between Phase 1 and Phase 2');
    console.log('   3. Use atomic operations for mixed bin updates');
    console.log('   4. Add inventory reconciliation after each pick');
  }
  
  return {
    raceConditionsDetected,
    totalTested: executionResults.length,
    passed: raceConditionsDetected === 0
  };
}

// Helper function to simulate individual pick operations
async function simulateIndividualPick(pickRequest) {
  const { sku, quantity } = pickRequest;
  
  // Find bins with this SKU (same logic as the main simulatePick function)
  const availableBins = Object.values(mockData.bins).filter(bin => {
    if (bin.sku === sku && bin.currentQty > 0) return true;
    if (bin.mixedContents) {
      return bin.mixedContents.some(content => content.sku === sku && content.quantity > 0);
    }
    return false;
  });
  
  let remainingToPick = quantity;
  
  for (const bin of availableBins) {
    if (remainingToPick <= 0) break;
    
    let skuLocation = 'primary';
    let availableQty = 0;
    
    if (bin.sku === sku) {
      availableQty = bin.currentQty;
    } else if (bin.mixedContents) {
      const matchingContent = bin.mixedContents.find(content => content.sku === sku);
      if (matchingContent) {
        skuLocation = 'mixed';
        availableQty = matchingContent.quantity;
      }
    }
    
    const pickQty = Math.min(remainingToPick, availableQty);
    
    if (pickQty > 0) {
      // Update bin based on pick (same logic as main function)
      if (skuLocation === 'primary') {
        const newTotalQty = bin.currentQty - pickQty;
        bin.currentQty = newTotalQty;
        
        if (newTotalQty === 0) {
          bin.status = 'available';
          bin.sku = null;
          bin.lotNumber = null;
          bin.expiryDate = null;
          bin.mixedContents = null;
        }
      } else {
        // Picking from mixed contents
        const updatedMixedContents = bin.mixedContents.map(content => {
          if (content.sku === sku) {
            return { ...content, quantity: content.quantity - pickQty };
          }
          return content;
        }).filter(content => content.quantity > 0);
        
        const newTotalQty = updatedMixedContents.reduce((sum, content) => sum + content.quantity, 0);
        
        if (newTotalQty === 0) {
          bin.currentQty = 0;
          bin.status = 'available';
          bin.sku = null;
          bin.lotNumber = null;
          bin.expiryDate = null;
          bin.mixedContents = null;
        } else if (updatedMixedContents.length === 1) {
          const remainingContent = updatedMixedContents[0];
          bin.currentQty = remainingContent.quantity;
          bin.status = 'occupied';
          bin.sku = remainingContent.sku;
          bin.lotNumber = remainingContent.lotNumber;
          bin.expiryDate = remainingContent.expiryDate;
          bin.mixedContents = null;
        } else {
          bin.currentQty = newTotalQty;
          bin.status = 'occupied';
          bin.mixedContents = updatedMixedContents;
        }
      }
      
      remainingToPick -= pickQty;
    }
  }
  
  return {
    requested: quantity,
    picked: quantity - remainingToPick,
    success: remainingToPick === 0
  };
}

// Enhanced main execution function that runs all tests
async function runAllInventoryTests() {
  console.log('🧪 COMPREHENSIVE INVENTORY CALCULATION TESTING SUITE');
  console.log('=====================================================');
  
  const results = {
    basicTest: null,
    raceConditionTest: null,
    mixedBinTest: null
  };
  
  try {
    // Test 1: Basic inventory calculation test
    console.log('\n📋 TEST 1: Basic Inventory Calculation');
    results.basicTest = await runInventoryTest();
    
    // Test 2: Mixed bin race condition test
    console.log('\n📋 TEST 2: Mixed Bin Race Condition');
    results.raceConditionTest = await runMixedBinRaceConditionTest();
    
    // Test 3: Mixed bin scenario test with problematic sequence
    console.log('\n📋 TEST 3: Problematic Pick Sequence');
    results.mixedBinTest = await runMixedBinTest();
    
  } catch (error) {
    console.error('❌ Error running tests:', error);
  }
  
  // Final summary
  console.log('\n🎯 FINAL TEST SUMMARY');
  console.log('=====================');
  
  if (results.basicTest) {
    console.log(`✅ Basic Test: ${results.basicTest.totalInventory === 0 && results.basicTest.issues === 0 ? 'PASSED' : 'FAILED'}`);
  }
  
  if (results.raceConditionTest) {
    console.log(`${results.raceConditionTest.passed ? '✅' : '❌'} Race Condition Test: ${results.raceConditionTest.passed ? 'PASSED' : 'FAILED'} (${results.raceConditionTest.raceConditionsDetected}/${results.raceConditionTest.totalTested} issues)`);
  }
  
  if (results.mixedBinTest) {
    console.log(`${results.mixedBinTest.passed ? '✅' : '❌'} Mixed Bin Test: ${results.mixedBinTest.passed ? 'PASSED' : 'FAILED'}`);
  }
  
  const allPassed = Object.values(results).every(r => r && (r.passed !== false && r.issues === 0));
  console.log(`\n🏆 OVERALL RESULT: ${allPassed ? '🎉 ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (!allPassed) {
    console.log('\n🔧 NEXT STEPS:');
    console.log('1. Review the detailed logs above to identify specific issues');
    console.log('2. Focus on mixed bin inventory calculations');
    console.log('3. Implement proper synchronization between planning and execution phases');
    console.log('4. Add bin-level locking during pick operations');
  }
  
  return results;
}

// Additional test for mixed bin scenarios
async function runMixedBinTest() {
  console.log('\n🧪 TESTING MIXED BIN PROBLEMATIC SEQUENCE');
  console.log('==========================================');
  
  // Reset environment
  mockData = { bins: {}, putAwayTasks: {}, pickTasks: {} };
  initializeTestWarehouse();
  
  // Setup mixed bins using the enhanced scenario data
  await simulatePutaway(mixedBinScenarioData);
  
  console.log('\n📊 Initial state after putaway:');
  Object.values(mockData.bins).forEach(bin => {
    if (bin.currentQty > 0) {
      console.log(`  ${bin.code}: qty=${bin.currentQty}, sku=${bin.sku}, mixed=${bin.mixedContents ? 'YES' : 'NO'}`);
      if (bin.mixedContents) {
        bin.mixedContents.forEach(content => {
          console.log(`    - ${content.sku}: ${content.quantity}`);
        });
      }
    }
  });
  
  console.log('\n🔄 Executing problematic pick sequence...');
  
  // Execute the problematic pick sequence
  const pickResults = [];
  for (let i = 0; i < problematicPickSequence.length; i++) {
    const pick = problematicPickSequence[i];
    console.log(`\n📤 Pick ${i + 1}: ${pick.sku} qty:${pick.quantity}`);
    
    const result = await simulateIndividualPick(pick);
    pickResults.push({
      ...pick,
      ...result,
      pickNumber: i + 1
    });
    
    console.log(`  Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'} (picked ${result.picked}/${result.requested})`);
  }
  
  // Analyze results
  const issues = analyzeInventoryState();
  const failedPicks = pickResults.filter(r => !r.success);
  
  console.log('\n📊 MIXED BIN TEST SUMMARY:');
  console.log(`  Total picks: ${pickResults.length}`);
  console.log(`  Successful picks: ${pickResults.length - failedPicks.length}`);
  console.log(`  Failed picks: ${failedPicks.length}`);
  console.log(`  Inventory issues: ${issues.issues}`);
  
  if (failedPicks.length > 0) {
    console.log('\n❌ Failed picks:');
    failedPicks.forEach(pick => {
      console.log(`  - Pick ${pick.pickNumber}: ${pick.sku} (requested ${pick.quantity}, got ${pick.picked})`);
    });
  }
  
  return {
    passed: failedPicks.length === 0 && issues.issues === 0,
    totalPicks: pickResults.length,
    failedPicks: failedPicks.length,
    inventoryIssues: issues.issues
  };
}

// Test that reproduces the exact console log scenario
async function reproduceConsoleLogScenario() {
  console.log('\n🧪 REPRODUCING EXACT CONSOLE LOG SCENARIO');
  console.log('==========================================');
  console.log('This test recreates the exact bin states from your production logs');
  
  // Reset environment
  mockData = { bins: {}, putAwayTasks: {}, pickTasks: {} };
  
  // Create bins that match your production scenario
  const productionBins = [
    // SKU001 bins (Pure)
    { id: 'A2', code: 'WH01-GF-R01-G01-A2', sku: 'SKU001', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'A3', code: 'WH01-GF-R01-G01-A3', sku: 'SKU001', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'A1', code: 'WH01-GF-R01-G01-A1', sku: 'SKU001', currentQty: 10, status: 'occupied', mixedContents: null },
    
    // SKU001 + SKU002 mixed bin (This is where the problem likely occurs)
    { 
      id: 'B1', 
      code: 'WH01-GF-R01-G01-B1', 
      sku: 'SKU001', 
      currentQty: 10, 
      status: 'occupied', 
      mixedContents: [
        { sku: 'SKU001', quantity: 6, lotNumber: 'LOT001', expiryDate: '2025-12-31' },
        { sku: 'SKU002', quantity: 4, lotNumber: 'LOT002', expiryDate: '2025-11-30' }
      ]
    },
    
    // SKU002 bins
    { id: 'B2', code: 'WH01-GF-R01-G01-B2', sku: 'SKU002', currentQty: 10, status: 'occupied', mixedContents: null },
    { 
      id: 'B3', 
      code: 'WH01-GF-R01-G01-B3', 
      sku: 'SKU002', 
      currentQty: 10, 
      status: 'occupied', 
      mixedContents: [
        { sku: 'SKU002', quantity: 2, lotNumber: 'LOT002', expiryDate: '2025-11-30' },
        { sku: 'SKU003', quantity: 8, lotNumber: 'LOT003', expiryDate: '2025-10-31' }
      ]
    },
    
    // SKU003 bins (Pure)
    { id: 'E1', code: 'WH01-GF-R01-G01-E1', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'D3', code: 'WH01-GF-R01-G01-D3', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    // ... more SKU003 bins to reach 98 total
    { id: 'E2', code: 'WH01-GF-R01-G01-E2', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'C3', code: 'WH01-GF-R01-G01-C3', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'E3', code: 'WH01-GF-R01-G01-E3', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'C2', code: 'WH01-GF-R01-G01-C2', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'C1', code: 'WH01-GF-R01-G01-C1', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'D1', code: 'WH01-GF-R01-G01-D1', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
    { id: 'D2', code: 'WH01-GF-R01-G01-D2', sku: 'SKU003', currentQty: 10, status: 'occupied', mixedContents: null },
  ];
  
  productionBins.forEach(bin => {
    mockData.bins[bin.id] = { ...bin, capacity: 100, lotNumber: bin.lotNumber || 'LOT001', expiryDate: bin.expiryDate || '2025-12-31' };
  });
  
  console.log('✅ Production scenario initialized with', productionBins.length, 'bins');
  
  // Log initial state
  console.log('\n📊 INITIAL STATE (matching production):');
  Object.values(mockData.bins).forEach(bin => {
    if (bin.currentQty > 0) {
      const mixedInfo = bin.mixedContents ? ` [${bin.mixedContents.map(c => `${c.sku}:${c.quantity}`).join(', ')}]` : '';
      console.log(`  ${bin.code}: ${bin.sku} qty=${bin.currentQty}${mixedInfo}`);
    }
  });
  
  // Simulate the exact pick sequence from your logs
  const productionPickSequence = [
    { sku: 'SKU001', quantity: 36, description: 'Should pick from A2(10), A3(10), A1(10), B1(6 from mixed)' },
    { sku: 'SKU002', quantity: 16, description: 'Should pick from B3(10 pure), B2(6)... but B3 is MIXED!' },
    { sku: 'SKU003', quantity: 98, description: 'Should pick including 8 from B3 mixed bin' },
  ];
  
  console.log('\n🔍 TESTING EXACT PRODUCTION SCENARIO:');
  console.log('====================================');
  
  for (let i = 0; i < productionPickSequence.length; i++) {
    const pick = productionPickSequence[i];
    console.log(`\n📋 PHASE 1 - Checking availability for ${pick.sku} (${pick.quantity} units)`);
    console.log(`   Expected: ${pick.description}`);
    
    // Calculate availability exactly like your production system would
    let totalAvailable = 0;
    const binDetails = [];
    
    Object.values(mockData.bins).forEach(bin => {
      if (bin.sku === pick.sku && bin.currentQty > 0) {
        totalAvailable += bin.currentQty;
        binDetails.push({ code: bin.code, available: bin.currentQty, type: 'pure', mixed: false });
      } else if (bin.mixedContents) {
        const matchingContent = bin.mixedContents.find(content => content.sku === pick.sku);
        if (matchingContent && matchingContent.quantity > 0) {
          totalAvailable += matchingContent.quantity;
          binDetails.push({ 
            code: bin.code, 
            available: matchingContent.quantity, 
            type: 'mixed', 
            mixed: true,
            primary: bin.sku,
            totalBinQty: bin.currentQty
          });
        }
      }
    });
    
    console.log(`   Phase 1 calculated: ${totalAvailable} available`);
    console.log(`   Bins found:`);
    binDetails.forEach(bin => {
      if (bin.mixed) {
        console.log(`     - ${bin.code}: ${bin.available} units (MIXED, primary=${bin.primary}, totalBin=${bin.totalBinQty})`);
      } else {
        console.log(`     - ${bin.code}: ${bin.available} units (PURE)`);
      }
    });
    
    // Now execute the pick and see what actually happens
    console.log(`\n📦 PHASE 2 - Executing pick for ${pick.sku} (${pick.quantity} units)`);
    
    const beforeState = JSON.parse(JSON.stringify(mockData.bins));
    const result = await simulateIndividualPick(pick);
    const afterState = mockData.bins;
    
    console.log(`   Execution result: ${result.success ? 'SUCCESS' : 'FAILED'} (picked ${result.picked}/${result.requested})`);
    
    // Check if this matches what the production system experienced
    if (result.success && result.picked === pick.quantity) {
      console.log(`   ✅ This pick succeeded - no race condition detected`);
    } else {
      console.log(`   ❌ RACE CONDITION DETECTED!`);
      console.log(`      Expected: ${pick.quantity} units available`);
      console.log(`      Actually picked: ${result.picked} units`);
      console.log(`      This matches the production error pattern!`);
      
      // Analyze what went wrong
      console.log(`\n   🔍 DETAILED ANALYSIS:`);
      Object.keys(beforeState).forEach(binId => {
        const before = beforeState[binId];
        const after = afterState[binId];
        
        if (before.currentQty !== after.currentQty || JSON.stringify(before.mixedContents) !== JSON.stringify(after.mixedContents)) {
          console.log(`      Bin ${before.code}: ${before.currentQty} → ${after.currentQty}`);
          if (before.mixedContents || after.mixedContents) {
            console.log(`        Mixed before: ${JSON.stringify(before.mixedContents)}`);
            console.log(`        Mixed after: ${JSON.stringify(after.mixedContents)}`);
          }
        }
      });
    }
  }
  
  return { success: true };
}

// Run the test
if (require.main === module) {
  const testType = process.argv[2];
  
  if (testType === 'basic') {
    runInventoryTest().catch(console.error);
  } else if (testType === 'race') {
    runMixedBinRaceConditionTest().catch(console.error);
  } else if (testType === 'mixed') {
    runMixedBinTest().catch(console.error);
  } else if (testType === 'production') {
    reproduceConsoleLogScenario().catch(console.error);
  } else {
    // Run all tests by default
    runAllInventoryTests().catch(console.error);
  }
}

module.exports = { 
  runInventoryTest, 
  runMixedBinRaceConditionTest, 
  runMixedBinTest,
  runAllInventoryTests,
  reproduceConsoleLogScenario,
  testInventoryData, 
  mixedBinScenarioData, 
  problematicPickSequence 
};
