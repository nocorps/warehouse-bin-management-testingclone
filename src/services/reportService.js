import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy,
  limit as firestoreLimit,
  doc,
  getDoc
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export class ReportService {
  constructor() {
    this.reportTypes = {
      STOCK_MOVEMENTS: 'stock_movements',
      INVENTORY_SUMMARY: 'inventory_summary',
      PUTAWAY_SUMMARY: 'putaway_summary',
      PICK_SUMMARY: 'pick_summary',
      BIN_UTILIZATION: 'bin_utilization'
    };
  }

  /**
   * Generate report based on configuration
   */
  async generateReport(config) {
    try {
      console.log('📊 Generating report with config:', config);
      
      // Validate and log date range information
      if (config.scope === 'date_range') {
        console.log('🗓️ Date range scope detected:');
        console.log('- Start Date:', config.startDate);
        console.log('- End Date:', config.endDate);
        console.log('- Start Date ISO:', config.startDate instanceof Date ? config.startDate.toISOString() : new Date(config.startDate).toISOString());
        console.log('- End Date ISO:', config.endDate instanceof Date ? config.endDate.toISOString() : new Date(config.endDate).toISOString());
      }
      
      const reportData = {
        config,
        generatedAt: new Date().toISOString(),
        data: null,
        summary: {}
      };

      switch (config.type) {
        case this.reportTypes.STOCK_MOVEMENTS:
          reportData.data = await this.generateStockMovementsReport(config);
          break;
        case this.reportTypes.INVENTORY_SUMMARY:
          reportData.data = await this.generateInventorySummaryReport(config);
          break;
        case this.reportTypes.PUTAWAY_SUMMARY:
          reportData.data = await this.generatePutawaySummaryReport(config);
          break;
        case this.reportTypes.PICK_SUMMARY:
          reportData.data = await this.generatePickSummaryReport(config);
          break;
        case this.reportTypes.BIN_UTILIZATION:
          reportData.data = await this.generateBinUtilizationReport(config);
          break;
        default:
          throw new Error(`Unsupported report type: ${config.type}`);
      }

      console.log('✅ Report generated successfully');
      return reportData;
    } catch (error) {
      console.error('❌ Error generating report:', error);
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  /**
   * Generate stock movements report
   */
  async generateStockMovementsReport(config) {
    try {
      const movements = [];
      const warehouseId = config.warehouseId;
      
      // Track inventory levels by SKU and physical bin location
      const inventoryTracker = new Map(); // key: "SKU_BinId" -> current quantity

      if (!warehouseId) {
        throw new Error('Warehouse ID is required for generating reports');
      }

      // Get current bin status for metadata and closing quantity validation
      const binsRef = collection(db, 'WHT', warehouseId, 'bins');
      const binsSnapshot = await getDocs(binsRef);
      const bins = binsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const binMap = new Map(bins.map(bin => [bin.id, bin]));

      // Get operation history in chronological order (oldest first)
      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      let historyQuery = query(historyRef, orderBy('timestamp', 'asc'));

      if (config.scope === 'date_range' && config.startDate && config.endDate) {
        // Ensure proper date conversion for Firestore timestamp comparison
        // Handle both Date objects and date strings
        let startTimestamp, endTimestamp;
        
        if (config.startDate instanceof Date) {
          startTimestamp = config.startDate.toISOString();
        } else {
          startTimestamp = new Date(config.startDate).toISOString();
        }
        
        if (config.endDate instanceof Date) {
          endTimestamp = config.endDate.toISOString();
        } else {
          endTimestamp = new Date(config.endDate).toISOString();
        }
        
        console.log('🗓️ Date range filter applied:', {
          startISO: startTimestamp,
          endISO: endTimestamp,
          startDate: new Date(startTimestamp).toLocaleString(),
          endDate: new Date(endTimestamp).toLocaleString()
        });
        
        historyQuery = query(
          historyRef,
          where('timestamp', '>=', startTimestamp),
          where('timestamp', '<=', endTimestamp),
          orderBy('timestamp', 'asc')
        );
        
        // For date-filtered reports, initialize inventory tracker with the state 
        // BEFORE the start date by processing earlier operations
        console.log('📅 Date range filtering active, building opening inventory state...');
        
        const preHistoryQuery = query(
          historyRef,
          where('timestamp', '<', startTimestamp),
          orderBy('timestamp', 'asc') // Chronological order to build up state
        );
        
        const preHistorySnapshot = await getDocs(preHistoryQuery);
        const preHistoryItems = preHistorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Build up inventory state from operations before the start date
        for (const item of preHistoryItems) {
          if (item.executionDetails && item.executionDetails.items) {
            for (const execItem of item.executionDetails.items) {
              const sku = execItem.barcode || execItem.sku;
              
              // Skip if SKU filtering is active and this SKU is not selected
              if (config.selectedSkus && config.selectedSkus.length > 0) {
                if (!config.selectedSkus.includes(sku)) {
                  continue;
                }
              }

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
      
      console.log(`📊 Retrieved ${historyItems.length} operations for date range`);
      if (historyItems.length > 0) {
        console.log('📅 First operation timestamp:', historyItems[0].timestamp);
        console.log('📅 Last operation timestamp:', historyItems[historyItems.length - 1].timestamp);
      }

      // Get warehouse details for better location information
      const warehouseRef = doc(db, 'WHT', warehouseId);
      const warehouseDoc = await getDoc(warehouseRef);
      const warehouseDetails = warehouseDoc.exists() ? warehouseDoc.data() : {};
      
      console.log('🏭 Processing warehouse:', warehouseDetails.name || warehouseDetails.code || warehouseId);

      // STEP 1: Process ALL operations in chronological order to build correct inventory levels
      console.log(`📈 Processing ${historyItems.length} operations chronologically...`);
      
      if (config.scope === 'date_range') {
        console.log('🔍 Date range filtering - movements will only include operations within the specified period');
      }
      
      for (const item of historyItems) {
        if (item.executionDetails && item.executionDetails.items) {
          for (const execItem of item.executionDetails.items) {
            const sku = execItem.barcode || execItem.sku;
            
            // Skip if SKU filtering is active and this SKU is not selected
            if (config.selectedSkus && config.selectedSkus.length > 0) {
              if (!config.selectedSkus.includes(sku)) {
                continue;
              }
            }

            // Handle operations with actual allocation details (put-away operations)
            if (item.operationType === 'putaway' && execItem.allocationPlan && Array.isArray(execItem.allocationPlan)) {
              // Use actual allocation details for accurate reporting
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
                
                // Use actual bin location from allocation
                const binCode = allocation.binCode || bin.code || 'Unknown';
                const location = allocation.binLocation || allocation.binCode || bin.code || 'Unknown';
                
                console.log(`📦 PUT-AWAY (from allocation): ${sku} in ${binCode}, Opening: ${openingQty}, Qty: ${quantity}, Closing: ${closingQty}`);
                
                // Create simplified flat record: Barcode, Location, Quantity, Operation
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
                  // Keep legacy fields for compatibility but focus on simplified format
                  opening: openingQty,
                  putaway: quantity,
                  pick: 0,
                  movement: quantity,
                  closing: closingQty,
                  lotNumber: execItem.lotNumber || 'N/A',
                  expiryDate: execItem.expiryDate ? new Date(execItem.expiryDate).toLocaleDateString() : 'N/A',
                  notes: allocation.reason || execItem.notes || '',
                  inventoryKey: inventoryKey
                });
              });
            }
            // Handle pick operations with picked bins details
            else if (item.operationType === 'pick' && execItem.pickedBins && Array.isArray(execItem.pickedBins)) {
              // Use actual picked bins details for accurate reporting
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
                
                // Use actual bin location from picked bins
                const binCode = pickedBin.binCode || bin.code || 'Unknown';
                const location = pickedBin.binCode || bin.code || 'Unknown';
                
                console.log(`📦 PICK (from pickedBins): ${sku} from ${binCode}, Opening: ${openingQty}, Qty: ${quantity}, Closing: ${closingQty}`);
                
                // Create simplified flat record: Barcode, Location, Quantity, Operation
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
                  // Keep legacy fields for compatibility but focus on simplified format
                  opening: openingQty,
                  putaway: 0,
                  pick: quantity,
                  movement: -quantity,
                  closing: closingQty,
                  lotNumber: execItem.lotNumber || 'N/A',
                  expiryDate: execItem.expiryDate ? new Date(execItem.expiryDate).toLocaleDateString() : 'N/A',
                  notes: execItem.notes || execItem.error || '',
                  inventoryKey: inventoryKey
                });
              });
            }
            // Fallback for legacy operations without detailed allocation/picked bin data
            else {
              const bin = binMap.get(execItem.binId) || {};
              
              // Extract quantity
              let quantity = 0;
              if (item.operationType === 'putaway') {
                quantity = parseInt(execItem.quantity) || 0;
              } else if (item.operationType === 'pick') {
                quantity = parseInt(execItem.pickedQty || execItem.quantity) || 0;
              }

              // Create SIMPLE inventory key: SKU + BinId (most reliable)
              const inventoryKey = `${sku}_${execItem.binId || 'UNKNOWN'}`;
              
              // Get current inventory level for this SKU in this bin
              const currentLevel = inventoryTracker.get(inventoryKey) || 0;
              
              // Calculate opening and closing quantities
              let openingQty = currentLevel;
              let closingQty = currentLevel;
              
              if (item.operationType === 'putaway') {
                closingQty = currentLevel + quantity;
              } else if (item.operationType === 'pick') {
                closingQty = Math.max(0, currentLevel - quantity);
              }
              
              // Update inventory tracker
              inventoryTracker.set(inventoryKey, closingQty);
              
              // Get warehouse code
              const warehouseCode = warehouseDetails.code || warehouseDetails.name || 'WH2';
              
              // Use bin code from bin object or extract from execItem
              let binCode = bin.code || execItem.binCode || 'Unknown';
              let location = bin.code || execItem.binCode || 'Unknown';
              
              // If we have full bin details, construct proper location
              if (bin && bin.code) {
                const floorCode = bin.floorCode || 'GF';
                const rackCode = bin.rackCode || 'R01';
                const gridCode = bin.gridLevel ? `G${String(bin.gridLevel).padStart(2, '0')}` : 'G01';
                
                location = `${warehouseCode}-${floorCode}-${rackCode}-${gridCode}-${binCode}`;
              }
              
              console.log(`📦 ${item.operationType.toUpperCase()} (legacy): ${sku} in ${binCode}, Opening: ${openingQty}, Qty: ${quantity}, Closing: ${closingQty}`);
              
              // Create simplified flat record: Barcode, Location, Quantity, Operation
              movements.push({
                date: new Date(item.timestamp).toLocaleDateString(),
                time: new Date(item.timestamp).toLocaleTimeString(),
                timestamp: item.timestamp,
                sku: sku,
                operationType: item.operationType === 'putaway' ? 'Put-Away' : 'Pick',
                quantity: quantity,
                location: location,
                binCode: binCode,
                binId: execItem.binId || 'Unknown',
                status: execItem.status || 'Unknown',
                // Keep legacy fields for compatibility but focus on simplified format
                opening: openingQty,
                putaway: item.operationType === 'putaway' ? quantity : 0,
                pick: item.operationType === 'pick' ? quantity : 0,
                movement: item.operationType === 'pick' ? -quantity : quantity,
                closing: closingQty,
                lotNumber: execItem.lotNumber || 'N/A',
                expiryDate: execItem.expiryDate ? new Date(execItem.expiryDate).toLocaleDateString() : 'N/A',
                notes: execItem.notes || execItem.error || '',
                inventoryKey: inventoryKey
              });
            }
          }
        }
      }

      // Reverse to show most recent first
      movements.reverse();

      // VALIDATION: Check that inventory tracking worked correctly
      console.log('🔍 Validating inventory continuity...');
      const movementsByKey = new Map();
      
      // Group movements by inventory key and reverse them back to chronological order for validation
      movements.slice().reverse().forEach(movement => {
        const key = movement.inventoryKey;
        if (!movementsByKey.has(key)) {
          movementsByKey.set(key, []);
        }
        movementsByKey.get(key).push(movement);
      });
      
      let issuesFound = 0;
      for (const [key, keyMovements] of movementsByKey.entries()) {
        for (let i = 1; i < keyMovements.length; i++) {
          const prev = keyMovements[i - 1];
          const curr = keyMovements[i];
          
          if (curr.opening !== prev.closing) {
            console.warn(`⚠️ Continuity issue for ${key}: prev closing ${prev.closing} != current opening ${curr.opening}`);
            issuesFound++;
          }
        }
      }
      
      console.log(issuesFound === 0 ? '✅ All inventory flows are correct!' : `❌ Found ${issuesFound} continuity issues`);

      console.log(`📋 Stock movements report generated:`);
      console.log(`- Total movements: ${movements.length}`);
      console.log(`- Put-Away operations: ${movements.filter(m => m.operationType === 'Put-Away').length}`);
      console.log(`- Pick operations: ${movements.filter(m => m.operationType === 'Pick').length}`);
      
      if (config.scope === 'date_range') {
        console.log(`- Date range: ${config.startDate} to ${config.endDate}`);
        if (movements.length === 0) {
          console.warn('⚠️ No movements found in the specified date range. Check if operations exist for these dates.');
        }
      }

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
    } catch (error) {
      console.error('❌ Error generating stock movements report:', error);
      throw error;
    }
  }

  /**
   * Generate inventory summary report
   */
  async generateInventorySummaryReport(config) {
    try {
      const warehouseId = config.warehouseId;

      // Get all bins with current inventory
      const binsRef = collection(db, 'WHT', warehouseId, 'bins');
      const binsSnapshot = await getDocs(binsRef);
      const bins = binsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Create individual inventory records for each bin (not grouped by SKU)
      const inventory = [];
      
      bins.forEach(bin => {
        // Check if this bin has mixed contents (multiple SKUs in one bin)
        if (bin.mixedContents && Array.isArray(bin.mixedContents) && bin.mixedContents.length > 0) {
          // For mixed bins, create separate entry for each SKU
          bin.mixedContents.forEach(content => {
            if (content.quantity > 0 && content.sku) {
              // Apply SKU filtering if selectedSkus is provided
              if (config.selectedSkus && config.selectedSkus.length > 0) {
                if (!config.selectedSkus.includes(content.sku)) {
                  return; // Skip this SKU if not in the selected list
                }
              }
              
              // Create individual entry for each SKU in mixed bin
              inventory.push({
                sku: content.sku,
                barcode: content.sku, // Use barcode field for consistency
                location: bin.code,
                binCode: bin.code,
                rackCode: bin.rackCode,
                quantity: parseInt(content.quantity) || 0,
                lotNumber: content.lotNumber,
                expiryDate: content.expiryDate,
                status: 'Current Stock'
              });
            }
          });
        }
        // For pure bins (single SKU), use the original logic
        else if (bin.currentQty > 0 && bin.sku) {
          // Apply SKU filtering if selectedSkus is provided
          if (config.selectedSkus && config.selectedSkus.length > 0) {
            if (!config.selectedSkus.includes(bin.sku)) {
              return; // Skip this bin if SKU is not in the selected list
            }
          }
          
          // Create individual entry for pure bin
          inventory.push({
            sku: bin.sku,
            barcode: bin.sku, // Use barcode field for consistency
            location: bin.code,
            binCode: bin.code,
            rackCode: bin.rackCode,
            quantity: parseInt(bin.currentQty) || 0,
            lotNumber: bin.lotNumber,
            expiryDate: bin.expiryDate,
            status: 'Current Stock'
          });
        }
      });

      // Sort by SKU/barcode, then by location for consistent display
      inventory.sort((a, b) => {
        const skuCompare = (a.sku || '').localeCompare(b.sku || '');
        if (skuCompare !== 0) return skuCompare;
        return (a.location || '').localeCompare(b.location || '');
      });

      console.log(`📦 Inventory summary report generated:`);
      console.log(`- Total inventory rows: ${inventory.length}`);
      console.log(`- Unique SKUs: ${new Set(inventory.map(item => item.sku)).size}`);
      console.log(`- Total bins queried: ${bins.length}`);
      console.log(`- Occupied bins: ${bins.filter(bin => bin.currentQty > 0).length}`);
      
      if (config.selectedSkus && config.selectedSkus.length > 0) {
        console.log(`- SKU filtering applied: ${config.selectedSkus.length} SKUs selected`);
      }

      return {
        inventory,
        summary: {
          totalRows: inventory.length,
          totalSkus: new Set(inventory.map(item => item.sku)).size,
          totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0),
          totalBinsOccupied: bins.filter(bin => bin.currentQty > 0).length,
          totalBinsAvailable: bins.filter(bin => (bin.capacity - (bin.currentQty || 0)) > 0).length,
          utilizationRate: bins.length > 0 ? (bins.filter(bin => bin.currentQty > 0).length / bins.length * 100).toFixed(1) : 0
        }
      };
    } catch (error) {
      console.error('❌ Error generating inventory summary report:', error);
      throw error;
    }
  }

  /**
   * Generate putaway summary report
   */
  async generatePutawaySummaryReport(config) {
    try {
      const warehouseId = config.warehouseId;

      // Get putaway operation history
      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      let historyQuery = query(
        historyRef,
        where('operationType', '==', 'putaway'),
        orderBy('timestamp', 'desc')
      );

      if (config.scope === 'date_range' && config.startDate && config.endDate) {
        let startTimestamp, endTimestamp;
        
        if (config.startDate instanceof Date) {
          startTimestamp = config.startDate.toISOString();
        } else {
          startTimestamp = new Date(config.startDate).toISOString();
        }
        
        if (config.endDate instanceof Date) {
          endTimestamp = config.endDate.toISOString();
        } else {
          endTimestamp = new Date(config.endDate).toISOString();
        }
        
        console.log('🔧 Putaway date filter:', { startTimestamp, endTimestamp });
        
        historyQuery = query(
          historyRef,
          where('operationType', '==', 'putaway'),
          where('timestamp', '>=', startTimestamp),
          where('timestamp', '<=', endTimestamp),
          orderBy('timestamp', 'desc')
        );
      }

      const historySnapshot = await getDocs(historyQuery);
      const putawayOperations = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const summary = {
        totalOperations: putawayOperations.length,
        totalItems: 0,
        successfulItems: 0,
        failedItems: 0,
        totalQuantity: 0,
        averageItemsPerOperation: 0,
        successRate: 0,
        dailyStats: new Map()
      };

      const operations = [];

      putawayOperations.forEach(operation => {
        const date = new Date(operation.timestamp).toLocaleDateString();
        const items = operation.executionDetails?.items || [];
        
        const successCount = items.filter(item => item.status === 'Completed').length;
        const failCount = items.filter(item => item.status === 'Failed').length;
        const totalQty = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);

        operations.push({
          date,
          fileName: operation.fileName,
          totalItems: items.length,
          successfulItems: successCount,
          failedItems: failCount,
          totalQuantity: totalQty,
          successRate: items.length > 0 ? (successCount / items.length * 100).toFixed(1) : 0
        });

        // Update summary
        summary.totalItems += items.length;
        summary.successfulItems += successCount;
        summary.failedItems += failCount;
        summary.totalQuantity += totalQty;

        // Daily stats
        if (!summary.dailyStats.has(date)) {
          summary.dailyStats.set(date, { operations: 0, items: 0, quantity: 0 });
        }
        const dayStats = summary.dailyStats.get(date);
        dayStats.operations += 1;
        dayStats.items += items.length;
        dayStats.quantity += totalQty;
      });

      summary.averageItemsPerOperation = summary.totalOperations > 0 ? (summary.totalItems / summary.totalOperations).toFixed(1) : 0;
      summary.successRate = summary.totalItems > 0 ? (summary.successfulItems / summary.totalItems * 100).toFixed(1) : 0;

      return {
        operations,
        summary,
        dailyStats: Array.from(summary.dailyStats.entries()).map(([date, stats]) => ({ date, ...stats }))
      };
    } catch (error) {
      console.error('❌ Error generating putaway summary report:', error);
      throw error;
    }
  }

  /**
   * Generate pick summary report
   */
  async generatePickSummaryReport(config) {
    try {
      const warehouseId = config.warehouseId;

      // Get pick operation history
      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      let historyQuery = query(
        historyRef,
        where('operationType', '==', 'pick'),
        orderBy('timestamp', 'desc')
      );

      if (config.scope === 'date_range' && config.startDate && config.endDate) {
        let startTimestamp, endTimestamp;
        
        if (config.startDate instanceof Date) {
          startTimestamp = config.startDate.toISOString();
        } else {
          startTimestamp = new Date(config.startDate).toISOString();
        }
        
        if (config.endDate instanceof Date) {
          endTimestamp = config.endDate.toISOString();
        } else {
          endTimestamp = new Date(config.endDate).toISOString();
        }
        
        console.log('🎯 Pick date filter:', { startTimestamp, endTimestamp });
        
        historyQuery = query(
          historyRef,
          where('operationType', '==', 'pick'),
          where('timestamp', '>=', startTimestamp),
          where('timestamp', '<=', endTimestamp),
          orderBy('timestamp', 'desc')
        );
      }

      const historySnapshot = await getDocs(historyQuery);
      const pickOperations = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const summary = {
        totalOperations: pickOperations.length,
        totalItems: 0,
        successfulItems: 0,
        partialItems: 0,
        failedItems: 0,
        totalQuantityRequested: 0,
        totalQuantityPicked: 0,
        fillRate: 0,
        dailyStats: new Map()
      };

      const operations = [];

      pickOperations.forEach(operation => {
        const date = new Date(operation.timestamp).toLocaleDateString();
        const items = operation.executionDetails?.items || [];
        
        const successCount = items.filter(item => item.status === 'Completed').length;
        const partialCount = items.filter(item => item.status === 'Partial').length;
        const failCount = items.filter(item => item.status === 'Failed').length;
        const requestedQty = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
        const pickedQty = items.reduce((sum, item) => sum + (parseInt(item.pickedQty) || 0), 0);

        operations.push({
          date,
          fileName: operation.fileName,
          totalItems: items.length,
          successfulItems: successCount,
          partialItems: partialCount,
          failedItems: failCount,
          requestedQuantity: requestedQty,
          pickedQuantity: pickedQty,
          fillRate: requestedQty > 0 ? (pickedQty / requestedQty * 100).toFixed(1) : 0
        });

        // Update summary
        summary.totalItems += items.length;
        summary.successfulItems += successCount;
        summary.partialItems += partialCount;
        summary.failedItems += failCount;
        summary.totalQuantityRequested += requestedQty;
        summary.totalQuantityPicked += pickedQty;

        // Daily stats
        if (!summary.dailyStats.has(date)) {
          summary.dailyStats.set(date, { operations: 0, items: 0, requested: 0, picked: 0 });
        }
        const dayStats = summary.dailyStats.get(date);
        dayStats.operations += 1;
        dayStats.items += items.length;
        dayStats.requested += requestedQty;
        dayStats.picked += pickedQty;
      });

      summary.fillRate = summary.totalQuantityRequested > 0 ? 
        (summary.totalQuantityPicked / summary.totalQuantityRequested * 100).toFixed(1) : 0;

      return {
        operations,
        summary,
        dailyStats: Array.from(summary.dailyStats.entries()).map(([date, stats]) => ({ 
          date, 
          ...stats,
          fillRate: stats.requested > 0 ? (stats.picked / stats.requested * 100).toFixed(1) : 0
        }))
      };
    } catch (error) {
      console.error('❌ Error generating pick summary report:', error);
      throw error;
    }
  }

  /**
   * Generate bin utilization report
   */
  async generateBinUtilizationReport(config) {
    try {
      const warehouseId = config.warehouseId;

      // Get all bins
      const binsRef = collection(db, 'WHT', warehouseId, 'bins');
      const binsSnapshot = await getDocs(binsRef);
      const bins = binsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Get all racks for grouping
      const racksRef = collection(db, 'WHT', warehouseId, 'racks');
      const racksSnapshot = await getDocs(racksRef);
      const racks = racksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const rackMap = new Map(racks.map(rack => [rack.code, rack]));

      const utilization = bins.map(bin => {
        const currentQty = parseInt(bin.currentQty) || 0;
        const capacity = parseInt(bin.capacity) || 0;
        const utilizationPct = capacity > 0 ? (currentQty / capacity * 100).toFixed(1) : 0;
        const rack = rackMap.get(bin.rackCode) || {};

        return {
          binCode: bin.code,
          rackCode: bin.rackCode,
          rackName: rack.name || bin.rackCode,
          shelfLevel: bin.shelfLevel || 1,
          capacity,
          currentQuantity: currentQty,
          availableSpace: capacity - currentQty,
          utilizationPercent: parseFloat(utilizationPct),
          status: bin.status || 'available',
          sku: bin.sku || 'Empty',
          lastUpdated: bin.lastUpdated ? new Date(bin.lastUpdated).toLocaleDateString() : 'N/A'
        };
      });

      // Calculate summary statistics
      const summary = {
        totalBins: bins.length,
        occupiedBins: bins.filter(bin => (bin.currentQty || 0) > 0).length,
        emptyBins: bins.filter(bin => (bin.currentQty || 0) === 0).length,
        fullBins: bins.filter(bin => (bin.currentQty || 0) >= (bin.capacity || 0)).length,
        totalCapacity: bins.reduce((sum, bin) => sum + (parseInt(bin.capacity) || 0), 0),
        totalOccupied: bins.reduce((sum, bin) => sum + (parseInt(bin.currentQty) || 0), 0),
        averageUtilization: 0,
        rackStats: new Map()
      };

      summary.totalAvailable = summary.totalCapacity - summary.totalOccupied;
      summary.overallUtilization = summary.totalCapacity > 0 ? 
        (summary.totalOccupied / summary.totalCapacity * 100).toFixed(1) : 0;

      // Calculate rack-level statistics
      utilization.forEach(bin => {
        if (!summary.rackStats.has(bin.rackCode)) {
          summary.rackStats.set(bin.rackCode, {
            rackCode: bin.rackCode,
            rackName: bin.rackName,
            totalBins: 0,
            occupiedBins: 0,
            totalCapacity: 0,
            totalOccupied: 0,
            utilization: 0
          });
        }
        
        const rackStats = summary.rackStats.get(bin.rackCode);
        rackStats.totalBins += 1;
        rackStats.totalCapacity += bin.capacity;
        rackStats.totalOccupied += bin.currentQuantity;
        
        if (bin.currentQuantity > 0) {
          rackStats.occupiedBins += 1;
        }
        
        rackStats.utilization = rackStats.totalCapacity > 0 ? 
          (rackStats.totalOccupied / rackStats.totalCapacity * 100).toFixed(1) : 0;
      });

      return {
        utilization,
        summary: {
          ...summary,
          rackStats: Array.from(summary.rackStats.values())
        }
      };
    } catch (error) {
      console.error('❌ Error generating bin utilization report:', error);
      throw error;
    }
  }

  /**
   * Download Excel report
   */
  async downloadExcelReport(reportData) {
    try {
      const workbook = XLSX.utils.book_new();
      
      // Always use simplified format with barcode, location, quantity, operation
      if (reportData.config.type === this.reportTypes.STOCK_MOVEMENTS) {
        // Create data with simplified columns
        const movementRows = [
          ['Barcode', 'Location', 'Quantity', 'Operation']
        ];
        
        // Extract and format the movements
        reportData.data.movements.forEach(m => {
          const barcode = m.sku || 'N/A';
          const location = m.location || 'N/A';
          const quantity = m.quantity || 0;
          const operation = m.operationType || 'Unknown';
          
          // Add single row per movement - use actual data without modification
          movementRows.push([
            barcode,
            location,
            quantity,
            operation
          ]);
        });
        
        const movementSheet = XLSX.utils.aoa_to_sheet(movementRows);
        XLSX.utils.book_append_sheet(workbook, movementSheet, 'Stock Movements');
      } else {
        // For all other report types, use a simplified approach without summary sheet
        // Create data with just essential columns
        const reportRows = [
          ['Barcode', 'Location', 'Quantity', 'Operation']
        ];
        
        if (reportData.data.operations) {
          // For putaway or pick summary reports
          reportData.data.operations.forEach(op => {
            const barcode = op.barcode || op.sku || 'N/A';
            
            // Handle locations - if comma-separated, split into multiple rows
            const locationStr = op.location || op.binCode || 'N/A';
            const totalQty = parseInt(op.quantity || op.pickedQty || 0);
            const operationType = reportData.config.type.includes('putaway') ? 'Put-Away' : 'Pick';
            
            // Process location for potential multi-bin pattern with dashes (WH01-SF-R10-G02-WH01-GF-R01-G02-A2)
            let locations = [];
            
            if (locationStr.includes('-')) {
              // Split by dashes and look for warehouse code patterns
              const parts = locationStr.split('-');
              let locationParts = [];
              let currentLocation = [];
              
              // Assume the first part is always part of the first location
              currentLocation.push(parts[0]);
              
              // Look for warehouse code patterns (like WH01) in the middle of the string
              for (let i = 1; i < parts.length; i++) {
                // If we find a warehouse prefix (not at the beginning)
                if (parts[i].match(/^WH\d+$/)) {
                  // Add the current completed location
                  locationParts.push(currentLocation.join('-'));
                  // Start a new location
                  currentLocation = [parts[i]];
                } else {
                  // Add to current location
                  currentLocation.push(parts[i]);
                }
              }
              
              // Add the last location if there's anything in currentLocation
              if (currentLocation.length > 0) {
                locationParts.push(currentLocation.join('-'));
              }
              
              // Use the extracted locations if we found multiple
              if (locationParts.length > 1) {
                locations = locationParts;
              } else {
                locations = [locationStr];
              }
            } else if (locationStr.includes(',')) {
              // Location string already has commas
              locations = locationStr.split(',').map(loc => loc.trim());
            } else {
              // Single location
              locations = [locationStr];
            }
            
            // Add individual rows for each location (atomic rows only)
            if (locations.length > 1) {
              const baseQtyPerBin = Math.floor(totalQty / locations.length);
              const remainder = totalQty % locations.length;
              
              locations.forEach((location, index) => {
                const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
                reportRows.push([
                  barcode,
                  location,
                  binQty,
                  operationType
                ]);
              });
            } else {
              // Single location - add atomic row
              reportRows.push([
                barcode,
                locations[0],
                totalQty,
                operationType
              ]);
            }
          });
        } else if (reportData.data.inventory) {
          // For inventory summary reports - each item is now a single bin location
          reportData.data.inventory.forEach(item => {
            const barcode = item.barcode || item.sku || 'N/A';
            const location = item.location || item.binCode || 'N/A';
            const quantity = item.quantity || 0;
            const status = item.status || 'Current Stock';
            
            reportRows.push([
              barcode,
              location,
              quantity,
              status
            ]);
          });
        }
        
        const reportSheet = XLSX.utils.aoa_to_sheet(reportRows);
        XLSX.utils.book_append_sheet(workbook, reportSheet, 'Report Data');
      }

      // Generate filename
      const filename = `${reportData.config.type}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Download file
      XLSX.writeFile(workbook, filename);
      
      console.log(`📥 Excel report downloaded: ${filename}`);
    } catch (error) {
      console.error('❌ Error downloading Excel report:', error);
      throw new Error(`Failed to download Excel report: ${error.message}`);
    }
  }

  /**
   * Download PDF report
   */
  async downloadPdfReport(reportData) {
    try {
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text(this.getReportTitle(reportData.config.type), 20, 20);
      
      // Generated date
      doc.setFontSize(12);
      doc.text(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, 20, 35);
      
      if (reportData.config.scope === 'date_range') {
        doc.text(`Period: ${new Date(reportData.config.startDate).toLocaleDateString()} - ${new Date(reportData.config.endDate).toLocaleDateString()}`, 20, 45);
      }

      // Summary
      const summaryData = this.prepareSummaryForPdf(reportData);
      doc.autoTable({
        head: [['Metric', 'Value']],
        body: summaryData,
        startY: 55,
        styles: { fontSize: 10 }
      });

      // Data table
      const tableData = this.prepareDataForPdf(reportData);
      if (tableData.head && tableData.body) {
        doc.autoTable({
          head: tableData.head,
          body: tableData.body,
          startY: doc.lastAutoTable.finalY + 20,
          styles: { fontSize: 8 }
        });
      }

      // Generate filename and download
      const filename = `${reportData.config.type}_report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      console.log(`📥 PDF report downloaded: ${filename}`);
    } catch (error) {
      console.error('❌ Error downloading PDF report:', error);
      throw new Error(`Failed to download PDF report: ${error.message}`);
    }
  }

  /**
   * Prepare summary data for Excel export
   */
  prepareSummaryForExcel(reportData) {
    const summary = reportData.data.summary;
    const summaryArray = [];
    
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value !== 'object') {
        summaryArray.push({
          Metric: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
          Value: value
        });
      }
    });
    
    return summaryArray;
  }

  /**
   * Prepare data for Excel export
   */
  prepareDataForExcel(reportData) {
    const { type } = reportData.config;
    const data = reportData.data;

    switch (type) {
      case this.reportTypes.STOCK_MOVEMENTS:
        // Make a clean copy for Excel that uses simplified format
        const cleanMovements = data.movements.map(m => ({
          Barcode: m.sku,
          Location: m.location,
          Quantity: m.quantity,
          Operation: m.operationType
        }));
        return XLSX.utils.json_to_sheet(cleanMovements);
      case this.reportTypes.INVENTORY_SUMMARY:
        return XLSX.utils.json_to_sheet(data.inventory);
      case this.reportTypes.PUTAWAY_SUMMARY:
        return XLSX.utils.json_to_sheet(data.operations);
      case this.reportTypes.PICK_SUMMARY:
        return XLSX.utils.json_to_sheet(data.operations);
      case this.reportTypes.BIN_UTILIZATION:
        return XLSX.utils.json_to_sheet(data.utilization);
      default:
        return XLSX.utils.json_to_sheet([]);
    }
  }

  /**
   * Prepare summary data for PDF export
   */
  prepareSummaryForPdf(reportData) {
    const summary = reportData.data.summary;
    const summaryArray = [];
    
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value !== 'object') {
        summaryArray.push([
          key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
          value.toString()
        ]);
      }
    });
    
    return summaryArray;
  }

  /**
   * Prepare data for PDF export
   */
  prepareDataForPdf(reportData) {
    const { type } = reportData.config;
    const data = reportData.data;

    switch (type) {
      case this.reportTypes.STOCK_MOVEMENTS:
        return {
          head: [['Barcode', 'Location', 'Quantity', 'Operation']],
          body: data.movements.slice(0, 50).map(m => [
            m.sku, m.location, m.quantity, m.operationType
          ])
        };
      case this.reportTypes.INVENTORY_SUMMARY:
        return {
          head: [['SKU', 'Total Quantity', 'Locations']],
          body: data.inventory.slice(0, 50).map(i => [
            i.sku, i.totalQuantity, i.locations.length
          ])
        };
      case this.reportTypes.BIN_UTILIZATION:
        return {
          head: [['Bin Code', 'Rack', 'Capacity', 'Current', 'Utilization %']],
          body: data.utilization.slice(0, 50).map(u => [
            u.binCode, u.rackCode, u.capacity, u.currentQuantity, `${u.utilizationPercent}%`
          ])
        };
      default:
        return { head: [], body: [] };
    }
  }

  /**
   * Get report title
   */
  getReportTitle(type) {
    switch (type) {
      case this.reportTypes.STOCK_MOVEMENTS: return 'Stock Movements Report';
      case this.reportTypes.INVENTORY_SUMMARY: return 'Inventory Summary Report';
      case this.reportTypes.PUTAWAY_SUMMARY: return 'Put-Away Summary Report';
      case this.reportTypes.PICK_SUMMARY: return 'Pick Summary Report';
      case this.reportTypes.BIN_UTILIZATION: return 'Bin Utilization Report';
      default: return 'Warehouse Report';
    }
  }

  /**
   * Helper function to extract location parts from various sources
   */
  extractLocationParts(bin, execItem, item, warehouseDetails = {}) {
    // Try different sources to get location information
    let locationParts = [];
    
    console.log('Extracting location parts from:', {
      bin: bin ? 'Present' : 'Missing',
      execItem: execItem ? 'Present' : 'Missing',
      item: item ? 'Present' : 'Missing',
      warehouseDetails: warehouseDetails ? 'Present' : 'Missing'
    });
    
    // First check if we have direct bin location info
    if (bin && typeof bin === 'object') {
      const binLocationParts = [];
      
      // Use warehouse name/code but avoid collection IDs
      if (bin.warehouseCode && !bin.warehouseCode.includes('/')) {
        binLocationParts.push(bin.warehouseCode);
      } else if (warehouseDetails && warehouseDetails.name) {
        binLocationParts.push(warehouseDetails.name);
      }
      
      if (bin.floorCode) binLocationParts.push(bin.floorCode);
      
      // Use rack code without name
      if (bin.rackCode) binLocationParts.push(bin.rackCode);
      
      // Use clean bin code
      if (bin.code) binLocationParts.push(bin.code);
      
      if (binLocationParts.length > 0) {
        console.log('Using bin location data:', binLocationParts.join('-'));
        return binLocationParts;
      }
    }
    
    // Next, try to get location from execution item
    if (execItem && typeof execItem === 'object') {
      // Try to extract from direct location fields
      const execItemLocationParts = [];
      
      // Use warehouse name/code but avoid collection IDs
      if (execItem.warehouseCode && !execItem.warehouseCode.includes('/')) {
        execItemLocationParts.push(execItem.warehouseCode);
      } else if (warehouseDetails && warehouseDetails.name) {
        execItemLocationParts.push(warehouseDetails.name);
      }
      
      if (execItem.floorCode) execItemLocationParts.push(execItem.floorCode);
      
      // Use rack code (not rack name)
      if (execItem.rackCode) execItemLocationParts.push(execItem.rackCode);
      
      // Use clean bin code
      if (execItem.binCode) execItemLocationParts.push(execItem.binCode);
      
      if (execItemLocationParts.length > 0) {
        console.log('Using execItem location data:', execItemLocationParts.join('-'));
        return execItemLocationParts;
      }
      
      // Try to parse from location string if it exists
      if (execItem.location && typeof execItem.location === 'string') {
        const locationSegments = execItem.location.split('-');
        const filteredSegments = locationSegments.filter(part => part && part.trim() !== '');
        if (filteredSegments.length > 0) {
          console.log('Using execItem.location string:', filteredSegments.join('-'));
          return filteredSegments;
        }
      }
      
      // Try location.name if it exists as an object
      if (execItem.location && typeof execItem.location === 'object' && execItem.location.name) {
        console.log('Using execItem.location.name:', execItem.location.name);
        return [execItem.location.name];
      }
      
      // Try binId and rackId to build location
      if (execItem.binId || execItem.rackId) {
        const locationFromIds = [];
        
        // Use warehouse name (not ID)
        if (warehouseDetails && warehouseDetails.name && !warehouseDetails.name.includes('/')) {
          locationFromIds.push(warehouseDetails.name);
        } else if (item && item.warehouseName && !item.warehouseName.includes('/')) {
          locationFromIds.push(item.warehouseName);
        }
        
        // Add floor level
        locationFromIds.push('Floor1');
        
        // Add rack code (not name) - prefer code over ID
        if (execItem.rackCode && !execItem.rackCode.includes('/')) {
          locationFromIds.push(execItem.rackCode);
        } else if (execItem.rackId) {
          // Generate a clean rack code from ID
          const rackCode = `R${execItem.rackId.substring(0, 2)}`;
          locationFromIds.push(rackCode);
        }
        
        // Add bin code (not name) - prefer code over ID
        if (execItem.binCode && !execItem.binCode.includes('/')) {
          locationFromIds.push(execItem.binCode);
        } else if (execItem.binId) {
          // Extract clean bin code from ID
          const match = execItem.binId.match(/[A-Z0-9]{1,3}/i);
          const binCode = match ? match[0] : `B${execItem.binId.substring(0, 1)}`;
          locationFromIds.push(binCode);
        }
        
        if (locationFromIds.length > 0) {
          console.log('Built location from IDs:', locationFromIds.join('-'));
          return locationFromIds;
        }
      }
    }
    
    // Fallback to history item
    if (item && typeof item === 'object') {
      const itemLocationParts = [];
      
      // Use warehouse name (not ID)
      if (item.warehouseName && !item.warehouseName.includes('/')) {
        itemLocationParts.push(item.warehouseName);
      } else if (warehouseDetails && warehouseDetails.name && !warehouseDetails.name.includes('/')) {
        itemLocationParts.push(warehouseDetails.name);
      }
      
      // Add rack/bin codes if available (not names)
      if (execItem) {
        if (execItem.rackCode && !execItem.rackCode.includes('/')) {
          itemLocationParts.push(execItem.rackCode);
        }
        
        if (execItem.binCode && !execItem.binCode.includes('/')) {
          itemLocationParts.push(execItem.binCode);
        }
      }
      
      if (itemLocationParts.length > 0) {
        console.log('Using history item location data:', itemLocationParts.join('-'));
        return itemLocationParts;
      }
      
      // Final attempt from item.location
      if (item.location) {
        if (typeof item.location === 'string') {
          const segments = item.location.split('-');
          const filteredSegments = segments.filter(s => s && s.trim() !== '');
          if (filteredSegments.length > 0) {
            console.log('Using item.location string:', filteredSegments.join('-'));
            return filteredSegments;
          }
        } else if (typeof item.location === 'object' && item.location.name) {
          console.log('Using item.location.name:', item.location.name);
          return [item.location.name];
        }
      }
    }
    
    // Final fallback to warehouse details
    if (warehouseDetails && typeof warehouseDetails === 'object') {
      const warehouseLocationParts = [];
      
      // Use warehouse name instead of code or ID
      if (warehouseDetails.name) {
        warehouseLocationParts.push(warehouseDetails.name);
      } else if (warehouseDetails.code) {
        warehouseLocationParts.push(warehouseDetails.code);
      }
      
      // If we have a rack reference from execItem, add a placeholder for floor and the rack
      if (execItem) {
        warehouseLocationParts.push('Floor1');
        
        if (execItem.rackName) {
          warehouseLocationParts.push(execItem.rackName);
        } else if (execItem.rackCode) {
          warehouseLocationParts.push(execItem.rackCode);
        } else if (execItem.rackId) {
          warehouseLocationParts.push(`Rack-${execItem.rackId.substring(0, 3)}`);
        }
        
        // Add bin placeholder if we have a binId
        if (execItem.binName) {
          warehouseLocationParts.push(execItem.binName);
        } else if (execItem.binCode) {
          warehouseLocationParts.push(execItem.binCode);
        } else if (execItem.binId) {
          const match = execItem.binId.match(/[A-Z0-9]{1,4}/i);
          const binCode = match ? match[0] : `B${execItem.binId.substring(0, 2)}`;
          warehouseLocationParts.push(binCode);
        }
        
        if (warehouseLocationParts.length > 0) {
          console.log('Built location from warehouse details:', warehouseLocationParts.join('-'));
          return warehouseLocationParts;
        }
      }
      
      // Even if we don't have rack/bin info, at least return the warehouse
      if (warehouseLocationParts.length > 0) {
        console.log('Using just warehouse info:', warehouseLocationParts.join('-'));
        return warehouseLocationParts;
      }
    }
    
    // If we couldn't find anything, use generic placeholders for warehouse movements
    if (execItem && (execItem.sku || execItem.barcode)) {
      console.log('Using generic warehouse movement placeholder');
      return ['Warehouse', 'Movement'];
    }
    
    console.log('No location information found');
    // If we got here, we couldn't find location information
    return [];
  }
}

export const reportService = new ReportService();
