/**
 * Advanced test for mixed bin scenarios that could cause inventory calculation issues
 */

const { runInventoryTest, testInventoryData } = require('./test-inventory-calculation.js');

// More complex test data with mixed bin scenarios
const complexTestData = [
  // Initial putaways
  { sku: 'SKU001', quantity: 30, lotNumber: 'LOT001', expiryDate: '2025-12-31' },
  { sku: 'SKU002', quantity: 25, lotNumber: 'LOT002', expiryDate: '2025-11-30' },
  
  // Create mixed bins by adding different SKUs to same bins
  { sku: 'SKU003', quantity: 20, lotNumber: 'LOT003', expiryDate: '2025-10-31' }, // Will go to bin1 (mixed with SKU001)
  { sku: 'SKU004', quantity: 15, lotNumber: 'LOT004', expiryDate: '2025-09-30' }, // Will go to bin2 (mixed with SKU002)
  
  // Add more to existing SKUs to test consolidation in mixed bins
  { sku: 'SKU001', quantity: 10, lotNumber: 'LOT001', expiryDate: '2025-12-31' }, // More SKU001 to bin1
  { sku: 'SKU003', quantity: 5, lotNumber: 'LOT003', expiryDate: '2025-10-31' },  // More SKU003 to bin1
];

// Mock data storage for complex test
let complexMockData = {
  bins: {},
  putAwayTasks: {},
  pickTasks: {}
};

// Initialize test warehouse with limited bins to force mixing
function initializeComplexTestWarehouse() {
  console.log('🏭 Initializing complex test warehouse (2 bins only)...');
  
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
    }
  ];

  testBins.forEach(bin => {
    complexMockData.bins[bin.id] = bin;
  });

  console.log('✅ Complex test warehouse initialized with', testBins.length, 'bins');
}

// Enhanced putaway simulation with forced mixing
async function simulateComplexPutaway(inventoryData) {
  console.log('\n🔄 Starting COMPLEX PUTAWAY operations...');
  
  for (let i = 0; i < inventoryData.length; i++) {
    const item = inventoryData[i];
    
    // Strategy: Try to find existing bin with same SKU first, otherwise use bin based on index
    let selectedBinId = null;
    
    // First, try to find a bin that already has this SKU
    for (const binId of Object.keys(complexMockData.bins)) {
      const bin = complexMockData.bins[binId];
      if (bin.sku === item.sku || 
          (bin.mixedContents && bin.mixedContents.some(content => 
            content.sku === item.sku && 
            content.lotNumber === item.lotNumber && 
            content.expiryDate === item.expiryDate))) {
        selectedBinId = binId;
        break;
      }
    }
    
    // If no matching SKU found, use round-robin assignment
    if (!selectedBinId) {
      selectedBinId = `bin${(i % 2) + 1}`; // Only 2 bins, so alternate
    }
    
    const bin = complexMockData.bins[selectedBinId];
    
    console.log(`\n📦 Complex Putaway ${i + 1}: ${item.sku} qty:${item.quantity} → ${bin.code}`);
    
    // Current bin state
    const currentQty = bin.currentQty || 0;
    const newTotalQty = currentQty + item.quantity;
    
    console.log(`  Before: currentQty=${currentQty}, sku=${bin.sku}, mixedContents=${bin.mixedContents ? JSON.stringify(bin.mixedContents) : 'null'}`);
    
    // Check capacity
    if (newTotalQty > bin.capacity) {
      console.log(`  ❌ Capacity exceeded! Available: ${bin.capacity - currentQty}, Required: ${item.quantity}`);
      continue;
    }
    
    // Update bin using putaway logic (FIXED VERSION)
    if (currentQty === 0) {
      // New placement
      bin.currentQty = newTotalQty;
      bin.status = 'occupied';
      bin.sku = item.sku;
      bin.lotNumber = item.lotNumber;
      bin.expiryDate = item.expiryDate;
      bin.mixedContents = null;
      console.log(`  ✅ NEW_PLACEMENT: Set bin to ${item.sku} qty:${newTotalQty}`);
    } else if (bin.sku === item.sku && !bin.mixedContents) {
      // Same SKU consolidation - only if no mixed contents
      bin.currentQty = newTotalQty;
      console.log(`  ✅ SAME_SKU_CONSOLIDATION: Updated qty from ${currentQty} to ${newTotalQty}`);
    } else {
      // Mixed SKU storage (either different SKU or same SKU but bin has mixed contents)
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
          console.log(`  📊 Updated existing mixed content for ${item.sku} by ${item.quantity}`);
        } else {
          bin.mixedContents.push({
            sku: item.sku,
            quantity: item.quantity,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate
          });
          console.log(`  📊 Added new mixed content for ${item.sku} qty:${item.quantity}`);
        }
      }
      bin.currentQty = newTotalQty;
      if (bin.sku === item.sku) {
        console.log(`  ✅ MIXED_SKU_STORAGE (same SKU in mixed bin): Total qty now ${newTotalQty}`);
      } else {
        console.log(`  ✅ MIXED_SKU_STORAGE: Total qty now ${newTotalQty}`);
      }
    }
    
    console.log(`  After: currentQty=${bin.currentQty}, sku=${bin.sku}, mixedContents=${bin.mixedContents ? JSON.stringify(bin.mixedContents) : 'null'}`);
  }
  
  console.log('\n📊 COMPLEX PUTAWAY COMPLETE - Final bin states:');
  Object.values(complexMockData.bins).forEach(bin => {
    if (bin.currentQty > 0) {
      console.log(`  ${bin.code}: qty=${bin.currentQty}, sku=${bin.sku}, mixed=${bin.mixedContents ? 'YES' : 'NO'}`);
      if (bin.mixedContents) {
        bin.mixedContents.forEach(content => {
          console.log(`    - ${content.sku} (${content.lotNumber}): ${content.quantity}`);
        });
        
        // Verify mixed contents total matches currentQty
        const mixedTotal = bin.mixedContents.reduce((sum, content) => sum + content.quantity, 0);
        if (mixedTotal !== bin.currentQty) {
          console.log(`    ❌ MISMATCH: currentQty=${bin.currentQty} but mixedContents sum=${mixedTotal}`);
        }
      }
    }
  });
}

// Enhanced pick simulation for mixed bins
async function simulateComplexPick(inventoryData) {
  console.log('\n🔄 Starting COMPLEX PICK operations...');
  
  for (let i = 0; i < inventoryData.length; i++) {
    const item = inventoryData[i];
    console.log(`\n📤 Complex Pick ${i + 1}: ${item.sku} qty:${item.quantity} (lot:${item.lotNumber})`);
    
    // Find bins with this SKU
    const availableBins = Object.values(complexMockData.bins).filter(bin => {
      if (bin.sku === item.sku && bin.currentQty > 0) return true;
      if (bin.mixedContents) {
        return bin.mixedContents.some(content => 
          content.sku === item.sku && 
          content.quantity > 0 &&
          content.lotNumber === item.lotNumber &&
          content.expiryDate === item.expiryDate
        );
      }
      return false;
    });
    
    console.log(`  Found ${availableBins.length} bins with matching ${item.sku} (lot:${item.lotNumber})`);
    
    let remainingToPick = item.quantity;
    
    for (const bin of availableBins) {
      if (remainingToPick <= 0) break;
      
      console.log(`    Checking bin ${bin.code} (currentQty=${bin.currentQty}):`);
      
      let skuLocation = 'primary';
      let availableQty = 0;
      
      // FIXED: Check mixed contents first, then primary SKU
      if (bin.mixedContents && Array.isArray(bin.mixedContents)) {
        // For mixed bins, always check mixed contents regardless of primary SKU
        const matchingContent = bin.mixedContents.find(content => 
          content.sku === item.sku &&
          content.lotNumber === item.lotNumber &&
          content.expiryDate === item.expiryDate
        );
        if (matchingContent) {
          skuLocation = 'mixed';
          availableQty = matchingContent.quantity;
          console.log(`      Mixed content match: ${availableQty} available`);
        }
      } else if (bin.sku === item.sku) {
        // Simple bin with primary SKU
        availableQty = bin.currentQty;
        console.log(`      Primary SKU match: ${availableQty} available`);
      }
      
      const pickQty = Math.min(remainingToPick, availableQty);
      
      console.log(`      Picking: ${pickQty}, Location: ${skuLocation}`);
      
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
            console.log(`      ✅ Primary bin emptied completely`);
          } else {
            console.log(`      ✅ Primary SKU qty reduced to ${newTotalQty}`);
          }
        } else {
          // Picking from mixed contents - this is the critical area!
          console.log(`      🔍 Before mixed pick: ${JSON.stringify(bin.mixedContents)}`);
          
          const updatedMixedContents = bin.mixedContents.map(content => {
            if (content.sku === item.sku && 
                content.lotNumber === item.lotNumber && 
                content.expiryDate === item.expiryDate) {
              const newQty = content.quantity - pickQty;
              console.log(`        Reducing ${content.sku} from ${content.quantity} to ${newQty}`);
              return { ...content, quantity: newQty };
            }
            return content;
          }).filter(content => content.quantity > 0); // Remove entries with 0 quantity
          
          console.log(`      🔍 After filtering: ${JSON.stringify(updatedMixedContents)}`);
          
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
            
            // Critical check: verify the sum matches
            const verifyTotal = bin.mixedContents.reduce((sum, content) => sum + content.quantity, 0);
            if (verifyTotal !== bin.currentQty) {
              console.log(`      ❌ CRITICAL ERROR: currentQty=${bin.currentQty} but mixedContents sum=${verifyTotal}`);
            }
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
  
  console.log('\n📊 COMPLEX PICK COMPLETE - Final bin states:');
  Object.values(complexMockData.bins).forEach(bin => {
    console.log(`  ${bin.code}: qty=${bin.currentQty}, sku=${bin.sku}, mixed=${bin.mixedContents ? 'YES' : 'NO'}`);
    if (bin.mixedContents) {
      console.log(`    Mixed contents:`);
      bin.mixedContents.forEach(content => {
        console.log(`      - ${content.sku} (${content.lotNumber}): ${content.quantity}`);
      });
      
      // Verify totals again
      const mixedTotal = bin.mixedContents.reduce((sum, content) => sum + content.quantity, 0);
      if (mixedTotal !== bin.currentQty) {
        console.log(`    ❌ MISMATCH: currentQty=${bin.currentQty} but mixedContents sum=${mixedTotal}`);
      }
    }
  });
}

// Analyze final state for complex test
function analyzeComplexInventoryState() {
  console.log('\n🔍 ANALYZING COMPLEX INVENTORY STATE...');
  
  let totalInventory = 0;
  let issues = [];
  
  Object.values(complexMockData.bins).forEach(bin => {
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
        
        // Check for zero-quantity entries in mixed contents
        const zeroQtyEntries = bin.mixedContents.filter(content => content.quantity <= 0);
        if (zeroQtyEntries.length > 0) {
          issues.push(`❌ Bin ${bin.code}: mixedContents contains entries with zero or negative quantity: ${JSON.stringify(zeroQtyEntries)}`);
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

// Main complex test function
async function runComplexInventoryTest() {
  console.log('🧪 STARTING COMPLEX INVENTORY CALCULATION TEST');
  console.log('==============================================');
  
  // Initialize
  initializeComplexTestWarehouse();
  
  // Simulate complex putaway operations
  await simulateComplexPutaway(complexTestData);
  
  // Simulate complex pick operations using the same data
  await simulateComplexPick(complexTestData);
  
  // Analyze results
  const results = analyzeComplexInventoryState();
  
  console.log('\n📋 COMPLEX TEST SUMMARY:');
  console.log('========================');
  console.log(`Expected final inventory: 0`);
  console.log(`Actual final inventory: ${results.totalInventory}`);
  console.log(`Issues found: ${results.issues}`);
  
  if (results.totalInventory === 0 && results.issues === 0) {
    console.log('🎉 COMPLEX TEST PASSED: Inventory calculations are correct!');
  } else {
    console.log('❌ COMPLEX TEST FAILED: Inventory calculation issues detected!');
    if (results.details.length > 0) {
      console.log('\nDetailed issues:');
      results.details.forEach(detail => console.log('  ' + detail));
    }
  }
  
  return results;
}

// Run the complex test
if (require.main === module) {
  runComplexInventoryTest().catch(console.error);
}

module.exports = { runComplexInventoryTest };
