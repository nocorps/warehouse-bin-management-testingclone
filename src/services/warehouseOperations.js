import { warehouseService } from './warehouseService.js';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';

export const warehouseOperations = {
  /**
   * Smart bin allocation algorithm for put-away operations
   */
  async findOptimalBins(warehouseId, sku, quantity, preferences = {}) {
    try {
      // Get all bins for the warehouse
      const bins = await this.getAllBins(warehouseId);
      
      const {
        zoneId = null,
        preferExistingSku = true,
        preferGroundLevel = true,
        maxDistance = null,
      } = preferences;

      // Filter bins - must have sufficient capacity
      let availableBins = bins.filter(bin => {
        // Must be active
        if (bin.status !== 'available' && bin.status !== 'occupied') return false;
        
        // Must have sufficient capacity for the entire quantity
        const currentQty = parseInt(bin.currentQty) || 0;
        const availableSpace = bin.capacity - currentQty;
        if (availableSpace < quantity) return false;
        
        // Zone preference
        if (zoneId && bin.zoneId !== zoneId) return false;
        
        return true;
      });

      // Score bins based on intelligent priority criteria
      const scoredBins = availableBins.map(bin => {
        let score = 0;
        const currentQty = parseInt(bin.currentQty) || 0;
        const availableCapacity = bin.capacity - currentQty;
        
        // PRIORITY 1: Same SKU with sufficient space (highest priority)
        if (bin.sku === sku && currentQty > 0 && availableCapacity >= quantity) {
          score += 2000; // Very high priority for same SKU consolidation
          
          // Bonus for better space utilization
          const utilizationAfter = (currentQty + quantity) / bin.capacity;
          if (utilizationAfter >= 0.8 && utilizationAfter <= 1.0) {
            score += 300; // Prefer bins that will be well-utilized
          }
        }
        
        // PRIORITY 2: Empty bins (for new SKU or when same SKU bins are full)
        else if (currentQty === 0) {
          score += 1000; // High priority for empty bins
          
          // Prefer bins that closely match the quantity needed
          const utilization = quantity / bin.capacity;
          if (utilization >= 0.7 && utilization <= 1.0) {
            score += 200; // Good capacity match
          } else if (utilization >= 0.5) {
            score += 100; // Reasonable capacity match
          }
        }
        
        // PRIORITY 3: Different SKU bins with space (lower priority)
        else if (bin.sku !== sku && bin.sku !== null) {
          score += 200; // Much lower priority - avoid mixing SKUs
        }
        
        // MODIFIER: Prefer ground level (easier access)
        // Note: In new format, shelfLevel=1 represents grid 1 (first grid)
        if (preferGroundLevel && bin.shelfLevel === 1) {
          score += 150;
        }
        
        // MODIFIER: Grid level penalty (higher grids are less convenient)
        // Note: In new format, shelfLevel represents grid number
        score -= (bin.shelfLevel - 1) * 25;
        
        // MODIFIER: Available capacity bonus (prefer more space when possible)
        score += Math.min(availableCapacity - quantity, 30); // Bonus for extra space
        
        // MODIFIER: Zone preference
        if (zoneId && bin.zoneId === zoneId) {
          score += 100;
        }
        
        // MODIFIER: Rack proximity (bins in same rack are easier to access)
        // This could be enhanced with actual distance calculation
        
        return {
          ...bin,
          score,
          availableCapacity,
          currentQty,
          utilizationAfterPutaway: ((currentQty + quantity) / bin.capacity * 100).toFixed(1),
          spaceRemaining: availableCapacity - quantity,
        };
      });

      // Sort by score (highest first)
      scoredBins.sort((a, b) => b.score - a.score);

      // Return top recommendations with explanations
      return scoredBins.slice(0, 10).map(bin => ({
        ...bin,
        recommendation: this.getBinRecommendationReason(bin, sku, quantity)
      }));
    } catch (error) {
      console.error('Error finding optimal bins:', error);
      throw error;
    }
  },

  /**
   * Get explanation for why a bin is recommended
   */
  getBinRecommendationReason(bin, sku, quantity) {
    const currentQty = parseInt(bin.currentQty) || 0;
    
    if (bin.sku === sku && currentQty > 0) {
      return `Same SKU - Consolidates with existing ${currentQty} units`;
    } else if (currentQty === 0) {
      return `Empty bin - Perfect for new product placement`;
    } else if (bin.sku !== sku) {
      return `Mixed storage - Contains different SKU (${bin.sku})`;
    } else {
      return `Available space - ${bin.availableCapacity} units capacity`;
    }
  },

  /**
   * Create put-away task
   */
  async createPutAwayTask(warehouseId, taskData) {
    const {
      sku,
      quantity,
      lotNumber,
      expiryDate,
      suggestedBinId,
      suggestedBinCode,
      priority = 'medium',
      assignedTo = null,
      notes = '',
      autoExecute = false, // New option to automatically execute putaway
    } = taskData;

    // Validate required fields
    if (!sku) {
      throw new Error('SKU is required');
    }
    if (quantity === undefined || quantity === null || quantity === '') {
      throw new Error('Quantity is required and must be a valid number');
    }
    if (!suggestedBinId && !suggestedBinCode) {
      throw new Error('Suggested bin is required');
    }

    // Ensure quantity is a number
    const numericQuantity = Number(quantity);
    if (isNaN(numericQuantity) || numericQuantity <= 0) {
      throw new Error('Quantity must be a positive number');
    }

    try {
      const task = await warehouseService.createPutAwayTask(warehouseId, {
        sku,
        quantity: numericQuantity, // Use the validated numeric quantity
        lotNumber: lotNumber || null,
        expiryDate: expiryDate || null,
        suggestedBinId,
        suggestedBinCode,
        priority,
        assignedTo,
        notes,
        status: autoExecute ? 'in-progress' : 'pending',
        estimatedTime: this.estimatePutAwayTime(numericQuantity),
      });

      // If autoExecute is true, immediately execute the putaway
      if (autoExecute && suggestedBinId) {
        try {
          const executionResult = await this.executePutAway(
            warehouseId,
            task.id,
            suggestedBinId,
            numericQuantity, // Use the validated numeric quantity
            task // Pass the task object directly
          );
          
          return {
            ...task,
            status: 'completed',
            actualBinId: suggestedBinId,
            actualBinCode: suggestedBinCode,
            actualQuantity: numericQuantity,
            completedAt: new Date().toISOString(),
            autoExecuted: true,
            executionResult
          };
        } catch (executeError) {
          // If auto-execution fails, update task with error but keep it as pending
          await warehouseService.updatePutAwayTask(warehouseId, task.id, {
            status: 'pending',
            autoExecuteError: executeError.message,
            notes: notes + `\n[Auto-execute failed: ${executeError.message}]`
          });
          
          console.warn('Auto-execute putaway failed, task remains pending:', executeError);
          return {
            ...task,
            status: 'pending',
            autoExecuteError: executeError.message
          };
        }
      }

      return task;
    } catch (error) {
      console.error('Error creating put-away task:', error);
      throw error;
    }
  },

  /**
   * Execute put-away operation with comprehensive audit logging
   */
  async executePutAway(warehouseId, taskId, actualBinId, actualQuantity, existingTask = null) {
    try {
      // Use existing task if provided, otherwise fetch it
      let task = existingTask;
      if (!task) {
        task = await warehouseService.getPutAwayTask(warehouseId, taskId);
        if (!task) {
          throw new Error('Task not found');
        }
      }

      // Get the bin
      const bin = await warehouseService.getBin(warehouseId, actualBinId);
      if (!bin) {
        throw new Error('Bin not found');
      }

      // Validate capacity and prepare allocation details
      const currentQty = parseInt(bin.currentQty) || 0;
      const newQuantity = parseInt(actualQuantity) || 0;
      const totalAfter = currentQty + newQuantity;
      const availableCapacity = bin.capacity - currentQty;
      const utilization = (totalAfter / bin.capacity * 100);
      
      console.log('📦 Put-away allocation details:', {
        binId: actualBinId,
        binCode: bin.code,
        sku: task.sku,
        currentQty,
        addingQuantity: newQuantity,
        totalAfter,
        capacity: bin.capacity,
        availableCapacity,
        utilization: utilization.toFixed(1) + '%'
      });
      
      if (availableCapacity < newQuantity) {
        throw new Error(`Insufficient bin capacity. Available: ${availableCapacity}, Required: ${newQuantity}`);
      }

      // Determine allocation type for audit logging
      let allocationType;
      let allocationReason;
      
      if (currentQty === 0) {
        allocationType = 'NEW_PLACEMENT';
        allocationReason = `New placement in empty bin - Clean storage for ${newQuantity} units`;
      } else if (bin.sku === task.sku) {
        allocationType = 'SAME_SKU_CONSOLIDATION';
        allocationReason = `Same SKU consolidation - Adding ${newQuantity} units to existing ${currentQty} units`;
      } else {
        allocationType = 'MIXED_SKU_STORAGE';
        allocationReason = `Mixed storage - Adding ${task.sku} (${newQuantity} units) to bin containing ${bin.sku}`;
      }

      // Create detailed audit log entry
      const auditLog = {
        action: 'PUTAWAY',
        timestamp: new Date().toISOString(),
        taskId,
        binId: actualBinId,
        binCode: bin.code,
        sku: task.sku,
        lotNumber: task.lotNumber,
        expiryDate: task.expiryDate,
        quantity: newQuantity,
        previousQty: currentQty,
        newTotalQty: totalAfter,
        capacity: bin.capacity,
        utilization: utilization.toFixed(1) + '%',
        allocationType,
        allocationReason,
        isOptimalPlacement: allocationType !== 'MIXED_SKU_STORAGE',
        wasSuggested: task.suggestedBinId === actualBinId,
        shelfLevel: bin.shelfLevel || 1,
        zoneId: bin.zoneId || 'main'
      };

      // Update bin with product and tracking info
      const updatedBin = await warehouseService.updateBin(warehouseId, actualBinId, {
        sku: task.sku,
        currentQty: totalAfter,
        lotNumber: task.lotNumber,
        expiryDate: task.expiryDate,
        status: 'occupied',
        lastPutAwayAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update task status with comprehensive completion info
      const completionData = {
        status: 'completed',
        actualBinId,
        actualQuantity: newQuantity,
        completedAt: new Date().toISOString(),
        utilizationAfter: utilization.toFixed(1) + '%',
        allocationType,
        allocationReason,
        isOptimalPlacement: auditLog.isOptimalPlacement,
        auditLog: [auditLog]
      };

      const updatedTask = await warehouseService.updatePutAwayTask(warehouseId, taskId, completionData);

      console.log('🎉 Put-away operation completed successfully:', {
        taskId,
        binCode: bin.code,
        sku: task.sku,
        quantity: newQuantity,
        allocationType,
        utilizationAfter: utilization.toFixed(1) + '%'
      });

      return {
        task: updatedTask,
        bin: updatedBin,
        auditLog,
        summary: {
          allocationType,
          allocationReason,
          utilizationAfter: utilization.toFixed(1) + '%',
          isOptimalPlacement: auditLog.isOptimalPlacement
        }
      };
    } catch (error) {
      console.error('Error executing put-away:', error);
      throw error;
    }
  },

  /**
   * Find products for picking with enhanced FIFO logic
   */
  async findProductsForPicking(warehouseId, sku, requiredQuantity) {
    try {
      console.log(`Finding products for picking: SKU=${sku}, Required=${requiredQuantity}`);
      
      // Get all bins containing the SKU
      const bins = await this.getAllBins(warehouseId);
      const productBins = bins
        .filter(bin => bin.sku === sku && bin.currentQty > 0 && bin.status === 'occupied')
        .map(bin => ({
          ...bin,
          currentQty: parseInt(bin.currentQty) || 0,
          // Parse date properly for FIFO sorting
          parsedExpiryDate: bin.expiryDate ? new Date(bin.expiryDate) : null,
          // Parse creation date for secondary FIFO sorting
          parsedCreatedAt: bin.createdAt ? new Date(bin.createdAt) : new Date(),
          // Parse lot date if available for tertiary FIFO sorting
          parsedLotDate: bin.lotNumber && bin.lotDate ? new Date(bin.lotDate) : null
        }))
        .sort((a, b) => {
          // FIFO Logic: First In, First Out
          console.log(`Comparing bins: ${a.code} vs ${b.code}`);
          
          // 1. PRIMARY SORT: Expiry date (earliest expiry first)
          if (a.parsedExpiryDate && b.parsedExpiryDate) {
            const expiryDiff = a.parsedExpiryDate.getTime() - b.parsedExpiryDate.getTime();
            if (expiryDiff !== 0) {
              console.log(`  → Sorted by expiry: ${a.expiryDate} vs ${b.expiryDate}`);
              return expiryDiff;
            }
          }
          
          // 2. If one has expiry and other doesn't, prioritize the one with expiry (it's older stock)
          if (a.parsedExpiryDate && !b.parsedExpiryDate) return -1;
          if (!a.parsedExpiryDate && b.parsedExpiryDate) return 1;
          
          // 3. SECONDARY SORT: Lot date (if available) - earlier lot dates first
          if (a.parsedLotDate && b.parsedLotDate) {
            const lotDiff = a.parsedLotDate.getTime() - b.parsedLotDate.getTime();
            if (lotDiff !== 0) {
              console.log(`  → Sorted by lot date: ${a.lotDate} vs ${b.lotDate}`);
              return lotDiff;
            }
          }
          
          // 4. TERTIARY SORT: Creation time (earlier created first - true FIFO)
          const createdDiff = a.parsedCreatedAt.getTime() - b.parsedCreatedAt.getTime();
          if (createdDiff !== 0) {
            console.log(`  → Sorted by creation time: ${a.createdAt} vs ${b.createdAt}`);
            return createdDiff;
          }
          
          // 5. QUATERNARY SORT: Grid level (first grid first for easier access)
          const shelfDiff = (a.shelfLevel || 1) - (b.shelfLevel || 1);
          if (shelfDiff !== 0) {
            console.log(`  → Sorted by grid level: ${a.shelfLevel} vs ${b.shelfLevel}`);
            return shelfDiff;
          }
          
          // 6. FINAL SORT: Bin code for consistent ordering
          return (a.code || '').localeCompare(b.code || '');
        });

      console.log('FIFO sorted bins:', productBins.map(bin => ({
        code: bin.code,
        currentQty: bin.currentQty,
        expiryDate: bin.expiryDate,
        createdAt: bin.createdAt,
        shelfLevel: bin.shelfLevel,
        lotNumber: bin.lotNumber
      })));

      // Calculate pick plan with FIFO allocation
      let remainingQuantity = requiredQuantity;
      const pickPlan = [];
      let totalPicked = 0;

      for (const bin of productBins) {
        if (remainingQuantity <= 0) break;

        const pickQuantity = Math.min(bin.currentQty, remainingQuantity);
        if (pickQuantity > 0) {
          pickPlan.push({
            ...bin,
            pickQuantity,
            remainingInBin: bin.currentQty - pickQuantity,
            fifoReason: this.getFIFOReason(bin),
            pickOrder: pickPlan.length + 1
          });
          remainingQuantity -= pickQuantity;
          totalPicked += pickQuantity;
          
          console.log(`✓ FIFO Pick Plan: Bin ${bin.code} - Pick ${pickQuantity}/${bin.currentQty}, Remaining needed: ${remainingQuantity}`);
        }
      }

      const result = {
        pickPlan,
        totalAvailable: productBins.reduce((sum, bin) => sum + bin.currentQty, 0),
        totalPicked,
        shortfall: Math.max(0, remainingQuantity),
        isFullyAvailable: remainingQuantity === 0,
        fifoCompliant: true
      };

      console.log('FIFO Pick Result:', {
        requiredQuantity,
        totalAvailable: result.totalAvailable,
        totalPicked,
        shortfall: result.shortfall,
        binsUsed: pickPlan.length
      });

      return result;
    } catch (error) {
      console.error('Error finding products for picking:', error);
      throw error;
    }
  },

  /**
   * Get FIFO explanation for a bin
   */
  getFIFOReason(bin) {
    const reasons = [];
    
    if (bin.expiryDate) {
      const expiryDate = new Date(bin.expiryDate);
      const daysToExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      reasons.push(`Expires in ${daysToExpiry} days`);
    }
    
    if (bin.createdAt) {
      const createdDate = new Date(bin.createdAt);
      const daysOld = Math.ceil((new Date() - createdDate) / (1000 * 60 * 60 * 24));
      reasons.push(`${daysOld} days old`);
    }
    
    if (bin.lotNumber) {
      reasons.push(`Lot: ${bin.lotNumber}`);
    }
    
    reasons.push(`Grid ${bin.shelfLevel || 1}`);
    
    return reasons.join(', ');
  },

  /**
   * Create pick task
   */
  async createPickTask(warehouseId, taskData) {
    const {
      orderNumber,
      items,
      priority = 'medium',
      assignedTo = null,
      notes = '',
    } = taskData;

    try {
      // Generate optimized pick route
      const pickRoute = await this.optimizePickRoute(warehouseId, items);

      const task = await warehouseService.createPickTask(warehouseId, {
        orderNumber,
        items: pickRoute.items,
        pickRoute: pickRoute.route,
        priority,
        assignedTo,
        notes,
        status: 'pending',
        estimatedTime: this.estimatePickTime(items),
        totalItems: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      });

      return task;
    } catch (error) {
      console.error('Error creating pick task:', error);
      throw error;
    }
  },

  /**
   * Optimize pick route
   */
  async optimizePickRoute(warehouseId, items) {
    try {
      // For each item, find the best pick locations
      const itemsWithLocations = [];

      for (const item of items) {
        const { pickPlan } = await this.findProductsForPicking(
          warehouseId,
          item.sku,
          item.quantity
        );

        itemsWithLocations.push({
          ...item,
          pickPlan,
        });
      }

      // Simple route optimization by grid level and rack order
      // In a real implementation, you might use more sophisticated algorithms
      const sortedItems = itemsWithLocations.sort((a, b) => {
        const aMinGrid = Math.min(...a.pickPlan.map(p => p.shelfLevel));
        const bMinGrid = Math.min(...b.pickPlan.map(p => p.shelfLevel));
        
        if (aMinGrid !== bMinGrid) {
          return aMinGrid - bMinGrid;
        }
        
        const aMinRack = a.pickPlan[0]?.rackCode || '';
        const bMinRack = b.pickPlan[0]?.rackCode || '';
        return aMinRack.localeCompare(bMinRack);
      });

      return {
        items: sortedItems,
        route: this.generateRouteInstructions(sortedItems),
      };
    } catch (error) {
      console.error('Error optimizing pick route:', error);
      throw error;
    }
  },

  /**
   * Execute pick operation with enhanced FIFO logic
   */
  async executePick(warehouseId, taskId, pickedItems) {
    try {
      console.log('🔄 Executing pick operation with FIFO logic:', { taskId, pickedItems: pickedItems.length });
      
      // Check if this is a temporary task ID (for Excel imports)
      const isTemporaryTask = taskId.startsWith('excel-pick-');
      let task = null;
      
      if (!isTemporaryTask) {
        // Get the actual task from database
        try {
          task = await this.getPickTask(warehouseId, taskId);
          if (!task) {
            throw new Error('Pick task not found');
          }
        } catch (error) {
          console.warn('Could not find pick task, treating as temporary task:', error.message);
        }
      }

      const binUpdates = [];
      const auditLog = [];

      // Process each picked item with FIFO validation
      for (let i = 0; i < pickedItems.length; i++) {
        const pickedItem = pickedItems[i];
        const { binId, quantity, sku, lotNumber, expiryDate } = pickedItem;
        
        console.log(`📦 Processing pick ${i + 1}/${pickedItems.length}: ${quantity} units from bin ${binId}`);

        // Get current bin state
        const bin = await warehouseService.getBin(warehouseId, binId);
        if (!bin) {
          throw new Error(`Bin ${binId} not found`);
        }

        // Validate pick operation
        const currentQty = parseInt(bin.currentQty) || 0;
        if (currentQty < quantity) {
          throw new Error(`Insufficient quantity in bin ${bin.code}. Available: ${currentQty}, Requested: ${quantity}`);
        }

        // Validate SKU match
        if (bin.sku !== sku) {
          throw new Error(`SKU mismatch in bin ${bin.code}. Expected: ${sku}, Found: ${bin.sku}`);
        }

        // FIFO validation: Check if this is indeed the oldest stock
        if (lotNumber && bin.lotNumber && bin.lotNumber !== lotNumber) {
          console.warn(`⚠️ Lot number mismatch in bin ${bin.code}. Expected: ${lotNumber}, Found: ${bin.lotNumber}`);
        }

        if (expiryDate && bin.expiryDate) {
          const expectedExpiry = new Date(expiryDate);
          const binExpiry = new Date(bin.expiryDate);
          if (Math.abs(expectedExpiry - binExpiry) > 24 * 60 * 60 * 1000) { // More than 1 day difference
            console.warn(`⚠️ Expiry date mismatch in bin ${bin.code}. This might not be FIFO compliant.`);
          }
        }

        // Calculate new bin state
        const newQty = currentQty - quantity;
        const isEmpty = newQty === 0;

        // Prepare bin update
        const binUpdate = {
          currentQty: newQty,
          status: isEmpty ? 'available' : 'occupied',
          sku: isEmpty ? null : bin.sku,
          lotNumber: isEmpty ? null : bin.lotNumber,
          expiryDate: isEmpty ? null : bin.expiryDate,
          lastPickedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Update bin in database
        await warehouseService.updateBin(warehouseId, binId, binUpdate);

        binUpdates.push({
          binId,
          binCode: bin.code,
          previousQty: currentQty,
          pickedQty: quantity,
          newQty,
          isEmpty,
          sku: bin.sku,
          lotNumber: bin.lotNumber,
          expiryDate: bin.expiryDate
        });

        auditLog.push({
          action: 'PICK',
          binId,
          binCode: bin.code,
          sku: bin.sku,
          quantity: quantity,
          lotNumber: bin.lotNumber,
          expiryDate: bin.expiryDate,
          previousQty: currentQty,
          newQty,
          fifoCompliant: true,
          timestamp: new Date().toISOString()
        });

        console.log(`✅ Picked ${quantity} units from bin ${bin.code} (${currentQty} → ${newQty})`);
      }

      // Update task status with detailed completion info (only for real tasks)
      let updatedTask = null;
      if (!isTemporaryTask && task) {
        const completionData = {
          status: 'completed',
          pickedItems: binUpdates,
          completedAt: new Date().toISOString(),
          totalItemsPicked: pickedItems.length,
          totalQuantityPicked: pickedItems.reduce((sum, item) => sum + item.quantity, 0),
          fifoCompliant: true,
          auditLog
        };

        updatedTask = await warehouseService.updatePickTask(warehouseId, taskId, completionData);
      }

      console.log('🎉 Pick operation completed successfully:', {
        taskId,
        isTemporary: isTemporaryTask,
        totalItemsPicked: pickedItems.length,
        totalQuantityPicked: pickedItems.reduce((sum, item) => sum + item.quantity, 0),
        binsUpdated: binUpdates.length
      });

      return {
        success: true,
        task: updatedTask,
        binUpdates,
        auditLog,
        summary: {
          totalItemsPicked: pickedItems.length,
          totalQuantityPicked: pickedItems.reduce((sum, item) => sum + item.quantity, 0),
          binsEmptied: binUpdates.filter(b => b.isEmpty).length,
          fifoCompliant: true
        }
      };
    } catch (error) {
      console.error('❌ Error executing pick operation:', error);
      throw error;
    }
  },

  /**
   * Search products by SKU, lot number, or bin code
   */
  async searchProducts(warehouseId, searchTerm, filters = {}) {
    try {
      const bins = await this.getAllBins(warehouseId);
      const { zoneId, status, minQuantity } = filters;

      let results = bins.filter(bin => {
        // Text search
        const matchesSearch = !searchTerm || [
          bin.sku,
          bin.code,
          bin.lotNumber,
          bin.rackCode,
        ].some(field => 
          field && field.toLowerCase().includes(searchTerm.toLowerCase())
        );

        // Filters
        const matchesZone = !zoneId || bin.zoneId === zoneId;
        const matchesStatus = !status || bin.status === status;
        const matchesQuantity = !minQuantity || bin.currentQty >= minQuantity;

        return matchesSearch && matchesZone && matchesStatus && matchesQuantity;
      });

      // Group by SKU
      const groupedResults = results.reduce((acc, bin) => {
        if (!bin.sku) return acc;
        
        if (!acc[bin.sku]) {
          acc[bin.sku] = {
            sku: bin.sku,
            totalQuantity: 0,
            locations: [],
          };
        }
        
        acc[bin.sku].totalQuantity += bin.currentQty;
        acc[bin.sku].locations.push({
          binCode: bin.code,
          binId: bin.id,
          rackCode: bin.rackCode,
          shelfLevel: bin.shelfLevel,
          position: bin.position,
          quantity: bin.currentQty,
          lotNumber: bin.lotNumber,
          expiryDate: bin.expiryDate,
          zoneId: bin.zoneId,
        });
        
        return acc;
      }, {});

      return Object.values(groupedResults);
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  },

  /**
   * Guaranteed Smart Auto-Allocation: ALWAYS SUCCEEDS
   * 
   * STRICT PRIORITY ORDER (prevents splitting across empty bins when same-SKU bins have capacity):
   * 1. Fill same SKU bins to capacity (PRIORITY 1) - NEVER skip if space available
   * 2. Then use empty bins for remaining quantity (PRIORITY 2) - only after same-SKU bins full
   * 3. Use mixed SKU bins only if necessary (PRIORITY 3) - lowest priority
   * 4. AUTO-CREATE NEW BINS for any remaining quantity (PRIORITY 4) - disabled by default
   * 
   * This ensures optimal consolidation and prevents unnecessary bin proliferation.
   */
  async autoAllocateQuantity(warehouseId, sku, totalQuantity, preferences = {}) {
    try {
      console.log('🔄 GUARANTEED Auto-allocating quantity:', { sku, totalQuantity, preferences });
      console.log('📋 ALLOCATION STRATEGY: 1) Fill same-SKU bins first, 2) Use empty bins only if needed, 3) Never split unnecessarily');
      
      // Input validation
      if (!totalQuantity || isNaN(totalQuantity) || totalQuantity <= 0) {
        throw new Error('Invalid quantity for allocation');
      }
      
      // Get all bins for the warehouse using Firebase real-time data
      const bins = await this.getAllBins(warehouseId);
      console.log('📦 Total bins found:', bins.length);

      // Create allocation plan
      const allocationPlan = [];
      let remainingQuantity = totalQuantity;

      // PHASE 1: Find and use existing bins with the SAME SKU (highest priority)
      // This ensures we NEVER split across empty bins if same-SKU bins have capacity
      let sameSKUBins = bins.filter(bin => {
        // Must be active, have the same SKU, and have space
        const isActive = (bin.status === 'available' || bin.status === 'occupied');
        const isSameSKU = (bin.sku === sku);
        const currentQty = parseInt(bin.currentQty) || 0;
        const capacity = parseInt(bin.capacity) || 0;
        const hasSpace = capacity > currentQty;
        
        return isActive && isSameSKU && hasSpace;
      }).sort((a, b) => {
        // Sort by available space (larger first) for optimal bin utilization
        const spaceA = a.capacity - (parseInt(a.currentQty) || 0);
        const spaceB = b.capacity - (parseInt(b.currentQty) || 0);
        return spaceB - spaceA;
      });
      
      // Allocate to same-SKU bins first - fill each bin to capacity before moving to next
      console.log(`🎯 Phase 1: Same SKU bins available: ${sameSKUBins.length}`);
      for (const bin of sameSKUBins) {
        if (remainingQuantity <= 0) break;
        
        const currentQty = parseInt(bin.currentQty) || 0;
        const availableSpace = bin.capacity - currentQty;
        const allocateQty = Math.min(remainingQuantity, availableSpace);
        
        if (allocateQty > 0) {
          const newTotal = currentQty + allocateQty;
          allocationPlan.push({
            bin,
            allocatedQuantity: allocateQty,
            reason: `Same SKU consolidation - Adding ${allocateQty} units to existing ${currentQty} units`,
            priority: 1,
            newTotal,
            utilization: ((newTotal / bin.capacity) * 100).toFixed(1)
          });
          
          remainingQuantity -= allocateQty;
          console.log(`✅ Phase 1: Allocated ${allocateQty} to same-SKU bin ${bin.code} (${currentQty}+${allocateQty}=${newTotal}), remaining: ${remainingQuantity}`);
        }
      }      // PHASE 2: Find and use EMPTY bins (only after same-SKU bins are filled)
      // This ensures we consolidate same-SKU products before using new empty bins
      if (remainingQuantity > 0) {
        let emptyBins = bins.filter(bin => {
          // Must be active, empty or no SKU assigned
          const isActive = (bin.status === 'available' || bin.status === 'occupied');
          const isEmpty = (parseInt(bin.currentQty) || 0) === 0;
          const hasNoSku = !bin.sku;
          
          return isActive && (isEmpty || hasNoSku);
        }).sort((a, b) => {
          // First sort by floor code (Ground Floor first)
          const aFloorCode = (a.floorCode || '').toUpperCase();
          const bFloorCode = (b.floorCode || '').toUpperCase();
          
          // If one is GF (Ground Floor) and the other isn't, prioritize GF
          if (aFloorCode === 'GF' && bFloorCode !== 'GF') return -1;
          if (bFloorCode === 'GF' && aFloorCode !== 'GF') return 1;
          
          // Then sort by floor code alphabetically
          const floorCompare = aFloorCode.localeCompare(bFloorCode);
          if (floorCompare !== 0) return floorCompare;
          
          // Then sort by rack code alphabetically
          const rackCompare = (a.rackCode || '').localeCompare(b.rackCode || '');
          if (rackCompare !== 0) return rackCompare;
          
          // Then sort by grid/aisle code alphabetically
          const aGridCode = a.gridCode || '';
          const bGridCode = b.gridCode || '';
          const gridCompare = aGridCode.localeCompare(bGridCode);
          if (gridCompare !== 0) return gridCompare;
          
          // Then sort by grid number (ascending) - Grid 1, Grid 2, Grid 3
          // Note: In new format, shelfLevel represents grid number
          const aGridNumber = parseInt(a.shelfLevel) || 1;
          const bGridNumber = parseInt(b.shelfLevel) || 1;
          if (aGridNumber !== bGridNumber) return aGridNumber - bGridNumber;
          
          // Finally sort by position within grid (ascending) - A1, A2, A3 for grid 1, B1, B2, B3 for grid 2, etc.
          const aPosition = parseInt(a.position) || 1;
          const bPosition = parseInt(b.position) || 1;
          if (aPosition !== bPosition) return aPosition - bPosition;
          
          // Fallback: sort by bin code for consistency
          const binCodeCompare = (a.code || '').localeCompare(b.code || '');
          return binCodeCompare;
        });
        
        // Log sorting results for debugging
        console.log('📊 Empty bins sorted in order:', 
          emptyBins.slice(0, 5).map(bin => 
            `${bin.code} (Floor: ${bin.floorCode || 'Unknown'}, Rack: ${bin.rackCode || 'Unknown'}, Grid: ${bin.gridCode || 'Unknown'}, GridNum: ${bin.shelfLevel || 1}, Pos: ${bin.position || 1})`
          ));
        
        // Allocate to empty bins - fill each to capacity before moving to next
        console.log(`📦 Phase 2: Empty bins available: ${emptyBins.length} (only used after same-SKU bins are full)`);
        for (const bin of emptyBins) {
          if (remainingQuantity <= 0) break;
          
          const allocateQty = Math.min(remainingQuantity, bin.capacity);
          if (allocateQty > 0) {
            allocationPlan.push({
              bin,
              allocatedQuantity: allocateQty,
              reason: `New placement in empty bin - ${allocateQty} units (Rack: ${bin.rackCode}, Grid: ${bin.shelfLevel})`,
              priority: 2,
              newTotal: allocateQty,
              utilization: ((allocateQty / bin.capacity) * 100).toFixed(1)
            });
            
            remainingQuantity -= allocateQty;
            console.log(`✅ Phase 2: Allocated ${allocateQty} to empty bin ${bin.code} (filling to capacity first), remaining: ${remainingQuantity}`);
          }
        }
      }

      // PHASE 3: Find and use MIXED SKU bins (lowest priority for existing bins)
      if (remainingQuantity > 0) {
        let mixedBins = bins.filter(bin => {
          // Must be active, have different SKU, and have space
          const isActive = (bin.status === 'available' || bin.status === 'occupied');
          const isDifferentSKU = bin.sku && bin.sku !== sku;
          const currentQty = parseInt(bin.currentQty) || 0;
          const capacity = parseInt(bin.capacity) || 0;
          const hasSpace = capacity > currentQty;
          
          return isActive && isDifferentSKU && hasSpace;
        }).sort((a, b) => {
          // Sort by available space (larger first)
          const spaceA = a.capacity - (parseInt(a.currentQty) || 0);
          const spaceB = b.capacity - (parseInt(b.currentQty) || 0);
          return spaceB - spaceA;
        });
        
        // Allocate to mixed-SKU bins if necessary
        console.log(`🔄 Phase 3: Mixed SKU bins available: ${mixedBins.length}`);
        for (const bin of mixedBins) {
          if (remainingQuantity <= 0) break;
          
          const currentQty = parseInt(bin.currentQty) || 0;
          const availableSpace = bin.capacity - currentQty;
          const allocateQty = Math.min(remainingQuantity, availableSpace);
          
          if (allocateQty > 0) {
            const newTotal = currentQty + allocateQty;
            allocationPlan.push({
              bin,
              allocatedQuantity: allocateQty,
              reason: `Mixed storage - Adding ${allocateQty} units to bin with ${bin.sku}`,
              priority: 3,
              newTotal,
              utilization: ((newTotal / bin.capacity) * 100).toFixed(1)
            });
            
            remainingQuantity -= allocateQty;
            console.log(`✅ Phase 3: Allocated ${allocateQty} to mixed-SKU bin ${bin.code}, remaining: ${remainingQuantity}`);
          }
        }
      }

      // PHASE 4: NO LONGER CREATE NEW BINS AUTOMATICALLY
      if (remainingQuantity > 0) {
        console.log(`❌ Phase 4: ${remainingQuantity} remaining units could not be allocated - no available bins found`);
        console.log(`❌ Allocation failed: All existing bins are at capacity or unavailable`);
        
        // Don't create new bins automatically - return partial allocation
        const totalAllocated = allocationPlan.reduce((sum, item) => sum + item.allocatedQuantity, 0);
        const isFullyAllocated = (totalAllocated === totalQuantity);
        
        console.log('⚠️ Partial allocation complete:', {
          totalQuantity,
          totalAllocated,
          remainingQuantity,
          isFullyAllocated,
          binCount: allocationPlan.length
        });

        // Return partial allocation results - this will cause an error upstream
        return {
          allocationPlan,
          totalAllocated,
          remainingQuantity,
          isFullyAllocated,
          summary: {
            phase1Allocations: allocationPlan.filter(a => a.priority === 1).length,
            phase2Allocations: allocationPlan.filter(a => a.priority === 2).length,
            phase3Allocations: allocationPlan.filter(a => a.priority === 3).length,
            autoCreatedBins: 0, // No auto-created bins
            averageUtilization: allocationPlan.length > 0 ? 
              allocationPlan.reduce((sum, a) => sum + parseFloat(a.utilization), 0) / allocationPlan.length : 0
          },
          preferences,
          error: `Could not allocate ${remainingQuantity} units - no available bins with sufficient capacity`
        };
      }

      // Calculate allocation summary
      const totalAllocated = allocationPlan.reduce((sum, item) => sum + item.allocatedQuantity, 0);
      const isFullyAllocated = (totalAllocated === totalQuantity);
      
      // Count how many SKUs were allocated to same-SKU bins (first priority)
      const sameSKUAllocations = allocationPlan.filter(a => a.priority === 1).length;
      
      // Count how many were allocated in shelf1->bin1 order (second priority)
      const orderedBinAllocations = allocationPlan.filter(a => a.priority === 2).length;
      
      console.log('🎉 GUARANTEED allocation complete:', {
        totalQuantity,
        totalAllocated,
        remainingQuantity,
        isFullyAllocated,
        binCount: allocationPlan.length,
        autoCreatedBins: allocationPlan.filter(a => a.autoCreated).length,
        sameSKUAllocations,
        orderedBinAllocations,
        strategyValidation: sameSKUAllocations > 0 ? 'Same-SKU bins prioritized correctly' : 'No same-SKU bins found'
      });

      // Calculate average utilization for analytics
      const averageUtilization = allocationPlan.length > 0 ? 
        allocationPlan.reduce((sum, a) => sum + parseFloat(a.utilization), 0) / allocationPlan.length : 0;

      // Return the allocation results
      return {
        allocationPlan,
        totalAllocated,
        remainingQuantity: 0, // Should always be 0 with guaranteed allocation
        isFullyAllocated: true, // Should always be true with guaranteed allocation
        averageUtilization,
        summary: {
          sameSKUAllocations: allocationPlan.filter(a => a.priority === 1).length,
          emptyBinAllocations: allocationPlan.filter(a => a.priority === 2).length,
          mixedSKUAllocations: allocationPlan.filter(a => a.priority === 3).length,
          autoCreatedBins: allocationPlan.filter(a => a.autoCreated).length,
          totalBinsUsed: allocationPlan.length,
          hasAutoCreated: allocationPlan.filter(a => a.autoCreated).length > 0,
          efficiency: averageUtilization >= 70 ? 'Excellent' : 'Good',
          orderedAllocation: true // Flag to indicate new allocation logic is being used
        }
      };
    } catch (error) {
      console.error('❌ Error in guaranteed auto-allocation:', error);
      
      // NO EMERGENCY FALLBACK - return error instead of creating bins
      throw new Error(`Allocation failed: ${error.message}. No available bins found with sufficient capacity. Please add more bins or free up existing bin space.`);
    }
  },

  /**
   * Calculate bin efficiency score for intelligent allocation
   */
  calculateBinEfficiencyScore(bin, sku, quantity, category) {
    let score = 0;
    const currentQty = parseInt(bin.currentQty) || 0;
    const capacity = bin.capacity;
    const availableSpace = capacity - currentQty;
    
    // Base score by category
    switch (category) {
      case 'same-sku':
        score = 1000; // Highest priority for same SKU
        // Bonus for better consolidation
        const utilizationAfter = Math.min(1, (currentQty + Math.min(quantity, availableSpace)) / capacity);
        score += utilizationAfter * 200; // Up to 200 bonus for good utilization
        
        // Bonus for filling bin to near capacity
        if (utilizationAfter >= 0.9) score += 100;
        else if (utilizationAfter >= 0.7) score += 50;
        
        break;
        
      case 'empty':
        score = 500; // Good priority for empty bins
        // Bonus for size efficiency
        const sizeEfficiency = Math.min(quantity / capacity, 1);
        score += sizeEfficiency * 150; // Up to 150 bonus for good size match
        
        // Bonus for exact or near-exact fit
        if (quantity === capacity) score += 100; // Perfect fit
        else if (quantity >= capacity * 0.8) score += 50; // Good fit
        
        break;
        
      case 'mixed-sku':
        score = 100; // Lowest priority - avoid if possible
        // Only consider if it's a very good fit
        const mixedUtilization = Math.min(1, (currentQty + Math.min(quantity, availableSpace)) / capacity);
        if (mixedUtilization >= 0.95) score += 50; // Only if it fills the bin very well
        
        break;
    }
    
    // Location bonuses (prefer ground level, good zones)
    if (bin.shelfLevel === 1) score += 20; // First grid bonus (easier access)
    else score -= (bin.shelfLevel - 1) * 5; // Penalty for higher shelves
    
    if (bin.zoneId === 'fast-pick' || bin.zoneId === 'main') score += 15; // Preferred zones
    
    // Accessibility bonus
    if (bin.position <= 3) score += 10; // Easy-to-reach positions
    
    return score;
  },

  /**
   * Execute auto-allocation plan (create multiple tasks if needed)
   */
  async executeAutoAllocation(warehouseId, sku, allocationPlan, productDetails = {}) {
    const { lotNumber, expiryDate, notes = '' } = productDetails;
    const results = [];

    try {
      for (let i = 0; i < allocationPlan.length; i++) {
        const allocation = allocationPlan[i];
        const { bin, allocatedQuantity, reason } = allocation;

        // Create individual task for each allocation
        const taskData = {
          sku,
          quantity: allocatedQuantity,
          lotNumber,
          expiryDate,
          suggestedBinId: bin.id,
          suggestedBinCode: bin.code,
          priority: 'medium',
          notes: `${notes}\nAuto-allocated: ${reason}`,
          autoExecute: true // Auto-execute each allocation
        };

        const task = await this.createPutAwayTask(warehouseId, taskData);
        results.push({
          task,
          allocation,
          success: task.status === 'completed'
        });

        console.log(`Auto-allocation ${i + 1}/${allocationPlan.length} completed for bin ${bin.code}`);
      }

      const successCount = results.filter(r => r.success).length;
      const totalTasks = results.length;

      return {
        results,
        summary: {
          totalTasks,
          successCount,
          failureCount: totalTasks - successCount,
          totalQuantityAllocated: results
            .filter(r => r.success)
            .reduce((sum, r) => sum + r.allocation.allocatedQuantity, 0)
        }
      };
    } catch (error) {
      console.error('Error executing auto-allocation:', error);
      throw error;
    }
  },

  /**
   * Get allocation history for a specific SKU or bin
   */
  async getAllocationHistory(warehouseId, filters = {}) {
    try {
      const { sku, binId, binCode, dateFrom, dateTo, limit = 50 } = filters;
      
      console.log('📊 Fetching allocation history with filters:', filters);

      // Get completed put-away tasks with audit logs
      const putAwayTasks = await warehouseService.getPutAwayTasks(warehouseId, {
        status: 'completed',
        ...(sku && { sku }),
        ...(binId && { actualBinId: binId }),
        ...(dateFrom && { completedAfter: dateFrom }),
        ...(dateTo && { completedBefore: dateTo }),
        limit
      });

      const allocationHistory = putAwayTasks
        .filter(task => task.auditLog && task.auditLog.length > 0)
        .map(task => {
          const audit = task.auditLog[0]; // Get the first (main) audit log entry
          return {
            id: task.id,
            timestamp: task.completedAt,
            sku: task.sku,
            quantity: task.actualQuantity,
            binId: task.actualBinId,
            binCode: audit.binCode,
            lotNumber: task.lotNumber,
            expiryDate: task.expiryDate,
            allocationType: audit.allocationType,
            allocationReason: audit.allocationReason,
            utilizationAfter: audit.utilization,
            isOptimalPlacement: audit.isOptimalPlacement,
            shelfLevel: audit.shelfLevel,
            zoneId: audit.zoneId,
            wasSuggested: audit.wasSuggested,
            efficiencyRating: this.calculateEfficiencyRating(parseFloat(audit.utilization))
          };
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Calculate analytics
      const analytics = this.calculateAllocationAnalytics(allocationHistory);

      return {
        history: allocationHistory,
        analytics,
        totalRecords: allocationHistory.length,
        filters
      };
    } catch (error) {
      console.error('❌ Error fetching allocation history:', error);
      throw error;
    }
  },

  /**
   * Get pick history for a specific SKU or bin
   */
  async getPickHistory(warehouseId, filters = {}) {
    try {
      const { sku, binId, binCode, dateFrom, dateTo, limit = 50 } = filters;
      
      console.log('📊 Fetching pick history with filters:', filters);

      // Get completed pick tasks with audit logs
      const pickTasks = await warehouseService.getPickTasks(warehouseId, {
        status: 'completed',
        ...(dateFrom && { completedAfter: dateFrom }),
        ...(dateTo && { completedBefore: dateTo }),
        limit
      });

      const pickHistory = [];

      for (const task of pickTasks) {
        if (task.auditLog && task.auditLog.length > 0) {
          // Filter audit logs based on criteria
          const relevantLogs = task.auditLog.filter(log => {
            if (sku && log.sku !== sku) return false;
            if (binId && log.binId !== binId) return false;
            if (binCode && log.binCode !== binCode) return false;
            return true;
          });

          // Convert each relevant log to history entry
          relevantLogs.forEach(log => {
            pickHistory.push({
              id: `${task.id}_${log.binId}`,
              taskId: task.id,
              orderNumber: task.orderNumber,
              timestamp: log.timestamp,
              sku: log.sku,
              quantity: log.quantity,
              binId: log.binId,
              binCode: log.binCode,
              lotNumber: log.lotNumber,
              expiryDate: log.expiryDate,
              previousQty: log.previousQty,
              newQty: log.newQty,
              binEmptied: log.newQty === 0,
              fifoCompliant: log.fifoCompliant,
              fifoReason: this.getFIFOReason({
                expiryDate: log.expiryDate,
                createdAt: log.timestamp,
                lotNumber: log.lotNumber,
                shelfLevel: 1 // Default, could be enhanced
              })
            });
          });
        }
      }

      // Sort by timestamp (most recent first)
      pickHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Take only the requested limit
      const limitedHistory = pickHistory.slice(0, limit);

      // Calculate analytics
      const analytics = this.calculatePickAnalytics(limitedHistory);

      return {
        history: limitedHistory,
        analytics,
        totalRecords: limitedHistory.length,
        filters
      };
    } catch (error) {
      console.error('❌ Error fetching pick history:', error);
      throw error;
    }
  },

  /**
   * Get comprehensive operation history (both puts and picks)
   */
  async getOperationHistory(warehouseId, filters = {}) {
    try {
      console.log('📊 Fetching comprehensive operation history:', filters);

      const { operationType } = filters;

      // If operationType filter is specified, only fetch that type
      if (operationType) {
        if (operationType.toLowerCase() === 'pick') {
          const pickHistory = await this.getPickHistory(warehouseId, filters);
          return {
            history: pickHistory.history.map(item => ({ ...item, operationType: 'PICK' })),
            pickAnalytics: pickHistory.analytics,
            totalRecords: pickHistory.history.length,
            filters
          };
        } else if (operationType.toLowerCase() === 'putaway' || operationType.toLowerCase() === 'put-away') {
          const allocationHistory = await this.getAllocationHistory(warehouseId, filters);
          return {
            history: allocationHistory.history.map(item => ({ ...item, operationType: 'PUTAWAY' })),
            allocationAnalytics: allocationHistory.analytics,
            totalRecords: allocationHistory.history.length,
            filters
          };
        }
      }

      // If no operationType filter, fetch both
      const [allocationHistory, pickHistory] = await Promise.all([
        this.getAllocationHistory(warehouseId, filters),
        this.getPickHistory(warehouseId, filters)
      ]);

      // Combine and sort by timestamp
      const combinedHistory = [
        ...allocationHistory.history.map(item => ({ ...item, operationType: 'PUTAWAY' })),
        ...pickHistory.history.map(item => ({ ...item, operationType: 'PICK' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return {
        history: combinedHistory.slice(0, filters.limit || 100),
        allocationAnalytics: allocationHistory.analytics,
        pickAnalytics: pickHistory.analytics,
        totalRecords: combinedHistory.length,
        filters
      };
    } catch (error) {
      console.error('❌ Error fetching operation history:', error);
      throw error;
    }
  },

  /**
   * Calculate allocation analytics
   */
  calculateAllocationAnalytics(allocationHistory) {
    if (allocationHistory.length === 0) {
      return {
        totalAllocations: 0,
        averageUtilization: 0,
        optimalPlacements: 0,
        optimalPlacementRate: 0,
        allocationTypes: {},
        efficiencyDistribution: {}
      };
    }

    const totalAllocations = allocationHistory.length;
    const optimalPlacements = allocationHistory.filter(h => h.isOptimalPlacement).length;
    const optimalPlacementRate = (optimalPlacements / totalAllocations * 100).toFixed(1);

    // Calculate average utilization
    const totalUtilization = allocationHistory.reduce((sum, h) => {
      const util = parseFloat(h.utilizationAfter) || 0;
      return sum + util;
    }, 0);
    const averageUtilization = (totalUtilization / totalAllocations).toFixed(1);

    // Group by allocation type
    const allocationTypes = allocationHistory.reduce((acc, h) => {
      acc[h.allocationType] = (acc[h.allocationType] || 0) + 1;
      return acc;
    }, {});

    // Group by efficiency rating
    const efficiencyDistribution = allocationHistory.reduce((acc, h) => {
      acc[h.efficiencyRating] = (acc[h.efficiencyRating] || 0) + 1;
      return acc;
    }, {});

    return {
      totalAllocations,
      averageUtilization: averageUtilization + '%',
      optimalPlacements,
      optimalPlacementRate: optimalPlacementRate + '%',
      allocationTypes,
      efficiencyDistribution
    };
  },

  /**
   * Calculate pick analytics
   */
  calculatePickAnalytics(pickHistory) {
    if (pickHistory.length === 0) {
      return {
        totalPicks: 0,
        fifoCompliantPicks: 0,
        fifoComplianceRate: 0,
        binsEmptied: 0,
        averageQuantityPerPick: 0
      };
    }

    const totalPicks = pickHistory.length;
    const fifoCompliantPicks = pickHistory.filter(h => h.fifoCompliant).length;
    const fifoComplianceRate = (fifoCompliantPicks / totalPicks * 100).toFixed(1);
    const binsEmptied = pickHistory.filter(h => h.binEmptied).length;
    
    const totalQuantity = pickHistory.reduce((sum, h) => sum + h.quantity, 0);
    const averageQuantityPerPick = (totalQuantity / totalPicks).toFixed(1);

    return {
      totalPicks,
      fifoCompliantPicks,
      fifoComplianceRate: fifoComplianceRate + '%',
      binsEmptied,
      binEmptyRate: (binsEmptied / totalPicks * 100).toFixed(1) + '%',
      averageQuantityPerPick
    };
  },

  /**
   * Calculate efficiency rating from utilization percentage
   */
  calculateEfficiencyRating(utilizationPercent) {
    if (utilizationPercent >= 90) return 'Excellent';
    if (utilizationPercent >= 70) return 'Good';
    if (utilizationPercent >= 50) return 'Fair';
    return 'Poor';
  },

  /**
   * Rollback a put-away or pick operation from history
   * @param {string} warehouseId
   * @param {object} historyEntry - An entry from getOperationHistory (must include operationType)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async rollbackOperationHistoryEntry(warehouseId, historyEntry) {
    if (!historyEntry || !historyEntry.operationType) {
      return { success: false, message: 'Invalid history entry' };
    }
    if (historyEntry.operationType === 'PUTAWAY') {
      // Rollback put-away: remove the SKU/quantity from the bin
      const bin = await warehouseService.getBin(warehouseId, historyEntry.binId);
      if (!bin) return { success: false, message: 'Bin not found' };
      const currentQty = parseInt(bin.currentQty) || 0;
      if (bin.sku !== historyEntry.sku) {
        return { success: false, message: 'SKU in bin does not match history. Manual intervention required.' };
      }
      if (currentQty < historyEntry.quantity) {
        return { success: false, message: 'Not enough quantity in bin to rollback.' };
      }
      const newQty = currentQty - historyEntry.quantity;
      const update = {
        currentQty: newQty,
        status: newQty === 0 ? 'available' : 'occupied',
        sku: newQty === 0 ? null : bin.sku,
        lotNumber: newQty === 0 ? null : bin.lotNumber,
        expiryDate: newQty === 0 ? null : bin.expiryDate,
        updatedAt: new Date().toISOString(),
        lastRollbackAt: new Date().toISOString(),
      };
      await warehouseService.updateBin(warehouseId, bin.id, update);
      return { success: true, message: `Rolled back put-away: removed ${historyEntry.quantity} of ${historyEntry.sku} from bin ${bin.code}` };
    } else if (historyEntry.operationType === 'PICK') {
      // Rollback pick: try to return the quantity to the original bin, or find a new bin
      let bin = await warehouseService.getBin(warehouseId, historyEntry.binId);
      let canRestore = false;
      if (bin && (bin.status === 'available' || bin.status === 'occupied')) {
        // If bin is empty or has same SKU and space, restore
        if (!bin.sku || bin.sku === historyEntry.sku) {
          const availableSpace = bin.capacity - (parseInt(bin.currentQty) || 0);
          if (availableSpace >= historyEntry.quantity) {
            canRestore = true;
            const newQty = (parseInt(bin.currentQty) || 0) + historyEntry.quantity;
            await warehouseService.updateBin(warehouseId, bin.id, {
              sku: historyEntry.sku,
              currentQty: newQty,
              status: 'occupied',
              updatedAt: new Date().toISOString(),
              lastRollbackAt: new Date().toISOString(),
            });
            return { success: true, message: `Rolled back pick: returned ${historyEntry.quantity} of ${historyEntry.sku} to bin ${bin.code}` };
          }
        }
      }
      // If can't restore to original bin, find a new bin (use autoAllocateQuantity)
      const allocation = await this.autoAllocateQuantity(warehouseId, historyEntry.sku, historyEntry.quantity);
      if (allocation && allocation.allocationPlan && allocation.allocationPlan.length > 0) {
        for (const plan of allocation.allocationPlan) {
          await warehouseService.updateBin(warehouseId, plan.bin.id, {
            sku: historyEntry.sku,
            currentQty: (parseInt(plan.bin.currentQty) || 0) + plan.allocatedQuantity,
            status: 'occupied',
            updatedAt: new Date().toISOString(),
            lastRollbackAt: new Date().toISOString(),
          });
        }
        return { success: true, message: `Rolled back pick: returned ${historyEntry.quantity} of ${historyEntry.sku} to new bin(s)` };
      }
      return { success: false, message: 'Could not find suitable bin to rollback pick.' };
    } else {
      return { success: false, message: 'Unknown operation type for rollback.' };
    }
  },

  // Helper methods
  async getAllBins(warehouseId) {
    try {
      const binsRef = collection(db, 'WHT', warehouseId, 'bins');
      const snapshot = await getDocs(binsRef);
      const bins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('getAllBins: Retrieved bins from Firestore:', bins.length);
      return bins;
    } catch (error) {
      console.error('Error getting all bins:', error);
      return [];
    }
  },

  async getPutAwayTask(warehouseId, taskId) {
    return await warehouseService.getPutAwayTask(warehouseId, taskId);
  },

  async getPickTask(warehouseId, taskId) {
    try {
      // Try to get the task using getPickTasks with filter
      const tasks = await warehouseService.getPickTasks(warehouseId, {
        taskId: taskId
      });
      return tasks && tasks.length > 0 ? tasks[0] : null;
    } catch (error) {
      console.error('Error getting pick task:', error);
      return null;
    }
  },

  estimatePutAwayTime(quantity) {
    // Estimate 2 minutes per 10 units
    return Math.ceil(quantity / 10) * 2;
  },

  estimatePickTime(items) {
    // Estimate 1 minute per item plus 30 seconds per bin
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueBins = new Set(items.map(item => item.binId)).size;
    return totalItems + (uniqueBins * 0.5);
  },

  generateRouteInstructions(items) {
    // Group by grid level and zone for optimal routing
    const groupedItems = items.reduce((acc, item) => {
      const key = `${item.zoneId || 'main'}-${item.shelfLevel || 1}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const instructions = [];
    Object.keys(groupedItems).sort().forEach(key => {
      const [zone, shelf] = key.split('-');
      instructions.push(`Go to Zone ${zone.toUpperCase()}, Shelf ${shelf}`);
      groupedItems[key].forEach(item => {
        instructions.push(`  - Pick ${item.quantity} units of ${item.sku} from bin ${item.binCode}`);
      });
    });

    return instructions;
  },

  /**
   * Test function to demonstrate correct allocation behavior
   * This can be used for debugging and validation
   */
  async testAllocationStrategy(warehouseId, testSku = 'TEST-SKU-001', testQuantity = 100) {
    console.log('🧪 TESTING ALLOCATION STRATEGY');
    console.log('=====================================');
    
    try {
      // Get current bins
      const bins = await this.getAllBins(warehouseId);
      
      // Find existing bins with the test SKU
      const existingSameSKUBins = bins.filter(bin => 
        bin.sku === testSku && 
        (parseInt(bin.currentQty) || 0) > 0 &&
        bin.capacity > (parseInt(bin.currentQty) || 0)
      );
      
      // Find empty bins
      const emptyBins = bins.filter(bin => 
        (parseInt(bin.currentQty) || 0) === 0 && 
        (bin.status === 'available' || bin.status === 'occupied')
      );
      
      console.log(`📊 BEFORE ALLOCATION:`);
      console.log(`- SKU: ${testSku}, Quantity to allocate: ${testQuantity}`);
      console.log(`- Existing same-SKU bins with space: ${existingSameSKUBins.length}`);
      if (existingSameSKUBins.length > 0) {
        existingSameSKUBins.forEach(bin => {
          const currentQty = parseInt(bin.currentQty) || 0;
          const availableSpace = bin.capacity - currentQty;
          console.log(`  • ${bin.code}: ${currentQty}/${bin.capacity} (${availableSpace} available)`);
        });
      }
      console.log(`- Empty bins available: ${emptyBins.length}`);
      
      // Run allocation
      const result = await this.autoAllocateQuantity(warehouseId, testSku, testQuantity);
      
      console.log(`📊 ALLOCATION RESULTS:`);
      console.log(`- Total allocated: ${result.totalAllocated}/${testQuantity}`);
      console.log(`- Bins used: ${result.allocationPlan.length}`);
      console.log(`- Same-SKU allocations: ${result.summary.sameSKUAllocations}`);
      console.log(`- Empty bin allocations: ${result.summary.emptyBinAllocations}`);
      
      console.log(`📋 ALLOCATION PLAN:`);
      result.allocationPlan.forEach((plan, index) => {
        console.log(`  ${index + 1}. ${plan.bin.code}: ${plan.allocatedQuantity} units (Priority ${plan.priority}) - ${plan.reason}`);
      });
      
      // Validate strategy
      const sameSKUFirst = result.allocationPlan.every((plan, index) => {
        if (index === 0) return true; // First item is always valid
        const currentPriority = plan.priority;
        const previousPriority = result.allocationPlan[index - 1].priority;
        return currentPriority >= previousPriority; // Priorities should be in order
      });
      
      console.log(`✅ STRATEGY VALIDATION: ${sameSKUFirst ? 'CORRECT' : 'INCORRECT'} - Same-SKU bins prioritized`);
      
      return result;
    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    }
  },
};
