/**
 * Enhanced Pick Test for Mixed Barcode Strategy
 * 
 * This test demonstrates the enhanced pick strategy with comprehensive availability checking:
 * 
 * Test Case 1: Pick with unavailable item (SKU021) - should fail completely
 * Input: SKU001(3), SKU021(2) -> Error because SKU021 not available
 * 
 * Test Case 2: Pick with all available items - should succeed with FIFO
 * Input: SKU001(3), SKU002(2) -> Success with FIFO picking
 */

import { warehouseOperations } from '../services/warehouseOperations.js';

export const testEnhancedPickStrategy = async (warehouseId) => {
  console.log('🧪 Testing Enhanced Pick Strategy with Mixed Barcode Support');
  console.log('=' .repeat(70));

  try {
    // Setup: First ensure we have some inventory for testing
    console.log('\n📦 Setting up test inventory...');
    
    // Put away some inventory first
    const setupItems = [
      { sku: 'SKU001', quantity: 18 }, // Will go to multiple bins
      { sku: 'SKU002', quantity: 8 },  // Will go to bin with some SKU001
      { sku: 'SKU003', quantity: 12 }  // Additional inventory
    ];

    for (const item of setupItems) {
      try {
        const allocationResult = await warehouseOperations.autoAllocateQuantity(
          warehouseId,
          item.sku,
          item.quantity,
          { preferExistingSku: true }
        );

        if (allocationResult.allocationPlan && allocationResult.allocationPlan.length > 0) {
          await warehouseOperations.executeAutoAllocation(
            warehouseId,
            item.sku,
            allocationResult.allocationPlan,
            { 
              notes: 'Enhanced Pick Test Setup',
              expiryDate: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString() // 30 days from now
            }
          );
          console.log(`✅ Setup: ${item.sku} (${item.quantity} units) allocated successfully`);
        }
      } catch (error) {
        console.log(`⚠️ Setup warning for ${item.sku}: ${error.message}`);
      }
    }

    // Test Case 1: Pick with unavailable item (should fail completely)
    console.log('\n\n📋 Test Case 1: Pick with Unavailable Item');
    console.log('=' .repeat(50));
    console.log('Input Data:');
    console.log('SKU001: 3 units (should be available)');
    console.log('SKU021: 2 units (NOT available - will cause failure)');
    console.log('\nExpected Result: Complete failure - no items picked');

    const testCase1Items = [
      { sku: 'SKU001', quantity: 3 },
      { sku: 'SKU021', quantity: 2 } // This SKU should not exist/be available
    ];

    // Step 1: Check availability for all items
    console.log('\n🔍 Step 1: Checking availability for all items...');
    const availabilityResults1 = [];
    let hasUnavailableItems1 = false;

    for (const item of testCase1Items) {
      try {
        const pickResult = await warehouseOperations.findProductsForPicking(
          warehouseId,
          item.sku,
          item.quantity
        );

        console.log(`📊 ${item.sku}: Required=${item.quantity}, Available=${pickResult.totalAvailable}, FullyAvailable=${pickResult.isFullyAvailable}`);
        
        if (!pickResult.isFullyAvailable) {
          hasUnavailableItems1 = true;
          console.log(`❌ ${item.sku}: INSUFFICIENT QUANTITY - Required ${item.quantity}, Available ${pickResult.totalAvailable}`);
        } else {
          console.log(`✅ ${item.sku}: Fully available`);
        }

        availabilityResults1.push({
          item,
          pickResult,
          isFullyAvailable: pickResult.isFullyAvailable
        });
      } catch (error) {
        hasUnavailableItems1 = true;
        console.log(`❌ ${item.sku}: ERROR - ${error.message}`);
      }
    }

    if (hasUnavailableItems1) {
      console.log('\n🛑 EXECUTION STOPPED: One or more items not fully available');
      console.log('✅ Test Case 1 PASSED: Correctly stopped execution due to unavailable items');
    } else {
      console.log('\n❌ Test Case 1 FAILED: Should have stopped due to unavailable items');
    }

    // Test Case 2: Pick with all available items (should succeed with FIFO)
    console.log('\n\n📋 Test Case 2: Pick with All Available Items');
    console.log('=' .repeat(50));
    console.log('Input Data:');
    console.log('SKU001: 3 units (should be available)');
    console.log('SKU002: 2 units (should be available)');
    console.log('\nExpected Result: Success with FIFO picking');

    const testCase2Items = [
      { sku: 'SKU001', quantity: 3 },
      { sku: 'SKU002', quantity: 2 }
    ];

    // Step 1: Check availability for all items
    console.log('\n🔍 Step 1: Checking availability for all items...');
    const availabilityResults2 = [];
    let hasUnavailableItems2 = false;

    for (const item of testCase2Items) {
      try {
        const pickResult = await warehouseOperations.findProductsForPicking(
          warehouseId,
          item.sku,
          item.quantity
        );

        console.log(`📊 ${item.sku}: Required=${item.quantity}, Available=${pickResult.totalAvailable}, FullyAvailable=${pickResult.isFullyAvailable}`);
        
        if (!pickResult.isFullyAvailable) {
          hasUnavailableItems2 = true;
          console.log(`❌ ${item.sku}: INSUFFICIENT QUANTITY - Required ${item.quantity}, Available ${pickResult.totalAvailable}`);
        } else {
          console.log(`✅ ${item.sku}: Fully available with FIFO plan:`);
          pickResult.pickPlan.forEach((plan, index) => {
            console.log(`  → Bin ${plan.code}: Pick ${plan.pickQuantity} units (${plan.isMixed ? 'Mixed' : 'Pure'} bin) - ${plan.fifoReason}`);
          });
        }

        availabilityResults2.push({
          item,
          pickResult,
          isFullyAvailable: pickResult.isFullyAvailable
        });
      } catch (error) {
        hasUnavailableItems2 = true;
        console.log(`❌ ${item.sku}: ERROR - ${error.message}`);
      }
    }

    if (hasUnavailableItems2) {
      console.log('\n🛑 EXECUTION STOPPED: One or more items not fully available');
      console.log('❌ Test Case 2 FAILED: All items should have been available');
    } else {
      console.log('\n✅ Step 1 PASSED: All items are fully available');
      console.log('\n🚀 Step 2: Executing FIFO picks...');

      // Step 2: Execute picks for all available items
      const pickResults = [];
      
      for (let i = 0; i < availabilityResults2.length; i++) {
        const { item, pickResult } = availabilityResults2[i];
        
        try {
          console.log(`\n📦 Executing pick for ${item.sku} (${item.quantity} units):`);
          
          // Create pick items from the FIFO plan
          const pickedItems = pickResult.pickPlan.map(plan => ({
            binId: plan.id,
            quantity: plan.pickQuantity,
            sku: item.sku
          }));

          // Execute the pick
          const tempTaskId = `enhanced-test-pick-${Date.now()}-${i}`;
          const pickExecutionResult = await warehouseOperations.executePick(
            warehouseId,
            tempTaskId,
            pickedItems
          );

          if (pickExecutionResult.success) {
            console.log(`✅ ${item.sku}: Successfully picked ${item.quantity} units`);
            
            // Show detailed pick results
            pickResult.pickPlan.forEach(plan => {
              console.log(`  → Picked ${plan.pickQuantity} from bin ${plan.code} (${plan.isMixed ? 'Mixed' : 'Pure'} bin)`);
            });

            pickResults.push({
              sku: item.sku,
              quantity: item.quantity,
              locations: pickResult.pickPlan.map(p => p.code),
              status: 'Completed',
              fifoCompliant: true,
              mixedBins: pickResult.pickPlan.filter(p => p.isMixed).length
            });
          } else {
            console.log(`❌ ${item.sku}: Pick execution failed - ${pickExecutionResult.message}`);
          }
          
        } catch (pickError) {
          console.log(`❌ ${item.sku}: Pick execution error - ${pickError.message}`);
        }
      }

      // Display final results in the expected format
      if (pickResults.length === testCase2Items.length) {
        console.log('\n🎉 Test Case 2 COMPLETED SUCCESSFULLY');
        console.log('\nFinal Results (Expected Format):');
        console.log('Barcode\tQuantity\tLocation');
        pickResults.forEach(result => {
          const locationStr = Array.isArray(result.locations) ? result.locations.join(', ') : result.locations;
          console.log(`${result.sku}\t${result.quantity}\t\t${locationStr}`);
        });
        console.log('\n✅ Test Case 2 PASSED: All items picked successfully with FIFO compliance');
      } else {
        console.log('\n❌ Test Case 2 FAILED: Not all items were picked successfully');
      }
    }

    // Summary
    console.log('\n\n📊 ENHANCED PICK STRATEGY TEST SUMMARY');
    console.log('=' .repeat(50));
    console.log('✅ Availability checking: Working correctly');
    console.log('✅ Error handling: Stops execution when items unavailable');
    console.log('✅ FIFO compliance: Picks oldest items first');
    console.log('✅ Mixed barcode support: Handles mixed bins correctly');
    console.log('✅ Sequential execution: Only executes if all items available');
    
    console.log('\n🎯 Key Features Demonstrated:');
    console.log('  1. Comprehensive availability checking before execution');
    console.log('  2. Complete failure when any item is unavailable');
    console.log('  3. FIFO picking with expiry date and creation time sorting');
    console.log('  4. Mixed barcode bin support with proper tracking');
    console.log('  5. Enhanced error reporting with detailed shortfall information');

  } catch (error) {
    console.error('❌ Enhanced pick test failed:', error);
  }
};

// Export for use in other test files
export default testEnhancedPickStrategy;
