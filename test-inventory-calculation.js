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

// Run the test
if (require.main === module) {
  runInventoryTest().catch(console.error);
}

module.exports = { runInventoryTest, testInventoryData };
