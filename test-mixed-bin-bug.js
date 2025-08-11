/**
 * Test script to reproduce the exact mixed bin identification bug from production logs
 * 
 * The issue: Phase 1 planning treats mixed bins as pure bins, leading to incorrect
 * availability calculations and subsequent execution failures.
 */

// Test that reproduces the exact mixed bin planning bug
async function reproduceMixedBinPlanningBug() {
  console.log('🐛 REPRODUCING MIXED BIN PLANNING BUG');
  console.log('=====================================');
  console.log('This reproduces the exact bug where Phase 1 treats mixed bins as pure bins');
  
  // Create the exact bin state that causes the bug
  const problematicBin = {
    id: 'B3',
    code: 'WH01-GF-R01-G01-B3',
    sku: 'SKU002',           // Primary SKU
    currentQty: 10,          // Total quantity
    status: 'occupied',
    mixedContents: [
      { sku: 'SKU002', quantity: 2, lotNumber: 'LOT002', expiryDate: '2025-11-30' },
      { sku: 'SKU003', quantity: 8, lotNumber: 'LOT003', expiryDate: '2025-10-31' }
    ]
  };
  
  console.log('\n📊 PROBLEMATIC BIN STATE:');
  console.log(`  ${problematicBin.code}: Primary=${problematicBin.sku}, Total=${problematicBin.currentQty}`);
  console.log(`  Mixed contents:`);
  problematicBin.mixedContents.forEach(content => {
    console.log(`    - ${content.sku}: ${content.quantity} units`);
  });
  
  // Simulate Phase 1 planning logic (BUGGY VERSION)
  console.log('\n🔍 PHASE 1: BUGGY PLANNING LOGIC');
  console.log('=================================');
  
  // This is how the buggy system likely calculates availability
  function buggyPhase1Planning(bin, targetSku) {
    // BUG: Only looks at primary SKU, ignores mixed contents for planning
    if (bin.sku === targetSku) {
      return {
        available: bin.currentQty, // BUG: Uses total quantity instead of specific SKU quantity
        treatmentType: 'pure',
        planningError: true
      };
    }
    return { available: 0, treatmentType: 'not_found', planningError: false };
  }
  
  // Test the buggy planning for SKU002
  const buggyResult = buggyPhase1Planning(problematicBin, 'SKU002');
  console.log(`SKU002 Buggy Planning Result:`);
  console.log(`  Available: ${buggyResult.available} (WRONG! Should be 2)`);
  console.log(`  Treatment: ${buggyResult.treatmentType} (WRONG! Should be mixed)`);
  console.log(`  Error: ${buggyResult.planningError ? 'YES - This will cause execution failure' : 'NO'}`);
  
  // Simulate Phase 2 execution logic (CORRECT VERSION)
  console.log('\n📦 PHASE 2: CORRECT EXECUTION LOGIC');
  console.log('====================================');
  
  function correctPhase2Execution(bin, targetSku, requestedQty) {
    let actualAvailable = 0;
    
    if (bin.sku === targetSku && !bin.mixedContents) {
      // Pure bin
      actualAvailable = bin.currentQty;
    } else if (bin.mixedContents) {
      // Mixed bin - find the specific SKU quantity
      const matchingContent = bin.mixedContents.find(content => content.sku === targetSku);
      actualAvailable = matchingContent ? matchingContent.quantity : 0;
    }
    
    const canPick = actualAvailable >= requestedQty;
    
    return {
      actualAvailable,
      requestedQty,
      canPick,
      error: canPick ? null : `Insufficient quantity of SKU ${targetSku} in bin ${bin.code}. Available: ${actualAvailable}, Requested: ${requestedQty}`
    };
  }
  
  // Test the correct execution for SKU002
  const correctResult = correctPhase2Execution(problematicBin, 'SKU002', 10);
  console.log(`SKU002 Correct Execution Result:`);
  console.log(`  Actually available: ${correctResult.actualAvailable}`);
  console.log(`  Requested: ${correctResult.requestedQty}`);
  console.log(`  Can pick: ${correctResult.canPick ? 'YES' : 'NO'}`);
  if (correctResult.error) {
    console.log(`  Error: ${correctResult.error}`);
  }
  
  // Show the discrepancy
  console.log('\n⚠️  PHASE 1 vs PHASE 2 DISCREPANCY:');
  console.log('====================================');
  console.log(`Phase 1 (Buggy): Says ${buggyResult.available} units available for SKU002`);
  console.log(`Phase 2 (Correct): Actually only ${correctResult.actualAvailable} units available for SKU002`);
  console.log(`Discrepancy: ${buggyResult.available - correctResult.actualAvailable} units`);
  console.log(`This causes the "Insufficient quantity" error in production!`);
  
  // Demonstrate the fix
  console.log('\n🔧 CORRECTED PHASE 1 PLANNING LOGIC:');
  console.log('====================================');
  
  function fixedPhase1Planning(bin, targetSku) {
    let available = 0;
    let treatmentType = 'not_found';
    
    if (bin.sku === targetSku && !bin.mixedContents) {
      // Pure bin
      available = bin.currentQty;
      treatmentType = 'pure';
    } else if (bin.mixedContents) {
      // Mixed bin - check mixed contents
      const matchingContent = bin.mixedContents.find(content => content.sku === targetSku);
      if (matchingContent) {
        available = matchingContent.quantity;
        treatmentType = 'mixed';
      }
    }
    
    return { available, treatmentType, planningError: false };
  }
  
  const fixedResult = fixedPhase1Planning(problematicBin, 'SKU002');
  console.log(`SKU002 Fixed Planning Result:`);
  console.log(`  Available: ${fixedResult.available} (CORRECT!)`);
  console.log(`  Treatment: ${fixedResult.treatmentType} (CORRECT!)`);
  console.log(`  Error: ${fixedResult.planningError ? 'YES' : 'NO'} (FIXED!)`);
  
  // Verify the fix matches execution
  const verifyResult = correctPhase2Execution(problematicBin, 'SKU002', fixedResult.available);
  console.log('\n✅ VERIFICATION:');
  console.log(`Fixed Phase 1 says: ${fixedResult.available} available`);
  console.log(`Phase 2 can pick: ${verifyResult.canPick ? 'YES' : 'NO'}`);
  console.log(`Result: ${verifyResult.canPick ? '🎉 CONSISTENT!' : '❌ Still inconsistent'}`);
  
  return {
    bugDetected: buggyResult.available !== correctResult.actualAvailable,
    bugFixed: fixedResult.available === correctResult.actualAvailable,
    originalError: correctResult.error,
    fixWorks: verifyResult.canPick
  };
}

// Test multiple scenarios
async function testMultipleMixedBinScenarios() {
  console.log('\n🧪 TESTING MULTIPLE MIXED BIN SCENARIOS');
  console.log('========================================');
  
  const testScenarios = [
    {
      name: 'Pure bin (baseline)',
      bin: {
        id: 'pure1',
        code: 'WH01-PURE-BIN',
        sku: 'SKU001',
        currentQty: 10,
        mixedContents: null
      },
      testSku: 'SKU001',
      expectedAvailable: 10
    },
    {
      name: 'Mixed bin - primary SKU',
      bin: {
        id: 'mixed1',
        code: 'WH01-MIXED-BIN-1',
        sku: 'SKU001',
        currentQty: 15,
        mixedContents: [
          { sku: 'SKU001', quantity: 8, lotNumber: 'LOT001', expiryDate: '2025-12-31' },
          { sku: 'SKU002', quantity: 7, lotNumber: 'LOT002', expiryDate: '2025-11-30' }
        ]
      },
      testSku: 'SKU001',
      expectedAvailable: 8  // Not 15!
    },
    {
      name: 'Mixed bin - secondary SKU',
      bin: {
        id: 'mixed2',
        code: 'WH01-MIXED-BIN-2',
        sku: 'SKU001',
        currentQty: 15,
        mixedContents: [
          { sku: 'SKU001', quantity: 8, lotNumber: 'LOT001', expiryDate: '2025-12-31' },
          { sku: 'SKU002', quantity: 7, lotNumber: 'LOT002', expiryDate: '2025-11-30' }
        ]
      },
      testSku: 'SKU002',
      expectedAvailable: 7  // Not 0!
    },
    {
      name: 'Production scenario (SKU002 in B3)',
      bin: {
        id: 'production',
        code: 'WH01-GF-R01-G01-B3',
        sku: 'SKU002',
        currentQty: 10,
        mixedContents: [
          { sku: 'SKU002', quantity: 2, lotNumber: 'LOT002', expiryDate: '2025-11-30' },
          { sku: 'SKU003', quantity: 8, lotNumber: 'LOT003', expiryDate: '2025-10-31' }
        ]
      },
      testSku: 'SKU002',
      expectedAvailable: 2  // Not 10!
    }
  ];
  
  console.log('Testing various mixed bin scenarios...\n');
  
  let buggyPlanningErrors = 0;
  let totalScenarios = testScenarios.length;
  
  testScenarios.forEach((scenario, index) => {
    console.log(`📋 Scenario ${index + 1}: ${scenario.name}`);
    console.log(`   Bin: ${scenario.bin.code}, Primary SKU: ${scenario.bin.sku}, Total Qty: ${scenario.bin.currentQty}`);
    console.log(`   Testing availability for: ${scenario.testSku}`);
    
    // Buggy planning (treats mixed bins as pure)
    const buggyAvailable = scenario.bin.sku === scenario.testSku ? scenario.bin.currentQty : 0;
    
    // Correct calculation
    let correctAvailable = 0;
    if (scenario.bin.sku === scenario.testSku && !scenario.bin.mixedContents) {
      correctAvailable = scenario.bin.currentQty;
    } else if (scenario.bin.mixedContents) {
      const match = scenario.bin.mixedContents.find(c => c.sku === scenario.testSku);
      correctAvailable = match ? match.quantity : 0;
    }
    
    const hasBug = buggyAvailable !== correctAvailable;
    if (hasBug) buggyPlanningErrors++;
    
    console.log(`   Buggy planning: ${buggyAvailable} available`);
    console.log(`   Correct planning: ${correctAvailable} available`);
    console.log(`   Expected: ${scenario.expectedAvailable}`);
    console.log(`   Status: ${hasBug ? '❌ BUG DETECTED' : '✅ OK'}`);
    console.log('');
  });
  
  console.log(`📊 SUMMARY:`);
  console.log(`   Total scenarios tested: ${totalScenarios}`);
  console.log(`   Scenarios with bugs: ${buggyPlanningErrors}`);
  console.log(`   Bug detection rate: ${((buggyPlanningErrors / totalScenarios) * 100).toFixed(1)}%`);
  console.log(`   Overall result: ${buggyPlanningErrors > 0 ? '❌ BUGS FOUND' : '✅ NO BUGS'}`);
  
  return {
    totalScenarios,
    bugsFound: buggyPlanningErrors,
    bugRate: (buggyPlanningErrors / totalScenarios) * 100
  };
}

// Main execution
async function runMixedBinBugTests() {
  console.log('🐛 MIXED BIN BUG ANALYSIS SUITE');
  console.log('================================');
  console.log('Analyzing the mixed bin planning vs execution discrepancy\n');
  
  // Test 1: Reproduce the specific bug
  const bugResult = await reproduceMixedBinPlanningBug();
  
  // Test 2: Test multiple scenarios
  const scenarioResult = await testMultipleMixedBinScenarios();
  
  // Final analysis
  console.log('\n🎯 FINAL ANALYSIS');
  console.log('==================');
  console.log(`Bug reproduced: ${bugResult.bugDetected ? '✅ YES' : '❌ NO'}`);
  console.log(`Fix works: ${bugResult.bugFixed ? '✅ YES' : '❌ NO'}`);
  console.log(`Scenarios with bugs: ${scenarioResult.bugsFound}/${scenarioResult.totalScenarios}`);
  console.log(`Bug rate: ${scenarioResult.bugRate.toFixed(1)}%`);
  
  if (bugResult.bugDetected) {
    console.log('\n🔧 RECOMMENDED FIXES:');
    console.log('1. Update Phase 1 planning logic to check mixedContents for availability calculation');
    console.log('2. Ensure FIFO sorting considers mixed bins correctly');
    console.log('3. Add validation between Phase 1 and Phase 2 to catch discrepancies');
    console.log('4. Implement proper mixed bin handling in warehouseOperations.js line ~693');
  }
  
  return {
    bugDetected: bugResult.bugDetected,
    fixVerified: bugResult.bugFixed,
    scenariosPassed: scenarioResult.totalScenarios - scenarioResult.bugsFound,
    totalScenarios: scenarioResult.totalScenarios
  };
}

// Run if called directly
if (require.main === module) {
  runMixedBinBugTests().catch(console.error);
}

module.exports = {
  reproduceMixedBinPlanningBug,
  testMultipleMixedBinScenarios,
  runMixedBinBugTests
};
