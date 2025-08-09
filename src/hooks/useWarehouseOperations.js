import { useState, useCallback } from 'react';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import { warehouseOperations } from '../services/warehouseOperations';
import { auditService } from '../services/auditService';

export function useWarehouseOperations() {
  const { currentWarehouse, bins } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);

  const findOptimalBins = useCallback(async (sku, quantity, preferences = {}) => {
    if (!currentWarehouse) return [];
    
    try {
      setLoading(true);
      // Use bins from context instead of fetching
      const availableBins = bins.filter(bin => {
        if (bin.status !== 'available' && bin.status !== 'occupied') return false;
        if (bin.capacity - bin.currentQty < quantity) return false;
        if (preferences.zoneId && bin.zoneId !== preferences.zoneId) return false;
        return true;
      });

      // Score bins based on priority criteria
      const scoredBins = availableBins.map(bin => {
        let score = 0;
        
        // Same SKU with available space (highest priority)
        if (bin.sku === sku && bin.currentQty > 0) {
          score += 1000;
        }
        
        // Empty bins (second priority)
        if (bin.currentQty === 0) {
          score += 500;
        }
        
        // Prefer ground level
        if (bin.shelfLevel === 1) {
          score += 100;
        }
        
        // Lower scores for higher shelves
        score -= (bin.shelfLevel - 1) * 10;
        
        // Prefer bins with more available capacity
        const availableCapacity = bin.capacity - bin.currentQty;
        score += Math.min(availableCapacity, 50);
        
        // Zone preference
        if (preferences.zoneId && bin.zoneId === preferences.zoneId) {
          score += 200;
        }

        return {
          ...bin,
          score,
          availableCapacity,
        };
      });

      // Sort by score (highest first)
      scoredBins.sort((a, b) => b.score - a.score);
      return scoredBins.slice(0, 10);
    } catch (error) {
      showError(`Error finding optimal bins: ${error.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, bins, showError]);

  const createPutAwayTask = useCallback(async (taskData) => {
    if (!currentWarehouse) return null;
    
    try {
      setLoading(true);
      const task = await warehouseOperations.createPutAwayTask(currentWarehouse.id, taskData);
      
      // Log audit trail
      await auditService.logEvent(
        currentWarehouse.id,
        task.autoExecuted ? auditService.eventTypes.PUTAWAY_COMPLETED : auditService.eventTypes.TASK_CREATED,
        {
          entityType: 'put-away-task',
          entityId: task.id,
          description: `Put-away task ${task.autoExecuted ? 'auto-completed' : 'created'} for SKU ${taskData.sku}`,
          metadata: {
            sku: taskData.sku,
            quantity: taskData.quantity,
            priority: taskData.priority,
            autoExecuted: task.autoExecuted,
            actualBin: task.actualBinCode,
            suggestedBin: taskData.suggestedBinCode
          }
        }
      );
      
      if (task.autoExecuted) {
        showSuccess(`Put-away task created and automatically completed in bin ${task.actualBinCode}`);
      } else if (task.autoExecuteError) {
        showSuccess(`Put-away task created but auto-execution failed: ${task.autoExecuteError}`);
      } else {
        showSuccess('Put-away task created successfully');
      }
      
      return task;
    } catch (error) {
      showError(`Error creating put-away task: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, showSuccess, showError]);

  const executePutAway = useCallback(async (taskId, binId, quantity) => {
    if (!currentWarehouse) return null;
    
    try {
      setLoading(true);
      const result = await warehouseOperations.executePutAway(
        currentWarehouse.id,
        taskId,
        binId,
        quantity
      );
      
      // Log audit trail
      await auditService.logEvent(
        currentWarehouse.id,
        auditService.eventTypes.PUTAWAY_COMPLETED,
        {
          entityType: 'put-away-task',
          entityId: taskId,
          description: `Put-away task completed for task ${taskId}`,
          metadata: {
            binId,
            quantity,
            actualBin: result?.binCode
          }
        }
      );
      
      showSuccess('Put-away completed successfully');
      return result;
    } catch (error) {
      showError(`Error executing put-away: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, showSuccess, showError]);

  const findProductsForPicking = useCallback(async (sku, requiredQuantity) => {
    if (!currentWarehouse) return { pickPlan: [], totalAvailable: 0, shortfall: requiredQuantity };
    
    try {
      setLoading(true);
      
      // Get bins containing the SKU
      const productBins = bins
        .filter(bin => bin.sku === sku && bin.currentQty > 0)
        .sort((a, b) => {
          // FIFO by expiry date, then by grid level
          if (a.expiryDate && b.expiryDate) {
            const dateA = new Date(a.expiryDate);
            const dateB = new Date(b.expiryDate);
            if (dateA.getTime() !== dateB.getTime()) {
              return dateA.getTime() - dateB.getTime();
            }
          }
          return a.shelfLevel - b.shelfLevel;
        });

      // Calculate pick plan
      let remainingQuantity = requiredQuantity;
      const pickPlan = [];

      for (const bin of productBins) {
        if (remainingQuantity <= 0) break;

        const pickQuantity = Math.min(bin.currentQty, remainingQuantity);
        pickPlan.push({
          ...bin,
          pickQuantity,
        });
        remainingQuantity -= pickQuantity;
      }

      return {
        pickPlan,
        totalAvailable: productBins.reduce((sum, bin) => sum + bin.currentQty, 0),
        shortfall: Math.max(0, remainingQuantity),
      };
    } catch (error) {
      showError(`Error finding products for picking: ${error.message}`);
      return { pickPlan: [], totalAvailable: 0, shortfall: requiredQuantity };
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, bins, showError]);

  const createPickTask = useCallback(async (taskData) => {
    if (!currentWarehouse) return null;
    
    try {
      setLoading(true);
      const task = await warehouseOperations.createPickTask(currentWarehouse.id, taskData);
      showSuccess('Pick task created successfully');
      return task;
    } catch (error) {
      showError(`Error creating pick task: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, showSuccess, showError]);

  const executePickTask = useCallback(async (taskId, pickedItems) => {
    if (!currentWarehouse) return null;
    
    try {
      setLoading(true);
      const result = await warehouseOperations.executePick(
        currentWarehouse.id,
        taskId,
        pickedItems
      );
      showSuccess('Pick task completed successfully');
      return result;
    } catch (error) {
      showError(`Error executing pick task: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, showSuccess, showError]);

  const searchProducts = useCallback(async (searchTerm, filters = {}) => {
    if (!currentWarehouse) return [];
    
    try {
      setLoading(true);
      
      // Filter bins based on search term and filters
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
        const matchesZone = !filters.zoneId || bin.zoneId === filters.zoneId;
        const matchesStatus = !filters.status || bin.status === filters.status;
        const matchesQuantity = !filters.minQuantity || bin.currentQty >= filters.minQuantity;

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
      showError(`Error searching products: ${error.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentWarehouse, bins, showError]);

  return {
    loading,
    findOptimalBins,
    createPutAwayTask,
    executePutAway,
    findProductsForPicking,
    createPickTask,
    executePickTask,
    searchProducts,
  };
}
