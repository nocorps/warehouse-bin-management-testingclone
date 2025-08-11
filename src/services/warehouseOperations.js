import { warehouseService } from './warehouseService.js';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';

export const warehouseOperations = {
  // Track active pick operations to prevent concurrent bin changes
  activePickOperations: new Map(), // warehouseId -> Map(binId -> { operationId, timestamp })
  pickOperationTimeouts: new Map(), // warehouseId -> timeoutId for cleanup

  /**
   * Lock bins for picking to prevent inventory moves during operation
   */
  async lockBinsForPicking(warehouseId, binIds, operationId) {
    console.log(`🔒 Locking bins for pick operation: ${binIds.length} bins`, { operationId, binIds });
    
    if (!this.activePickOperations.has(warehouseId)) {
      this.activePickOperations.set(warehouseId, new Map());
    }
    
    const lockedBins = this.activePickOperations.get(warehouseId);
    
    // Check if any bins are already locked by a different operation
    const alreadyLocked = binIds.filter(binId => {
      const lockInfo = lockedBins.get(binId);
      return lockInfo && lockInfo.operationId !== operationId;
    });
    
    if (alreadyLocked.length > 0) {
      throw new Error(`Cannot start pick operation - bins already locked for picking: ${alreadyLocked.join(', ')}`);
    }
    
    // Lock all bins with operation ID and timestamp
    const timestamp = Date.now();
    binIds.forEach(binId => {
      lockedBins.set(binId, { operationId, timestamp });
    });
    
    // Set auto-cleanup timeout (10 minutes)
    this.setPickOperationTimeout(warehouseId, operationId);
    
    console.log(`✅ Successfully locked ${binIds.length} bins for picking`, { warehouseId, operationId });
  },

  /**
   * Release bin locks after pick operation completes
   */
  async releaseBinsFromPicking(warehouseId, binIds, operationId) {
    console.log(`🔓 Releasing bins from pick operation: ${binIds.length} bins`, { operationId, binIds });
    
    if (!this.activePickOperations.has(warehouseId)) {
      return;
    }
    
    const lockedBins = this.activePickOperations.get(warehouseId);
    
    // Release all bins
    binIds.forEach(binId => lockedBins.delete(binId));
    
    // Clear timeout if no more locked bins
    if (lockedBins.size === 0) {
      this.clearPickOperationTimeout(warehouseId);
    }
    
    console.log(`✅ Successfully released ${binIds.length} bins from picking`, { warehouseId, operationId });
  },

  /**
   * Check if bins are locked for picking
   */
  areBinsLockedForPicking(warehouseId, binIds) {
    if (!this.activePickOperations.has(warehouseId)) {
      return { locked: false, lockedBins: [], operationId: null };
    }
    
    const lockedBins = this.activePickOperations.get(warehouseId);
    const lockedFromList = binIds.filter(binId => lockedBins.has(binId));
    
    // Get the operation ID from the first locked bin (all should have same operation ID)
    let operationId = null;
    if (lockedFromList.length > 0) {
      const firstLockedBin = lockedBins.get(lockedFromList[0]);
      operationId = firstLockedBin ? firstLockedBin.operationId : null;
    }
    
    return {
      locked: lockedFromList.length > 0,
      lockedBins: lockedFromList,
      operationId,
      totalLocked: lockedBins.size
    };
  },

  /**
   * Set timeout for automatic lock cleanup
   */
  setPickOperationTimeout(warehouseId, operationId) {
    // Clear existing timeout
    this.clearPickOperationTimeout(warehouseId);
    
    // Set new timeout (10 minutes = 600,000 ms)
    const timeoutId = setTimeout(() => {
      console.warn(`⚠️ Auto-releasing pick locks due to timeout for warehouse ${warehouseId}, operation ${operationId}`);
      this.forceReleaseAllPickLocks(warehouseId);
    }, 600000);
    
    this.pickOperationTimeouts.set(warehouseId, timeoutId);
  },

  /**
   * Clear pick operation timeout
   */
  clearPickOperationTimeout(warehouseId) {
    const timeoutId = this.pickOperationTimeouts.get(warehouseId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pickOperationTimeouts.delete(warehouseId);
    }
  },

  /**
   * Force release all pick locks for a warehouse (emergency cleanup)
   */
  forceReleaseAllPickLocks(warehouseId) {
    console.warn(`🚨 Force releasing ALL pick locks for warehouse ${warehouseId}`);
    
    if (this.activePickOperations.has(warehouseId)) {
      const lockedBins = this.activePickOperations.get(warehouseId);
      console.warn(`🚨 Releasing ${lockedBins.size} locked bins:`, Array.from(lockedBins));
      this.activePickOperations.delete(warehouseId);
    }
    
    this.clearPickOperationTimeout(warehouseId);
  },

  /**
   * Validate bin operations against pick locks
   */
  validateBinOperationAgainstPickLocks(warehouseId, binIds, operationType = 'update', allowedOperationId = null) {
    const lockStatus = this.areBinsLockedForPicking(warehouseId, binIds);
    
    if (lockStatus.locked) {
      // Check if the current operation is the one that owns the lock
      if (allowedOperationId && lockStatus.operationId === allowedOperationId) {
        // This is the owning operation, allow it to proceed
        console.log(`🔓 Allowing ${operationType} operation for bins [${binIds.join(', ')}] - owned by operation ${allowedOperationId}`);
        return;
      }
      
      throw new Error(
        `Cannot ${operationType} bins - currently locked for active pick operation. ` +
        `Locked bins: ${lockStatus.lockedBins.join(', ')}. ` +
        `Please wait for pick operation to complete or contact system administrator.`
      );
    }
  },

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
      // STEP 1: Validate that the target bin is not locked for picking
      this.validateBinOperationAgainstPickLocks(warehouseId, [actualBinId], 'put-away to');
      
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
      } else if (bin.sku === task.sku && !bin.mixedContents) {
        // Same SKU consolidation only if bin doesn't have mixed contents
        allocationType = 'SAME_SKU_CONSOLIDATION';
        allocationReason = `Same SKU consolidation - Adding ${newQuantity} units to existing ${currentQty} units`;
      } else {
        // Either different SKU or same SKU but bin has mixed contents
        allocationType = 'MIXED_SKU_STORAGE';
        if (bin.sku === task.sku && bin.mixedContents) {
          allocationReason = `Mixed storage - Adding ${task.sku} (${newQuantity} units) to mixed bin (same as primary SKU)`;
        } else {
          allocationReason = `Mixed storage - Adding ${task.sku} (${newQuantity} units) to bin containing ${bin.sku}`;
        }
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

      // Update bin with mixed barcode strategy
      let binUpdateData = {
        currentQty: totalAfter,
        status: 'occupied',
        lastPutAwayAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Handle mixed barcode storage strategy
      if (allocationType === 'NEW_PLACEMENT') {
        // New placement - set the bin to this SKU
        binUpdateData.sku = task.sku;
        binUpdateData.lotNumber = task.lotNumber;
        binUpdateData.expiryDate = task.expiryDate;
      } else if (allocationType === 'SAME_SKU_CONSOLIDATION') {
        // Same SKU - update lot and expiry if newer
        binUpdateData.sku = task.sku;
        if (task.lotNumber) binUpdateData.lotNumber = task.lotNumber;
        if (task.expiryDate) binUpdateData.expiryDate = task.expiryDate;
      } else if (allocationType === 'MIXED_SKU_STORAGE') {
        // Mixed storage - keep original SKU but track mixed contents
        // Note: We keep the original bin SKU as primary, new SKU becomes secondary
        if (!bin.mixedContents) {
          // Initialize mixed contents tracking
          binUpdateData.mixedContents = [
            {
              sku: bin.sku,
              quantity: currentQty,
              lotNumber: bin.lotNumber,
              expiryDate: bin.expiryDate
            },
            {
              sku: task.sku,
              quantity: newQuantity,
              lotNumber: task.lotNumber,
              expiryDate: task.expiryDate
            }
          ];
        } else {
          // Add to existing mixed contents
          const existingContent = bin.mixedContents.find(content => 
            content.sku === task.sku && 
            content.lotNumber === task.lotNumber &&
            content.expiryDate === task.expiryDate
          );
          
          if (existingContent) {
            // Update existing content quantity
            existingContent.quantity += newQuantity;
          } else {
            // Add new content
            bin.mixedContents.push({
              sku: task.sku,
              quantity: newQuantity,
              lotNumber: task.lotNumber,
              expiryDate: task.expiryDate
            });
          }
          
          binUpdateData.mixedContents = bin.mixedContents;
        }
        
        // Keep the bin's primary SKU and lot info unchanged for mixed storage
        // This ensures the bin still shows its primary product
      }

      const updatedBin = await warehouseService.updateBin(warehouseId, actualBinId, binUpdateData);

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
   * Find products for picking with enhanced FIFO logic and mixed barcode support
   */
  async findProductsForPicking(warehouseId, sku, requiredQuantity) {
    try {
      console.log(`Finding products for picking: SKU=${sku}, Required=${requiredQuantity}`);
      
      // Get all bins and find ones containing the SKU (including mixed bins)
      const bins = await this.getAllBins(warehouseId);
      const productBins = [];

      for (const bin of bins) {
        if (bin.status !== 'occupied') continue;

        let availableQuantity = 0;
        let binSKUInfo = null;

        // Check if this bin contains the SKU we're looking for
        if (bin.mixedContents && Array.isArray(bin.mixedContents)) {
          // CRITICAL FIX: Always check mixed contents first, even for primary SKU
          // This prevents the bug where mixed bins are treated as pure bins
          const matchingContent = bin.mixedContents.find(content => content.sku === sku);
          if (matchingContent && matchingContent.quantity > 0) {
            availableQuantity = parseInt(matchingContent.quantity) || 0;
            binSKUInfo = {
              sku: matchingContent.sku,
              lotNumber: matchingContent.lotNumber,
              expiryDate: matchingContent.expiryDate,
              isMixed: true,
              originalBinSKU: bin.sku,
              allMixedSKUs: bin.mixedContents.map(c => c.sku).join(', ')
            };
            
            // Log mixed bin details for debugging
            console.log(`🔍 Found SKU ${sku} in mixed bin ${bin.code}: ${availableQuantity} units (Primary: ${bin.sku}, Contains: ${binSKUInfo.allMixedSKUs})`);
          }
        } else if (bin.sku === sku && bin.currentQty > 0) {
          // Only treat as pure bin if no mixed contents exist
          availableQuantity = parseInt(bin.currentQty) || 0;
          binSKUInfo = {
            sku: bin.sku,
            lotNumber: bin.lotNumber,
            expiryDate: bin.expiryDate,
            isMixed: false
          };
        }

        if (availableQuantity > 0 && binSKUInfo) {
          productBins.push({
            ...bin,
            availableQuantity,
            skuInfo: binSKUInfo,
            // Parse date properly for FIFO sorting
            parsedExpiryDate: binSKUInfo.expiryDate ? new Date(binSKUInfo.expiryDate) : null,
            // Parse creation date for secondary FIFO sorting
            parsedCreatedAt: bin.createdAt ? new Date(bin.createdAt) : new Date(),
            // Parse lot date if available for tertiary FIFO sorting
            parsedLotDate: binSKUInfo.lotNumber && bin.lotDate ? new Date(bin.lotDate) : null
          });
        }
      }

      // Sort by FIFO logic
      productBins.sort((a, b) => {
        // FIFO Logic: First In, First Out
        console.log(`Comparing bins: ${a.code} vs ${b.code}`);
        
        // 1. PRIMARY SORT: Expiry date (earliest expiry first)
        if (a.parsedExpiryDate && b.parsedExpiryDate) {
          const expiryDiff = a.parsedExpiryDate.getTime() - b.parsedExpiryDate.getTime();
          if (expiryDiff !== 0) {
            console.log(`  → Sorted by expiry: ${a.skuInfo.expiryDate} vs ${b.skuInfo.expiryDate}`);
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
        
        // 6. QUINARY SORT: Level within grid (A, B, C, D, E, F, G, H)
        const aLevel = a.level || 'A';
        const bLevel = b.level || 'A';
        const levelDiff = aLevel.localeCompare(bLevel);
        if (levelDiff !== 0) {
          console.log(`  → Sorted by level: ${aLevel} vs ${bLevel}`);
          return levelDiff;
        }
        
        // 7. FINAL SORT: Bin code for consistent ordering
        return (a.code || '').localeCompare(b.code || '');
      });

      console.log('FIFO sorted bins with mixed barcode support:', productBins.map(bin => ({
        code: bin.code,
        availableQuantity: bin.availableQuantity,
        sku: bin.skuInfo.sku,
        isMixed: bin.skuInfo.isMixed,
        originalBinSKU: bin.skuInfo.originalBinSKU,
        expiryDate: bin.skuInfo.expiryDate,
        createdAt: bin.createdAt,
        shelfLevel: bin.shelfLevel,
        lotNumber: bin.skuInfo.lotNumber
      })));

      // Calculate pick plan with FIFO allocation
      let remainingQuantity = requiredQuantity;
      const pickPlan = [];
      let totalPicked = 0;

      for (const bin of productBins) {
        if (remainingQuantity <= 0) break;

        const pickQuantity = Math.min(bin.availableQuantity, remainingQuantity);
        if (pickQuantity > 0) {
          pickPlan.push({
            ...bin,
            pickQuantity,
            remainingInBin: bin.availableQuantity - pickQuantity,
            fifoReason: this.getFIFOReason(bin.skuInfo),
            pickOrder: pickPlan.length + 1,
            isMixed: bin.skuInfo.isMixed,
            originalBinSKU: bin.skuInfo.originalBinSKU
          });
          remainingQuantity -= pickQuantity;
          totalPicked += pickQuantity;
          
          console.log(`✓ FIFO Pick Plan: Bin ${bin.code} - Pick ${pickQuantity}/${bin.availableQuantity} (${bin.skuInfo.isMixed ? `Mixed bin (Primary: ${bin.skuInfo.originalBinSKU}, Contains: ${bin.skuInfo.allMixedSKUs || 'Unknown'})` : 'Pure bin'}), Remaining needed: ${remainingQuantity}`);
        }
      }

      const result = {
        pickPlan,
        totalAvailable: productBins.reduce((sum, bin) => sum + bin.availableQuantity, 0),
        totalPicked,
        shortfall: Math.max(0, remainingQuantity),
        isFullyAvailable: remainingQuantity === 0,
        fifoCompliant: true
      };

      console.log('FIFO Pick Result with Mixed Barcode Support:', {
        requiredQuantity,
        totalAvailable: result.totalAvailable,
        totalPicked,
        shortfall: result.shortfall,
        binsUsed: pickPlan.length,
        mixedBins: pickPlan.filter(p => p.isMixed).length
      });

      return result;
    } catch (error) {
      console.error('Error finding products for picking:', error);
      throw error;
    }
  },

  /**
   * Get FIFO explanation for a bin (supporting mixed barcode structure)
   */
  getFIFOReason(binOrSkuInfo) {
    const reasons = [];
    
    // Handle both old bin structure and new skuInfo structure
    const skuInfo = binOrSkuInfo.skuInfo || binOrSkuInfo;
    const bin = binOrSkuInfo.bin || binOrSkuInfo;
    
    if (skuInfo.expiryDate) {
      const expiryDate = new Date(skuInfo.expiryDate);
      const daysToExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      reasons.push(`Expires in ${daysToExpiry} days`);
    }
    
    if (bin.createdAt || skuInfo.createdAt) {
      const createdDate = new Date(bin.createdAt || skuInfo.createdAt);
      const daysOld = Math.ceil((new Date() - createdDate) / (1000 * 60 * 60 * 24));
      reasons.push(`${daysOld} days old`);
    }
    
    if (skuInfo.lotNumber) {
      reasons.push(`Lot: ${skuInfo.lotNumber}`);
    }
    
    if (skuInfo.isMixed) {
      const mixedInfo = skuInfo.allMixedSKUs ? `, Contains: ${skuInfo.allMixedSKUs}` : '';
      reasons.push(`Mixed bin (Primary: ${skuInfo.originalBinSKU}${mixedInfo})`);
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
   * Execute pick operation with enhanced FIFO logic and bin locking
   */
  async executePick(warehouseId, taskId, pickedItems) {
    // Generate unique operation ID for tracking
    const operationId = `pick-${taskId}-${Date.now()}`;
    const binIds = [...new Set(pickedItems.map(item => item.binId))]; // Unique bin IDs
    
    try {
      console.log('🔄 Executing pick operation with FIFO logic and bin locking:', { 
        taskId, 
        operationId,
        pickedItems: pickedItems.length,
        uniqueBins: binIds.length
      });
      
      // STEP 1: Lock all bins involved in this pick operation
      await this.lockBinsForPicking(warehouseId, binIds, operationId);
      
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

      // CRITICAL FIX: Pre-validate all bins before starting any picks
      // This prevents the race condition where early picks affect later picks
      console.log('🔍 Pre-validating all bins before execution to prevent inventory inconsistencies...');
      const binValidationResults = [];
      
      for (const pickedItem of pickedItems) {
        const { binId, quantity, sku } = pickedItem;
        const bin = await warehouseService.getBin(warehouseId, binId);
        
        if (!bin) {
          throw new Error(`VALIDATION FAILED: Bin ${binId} not found`);
        }
        
        let availableQuantityForSKU = 0;
        
        // Check if this is a primary SKU bin or mixed bin
        if (bin.mixedContents && Array.isArray(bin.mixedContents)) {
          const matchingContent = bin.mixedContents.find(content => content.sku === sku);
          if (matchingContent) {
            availableQuantityForSKU = parseInt(matchingContent.quantity) || 0;
          }
        } else if (bin.sku === sku) {
          availableQuantityForSKU = parseInt(bin.currentQty) || 0;
        }
        
        if (availableQuantityForSKU < quantity) {
          throw new Error(`VALIDATION FAILED: Insufficient quantity of SKU ${sku} in bin ${bin.code}. Available: ${availableQuantityForSKU}, Requested: ${quantity}. This indicates a planning vs execution race condition - please recalculate pick plans.`);
        }
        
        binValidationResults.push({
          binId,
          bin,
          availableQuantityForSKU,
          validated: true
        });
      }
      
      console.log(`✅ All ${binValidationResults.length} bins pre-validated successfully`);

      // Process each picked item with FIFO validation
      for (let i = 0; i < pickedItems.length; i++) {
        const pickedItem = pickedItems[i];
        const { binId, quantity, sku, lotNumber, expiryDate } = pickedItem;
        
        console.log(`📦 Processing pick ${i + 1}/${pickedItems.length}: ${quantity} units from bin ${binId}`);

        // Get current bin state (refresh to get latest data)
        const bin = await warehouseService.getBin(warehouseId, binId);
        if (!bin) {
          throw new Error(`Bin ${binId} not found`);
        }

        // Validate pick operation for mixed barcode support
        const currentQty = parseInt(bin.currentQty) || 0;
        let availableQuantityForSKU = 0;
        let skuLocation = null;

        // Check if this is a primary SKU bin or mixed bin
        if (bin.mixedContents && Array.isArray(bin.mixedContents)) {
          // For mixed bins, always check mixed contents regardless of primary SKU
          const matchingContent = bin.mixedContents.find(content => content.sku === sku);
          if (matchingContent) {
            availableQuantityForSKU = parseInt(matchingContent.quantity) || 0;
            skuLocation = 'mixed';
          }
        } else if (bin.sku === sku) {
          // Simple bin with primary SKU
          availableQuantityForSKU = currentQty;
          skuLocation = 'primary';
        }

        if (availableQuantityForSKU === 0) {
          throw new Error(`SKU ${sku} not found in bin ${bin.code}`);
        }

        if (availableQuantityForSKU < quantity) {
          throw new Error(`Insufficient quantity of SKU ${sku} in bin ${bin.code}. Available: ${availableQuantityForSKU}, Requested: ${quantity}`);
        }

        // Calculate new bin state for mixed barcode support
        let binUpdate = {
          lastPickedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (skuLocation === 'primary') {
          // Picking from primary SKU
          const newTotalQty = currentQty - quantity;
          const isEmpty = newTotalQty === 0;

          binUpdate.currentQty = newTotalQty;
          binUpdate.status = isEmpty ? 'available' : 'occupied';
          
          if (isEmpty) {
            // Bin becomes empty
            binUpdate.sku = null;
            binUpdate.lotNumber = null;
            binUpdate.expiryDate = null;
            binUpdate.mixedContents = null;
          }
        } else {
          // Picking from mixed contents
          const updatedMixedContents = bin.mixedContents.map(content => {
            if (content.sku === sku) {
              return { ...content, quantity: content.quantity - quantity };
            }
            return content;
          }).filter(content => content.quantity > 0); // Remove entries with 0 quantity

          const newTotalQty = updatedMixedContents.reduce((sum, content) => sum + content.quantity, 0);
          
          if (newTotalQty === 0) {
            // Bin becomes completely empty
            binUpdate.currentQty = 0;
            binUpdate.status = 'available';
            binUpdate.sku = null;
            binUpdate.lotNumber = null;
            binUpdate.expiryDate = null;
            binUpdate.mixedContents = null;
          } else if (updatedMixedContents.length === 1) {
            // Only one SKU left, convert back to simple bin
            const remainingContent = updatedMixedContents[0];
            binUpdate.currentQty = remainingContent.quantity;
            binUpdate.status = 'occupied';
            binUpdate.sku = remainingContent.sku;
            binUpdate.lotNumber = remainingContent.lotNumber;
            binUpdate.expiryDate = remainingContent.expiryDate;
            binUpdate.mixedContents = null;
          } else {
            // Still mixed, update the contents and total quantity
            binUpdate.currentQty = newTotalQty;
            binUpdate.status = 'occupied';
            binUpdate.mixedContents = updatedMixedContents;
          }
        }

        // Update bin in database with operation ID to allow the owning operation to proceed
        await warehouseService.updateBin(warehouseId, binId, binUpdate, operationId);

        const newTotalQty = binUpdate.currentQty;
        const isEmpty = newTotalQty === 0;

        binUpdates.push({
          binId,
          binCode: bin.code,
          previousQty: currentQty,
          pickedQty: quantity,
          newQty: newTotalQty,
          isEmpty,
          sku: sku,
          lotNumber: lotNumber || bin.lotNumber,
          expiryDate: expiryDate || bin.expiryDate,
          skuLocation,
          wasMixed: skuLocation === 'mixed'
        });

        auditLog.push({
          action: 'PICK',
          binId,
          binCode: bin.code,
          sku: sku,
          quantity: quantity,
          lotNumber: lotNumber || bin.lotNumber,
          expiryDate: expiryDate || bin.expiryDate,
          previousQty: currentQty,
          newQty: newTotalQty,
          fifoCompliant: true,
          skuLocation,
          wasMixed: skuLocation === 'mixed',
          timestamp: new Date().toISOString()
        });

        console.log(`✅ Picked ${quantity} units of ${sku} from ${skuLocation} position in bin ${bin.code} (Total: ${currentQty} → ${newTotalQty})`);
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
    } finally {
      // STEP 3: Always release bin locks, even if operation failed
      try {
        await this.releaseBinsFromPicking(warehouseId, binIds, operationId);
      } catch (releaseError) {
        console.error('❌ Error releasing bin locks:', releaseError);
        // Force release as backup
        this.forceReleaseAllPickLocks(warehouseId);
      }
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
   * Mixed Barcode Auto-Allocation Strategy
   * 
   * PRIORITY ORDER for mixed barcode allocation:
   * 1. Fill same SKU bins to capacity first (PRIORITY 1) - Consolidate same products
   * 2. Search bins from first to last for any available space (PRIORITY 2) - Mix barcodes efficiently
   * 
   * This allows multiple different barcodes to share the same bin, maximizing space utilization.
   */
  async autoAllocateQuantity(warehouseId, sku, totalQuantity, preferences = {}) {
    try {
      console.log('🔄 MIXED BARCODE Auto-allocating quantity:', { sku, totalQuantity, preferences });
      console.log('📋 ALLOCATION STRATEGY: 1) Fill same-SKU bins first, 2) Search all bins for available space (mixed barcodes allowed)');
      
      // Input validation
      if (!totalQuantity || isNaN(totalQuantity) || totalQuantity <= 0) {
        throw new Error('Invalid quantity for allocation');
      }
      
      // Get all bins for the warehouse using Firebase real-time data
      const bins = await this.getAllBins(warehouseId);
      console.log('📦 Total bins found:', bins.length);

      // SAFETY CHECK: Exclude bins that are locked for picking operations
      // This prevents allocation conflicts during active pick operations
      const lockedBinIds = this.areBinsLockedForPicking(warehouseId, bins.map(b => b.id));
      const availableBins = bins.filter(bin => !lockedBinIds.lockedBins.includes(bin.id));
      
      if (lockedBinIds.locked) {
        console.log(`⚠️ Excluding ${lockedBinIds.lockedBins.length} bins locked for picking operations:`, lockedBinIds.lockedBins);
      }

      // Create allocation plan
      const allocationPlan = [];
      let remainingQuantity = totalQuantity;

      // PHASE 1: Find and use existing bins with the SAME SKU (highest priority)
      // This ensures we consolidate same products first
      let sameSKUBins = availableBins.filter(bin => {
        // Must be active, have the same SKU, and have space
        const isActive = (bin.status === 'available' || bin.status === 'occupied');
        const isSameSKU = (bin.sku === sku);
        const currentQty = parseInt(bin.currentQty) || 0;
        const capacity = parseInt(bin.capacity) || 0;
        const hasSpace = capacity > currentQty;
        
        return isActive && isSameSKU && hasSpace;
      }).sort((a, b) => {
        // Sort by bin order (bin1, bin2, bin3, etc.) for sequential filling
        return (a.code || '').localeCompare(b.code || '');
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
      }      // PHASE 2: Search ALL bins from first to last for available space (Mixed Barcode Strategy)
      // This allows different barcodes to share bins, maximizing space utilization
      if (remainingQuantity > 0) {
        let availableBinsForMixed = availableBins.filter(bin => {
          // Must be active and have space, regardless of current SKU
          const isActive = (bin.status === 'available' || bin.status === 'occupied');
          const currentQty = parseInt(bin.currentQty) || 0;
          const capacity = parseInt(bin.capacity) || 0;
          const hasSpace = capacity > currentQty;
          
          // Skip bins we already used in Phase 1 to avoid double allocation
          const alreadyUsed = allocationPlan.some(plan => plan.bin.id === bin.id);
          
          return isActive && hasSpace && !alreadyUsed;
        }).sort((a, b) => {
          // Sort by bin order (bin1, bin2, bin3, etc.) for sequential filling
          return (a.code || '').localeCompare(b.code || '');
        });
        
        // Log sorting results for debugging
        console.log('📊 Available bins sorted in order:', 
          availableBinsForMixed.slice(0, 10).map(bin => 
            `${bin.code} (CurrentSKU: ${bin.sku || 'Empty'}, Space: ${bin.capacity - (parseInt(bin.currentQty) || 0)}/${bin.capacity})`
          ));
        
        // Allocate to available bins in order - fill each to capacity before moving to next
        console.log(`📦 Phase 2: Available bins for mixed allocation: ${availableBinsForMixed.length}`);
        for (const bin of availableBinsForMixed) {
          if (remainingQuantity <= 0) break;
          
          const currentQty = parseInt(bin.currentQty) || 0;
          const availableSpace = bin.capacity - currentQty;
          const allocateQty = Math.min(remainingQuantity, availableSpace);
          
          if (allocateQty > 0) {
            const newTotal = currentQty + allocateQty;
            const isEmptyBin = currentQty === 0;
            const isMixedBin = currentQty > 0 && bin.sku && bin.sku !== sku;
            
            let reason = '';
            if (isEmptyBin) {
              reason = `New placement in empty bin - ${allocateQty} units`;
            } else if (isMixedBin) {
              reason = `Mixed storage - Adding ${allocateQty} units of ${sku} to bin with ${bin.sku}`;
            } else {
              reason = `Adding ${allocateQty} units to available space`;
            }
            
            allocationPlan.push({
              bin,
              allocatedQuantity: allocateQty,
              reason,
              priority: 2,
              newTotal,
              utilization: ((newTotal / bin.capacity) * 100).toFixed(1),
              isMixed: isMixedBin
            });
            
            remainingQuantity -= allocateQty;
            console.log(`✅ Phase 2: Allocated ${allocateQty} to bin ${bin.code} (${isEmptyBin ? 'Empty' : isMixedBin ? 'Mixed' : 'Available'} bin: ${currentQty}+${allocateQty}=${newTotal}), remaining: ${remainingQuantity}`);
          }
        }
      }

      // PHASE 3: NO LONGER CREATE NEW BINS AUTOMATICALLY
      if (remainingQuantity > 0) {
        console.log(`❌ Phase 3: ${remainingQuantity} remaining units could not be allocated - no available bins found`);
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
            mixedBinAllocations: allocationPlan.filter(a => a.isMixed).length,
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
      
      // Count how many were allocated to mixed bins (second priority)
      const mixedAllocations = allocationPlan.filter(a => a.priority === 2).length;
      const mixedBinAllocations = allocationPlan.filter(a => a.isMixed).length;
      
      console.log('🎉 MIXED BARCODE allocation complete:', {
        totalQuantity,
        totalAllocated,
        remainingQuantity,
        isFullyAllocated,
        binCount: allocationPlan.length,
        sameSKUAllocations,
        mixedAllocations,
        mixedBinAllocations,
        strategyValidation: sameSKUAllocations > 0 ? 'Same-SKU bins prioritized correctly' : 'No same-SKU bins found'
      });

      // Calculate average utilization for analytics
      const averageUtilization = allocationPlan.length > 0 ? 
        allocationPlan.reduce((sum, a) => sum + parseFloat(a.utilization), 0) / allocationPlan.length : 0;

      // Return the allocation results
      return {
        allocationPlan,
        totalAllocated,
        remainingQuantity: 0, // Should always be 0 with successful allocation
        isFullyAllocated: true, // Should always be true with successful allocation
        averageUtilization,
        summary: {
          sameSKUAllocations: allocationPlan.filter(a => a.priority === 1).length,
          mixedAllocations: allocationPlan.filter(a => a.priority === 2).length,
          mixedBinAllocations: allocationPlan.filter(a => a.isMixed).length,
          autoCreatedBins: 0, // No auto-created bins in this strategy
          totalBinsUsed: allocationPlan.length,
          hasAutoCreated: false,
          efficiency: averageUtilization >= 70 ? 'Excellent' : 'Good',
          mixedBarcodeStrategy: true // Flag to indicate mixed barcode allocation is being used
        }
      };
    } catch (error) {
      console.error('❌ Error in mixed barcode auto-allocation:', error);
      
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
