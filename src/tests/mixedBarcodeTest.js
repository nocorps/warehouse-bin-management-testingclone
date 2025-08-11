/**
 * Test Mixed Barcode Allocation Strategy
 * 
 * This test demonstrates the new mixed barcode allocation strategy:
 * 1. Priority 1: Fill same SKU bins first
 * 2. Priority 2: Search all bins from first to last for available space (mixed barcodes allowed)
 */

import { warehouseOperations } from '../services/warehouseOperations.js';

export const testMixedBarcodeStrategy = async (warehouseId) => {
  console.log('🧪 Testing Mixed Barcode Allocation Strategy');
  console.log('=' .repeat(60));

  try {
    // Test Case 1: First execution as described in requirements
    console.log('\n📋 Test Case 1: First Execution');
    console.log('Input Data:');
    console.log('SKU001: 15 units');
    console.log('SKU002: 3 units');
    console.log('SKU003: 16 units');
    console.log('SKU006: 3 units');
    console.log('Bin capacity: 10 units each');

    const firstExecution = [
      { sku: 'SKU001', quantity: 15 },
      { sku: 'SKU002', quantity: 3 },
      { sku: 'SKU003', quantity: 16 },
      { sku: 'SKU006', quantity: 3 }
    ];

    console.log('\n🔄 Processing first execution...');
    for (const item of firstExecution) {
      try {
        const result = await warehouseOperations.autoAllocateQuantity(
          warehouseId,
          item.sku,
          item.quantity,
          { preferExistingSku: true }
        );

        console.log(`\n✅ ${item.sku} (${item.quantity} units):`);
        if (result.allocationPlan) {
          result.allocationPlan.forEach((allocation, index) => {
            console.log(`  → Bin ${allocation.bin.code}: ${allocation.allocatedQuantity} units (${allocation.reason})`);
          });
        }

        // Execute the allocation
        if (result.allocationPlan && result.allocationPlan.length > 0) {
          await warehouseOperations.executeAutoAllocation(
            warehouseId,
            item.sku,
            result.allocationPlan,
            { notes: 'Mixed Barcode Test - First Execution' }
          );
        }
      } catch (error) {
        console.error(`❌ Error processing ${item.sku}:`, error.message);
      }
    }

    // Test Case 2: Second execution
    console.log('\n\n📋 Test Case 2: Second Execution');
    console.log('Input Data:');
    console.log('SKU005: 1 unit');
    console.log('SKU001: 3 units');
    console.log('SKU004: 5 units');

    const secondExecution = [
      { sku: 'SKU005', quantity: 1 },
      { sku: 'SKU001', quantity: 3 },
      { sku: 'SKU004', quantity: 5 }
    ];

    console.log('\n🔄 Processing second execution...');
    for (const item of secondExecution) {
      try {
        const result = await warehouseOperations.autoAllocateQuantity(
          warehouseId,
          item.sku,
          item.quantity,
          { preferExistingSku: true }
        );

        console.log(`\n✅ ${item.sku} (${item.quantity} units):`);
        if (result.allocationPlan) {
          result.allocationPlan.forEach((allocation, index) => {
            console.log(`  → Bin ${allocation.bin.code}: ${allocation.allocatedQuantity} units (${allocation.reason})`);
            if (allocation.isMixed) {
              console.log(`    💡 Mixed bin - will contain multiple SKUs`);
            }
          });
        }

        // Execute the allocation
        if (result.allocationPlan && result.allocationPlan.length > 0) {
          await warehouseOperations.executeAutoAllocation(
            warehouseId,
            item.sku,
            result.allocationPlan,
            { notes: 'Mixed Barcode Test - Second Execution' }
          );
        }
      } catch (error) {
        console.error(`❌ Error processing ${item.sku}:`, error.message);
      }
    }

    // Test Case 3: Pick operations
    console.log('\n\n📋 Test Case 3: Pick Operations');
    console.log('Attempting to pick:');
    console.log('SKU001: 3 units');
    console.log('SKU002: 2 units');

    const pickRequests = [
      { sku: 'SKU001', quantity: 3 },
      { sku: 'SKU002', quantity: 2 }
    ];

    for (const pickRequest of pickRequests) {
      try {
        console.log(`\n🔍 Finding ${pickRequest.sku} (${pickRequest.quantity} units)...`);
        
        const pickResult = await warehouseOperations.findProductsForPicking(
          warehouseId,
          pickRequest.sku,
          pickRequest.quantity
        );

        if (pickResult.isFullyAvailable) {
          console.log(`✅ ${pickRequest.sku} - Fully available:`);
          pickResult.pickPlan.forEach(plan => {
            console.log(`  → Pick ${plan.pickQuantity} from bin ${plan.code} (${plan.isMixed ? 'Mixed' : 'Pure'} bin)`);
            if (plan.isMixed) {
              console.log(`    💡 Mixed bin contains: Primary ${plan.originalBinSKU}, picking ${plan.skuInfo.sku}`);
            }
          });

          // Execute the pick
          const pickedItems = pickResult.pickPlan.map(plan => ({
            binId: plan.id,
            quantity: plan.pickQuantity,
            sku: pickRequest.sku
          }));

          const pickExecutionResult = await warehouseOperations.executePick(
            warehouseId,
            `test-pick-${Date.now()}`,
            pickedItems
          );

          if (pickExecutionResult.success) {
            console.log(`  ✅ Pick executed successfully`);
          }
        } else {
          console.log(`❌ ${pickRequest.sku} - Not fully available. Available: ${pickResult.totalAvailable}, Required: ${pickRequest.quantity}`);
        }
      } catch (error) {
        console.error(`❌ Error processing pick for ${pickRequest.sku}:`, error.message);
      }
    }

    console.log('\n✅ Mixed Barcode Strategy Test Completed');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Export for use in other test files
export default testMixedBarcodeStrategy;
