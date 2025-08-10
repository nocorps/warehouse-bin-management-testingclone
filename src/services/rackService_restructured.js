import { warehouseService } from './warehouseService';

export class RackService {
  /**
   * Generate location code based on the format: WH1-GF-R04-G01-A1
   * WH1 = Warehouse, GF = Floor, R04 = Rack, G01 = Grid, A1 = Bin (position within grid)
   * New format: Within each grid, positions increment sequentially
   * Grid 1: A1, A2, A3, A4... Grid 2: B1, B2, B3, B4...
   * gridNumber determines the letter (1=A, 2=B, 3=C, etc.)
   * binNumber is the position within that grid (1, 2, 3, etc.)
   */
  generateLocationCode(warehouseCode, floor, rackNumber, gridNumber, binNumber) {
    const paddedRack = String(rackNumber).padStart(2, '0');
    const paddedGrid = String(gridNumber).padStart(2, '0');
    const binCode = this.numberToBinLetter(binNumber, gridNumber);
    
    return `${warehouseCode}1-${floor}-R${paddedRack}-G${paddedGrid}-${binCode}`;
  }

  /**
   * Convert bin number to letter format with position
   * New format: Grid determines letter, position is sequential within grid
   * Grid 1: A1, A2, A3... Grid 2: B1, B2, B3... Grid 3: C1, C2, C3...
   * gridNumber determines the letter (1=A, 2=B, 3=C, etc.)
   * binNumber is the position within that grid
   */
  numberToBinLetter(binNumber, gridNumber = 1) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letterIndex = (gridNumber - 1) % letters.length;
    const letter = letters[letterIndex];
    
    return `${letter}${binNumber}`;
  }

  /**
   * Parse location code back to components
   * Handles new format: WH1-GF-R04-G01-A1 where A1 = grid A, position 1
   */
  parseLocationCode(locationCode) {
    const parts = locationCode.split('-');
    if (parts.length !== 5) return null;

    const binPart = parts[4]; // e.g., "A1"
    const gridLetter = binPart.charAt(0); // "A"
    const position = parseInt(binPart.substring(1)) || 1; // "1"
    const gridNumber = gridLetter.charCodeAt(0) - 'A'.charCodeAt(0) + 1; // A=1, B=2, C=3

    return {
      warehouse: parts[0],
      floor: parts[1],
      rack: parseInt(parts[2].substring(1)),
      grid: parseInt(parts[3].substring(1)),
      bin: binPart,
      gridNumber: gridNumber,
      position: position
    };
  }

  /**
   * Create a complete rack structure with the new location format
   */
  async createRackWithStructure(warehouseId, rackConfig) {
    const {
      name,
      floor,
      gridCount,
      binsPerGrid,
      maxProductsPerBin,
      location,
      dimensions
    } = rackConfig;

    try {
      // Get warehouse info for location code
      const warehouse = await warehouseService.getWarehouse(warehouseId);
      const warehouseCode = warehouse.code || 'WH';

      // Check if rack number already exists with detailed error message
      const rackNumber = rackConfig.rackNumber || 1;
      const availability = await this.checkRackNumberAvailability(warehouseId, rackNumber);
      
      if (!availability.available) {
        const suggestions = availability.suggestions.slice(0, 3).map(n => `R${String(n).padStart(2, '0')}`).join(', ');
        
        throw new Error(
          `❌ Row R${String(rackNumber).padStart(2, '0')} already exists!\n\n` +
          `📋 Existing rack: "${availability.conflictRack.name}"\n` +
          `   └─ ${availability.conflictRack.gridCount || availability.conflictRack.shelfCount || 0} grids × ${availability.conflictRack.binsPerGrid || availability.conflictRack.binsPerShelf || 0} bins = ${(availability.conflictRack.gridCount || availability.conflictRack.shelfCount || 0) * (availability.conflictRack.binsPerGrid || availability.conflictRack.binsPerShelf || 0)} total bins\n\n` +
          `💡 Suggested alternatives: ${suggestions}\n\n` +
          `Please choose a different rack number.`
        );
      }

      // Create the rack
      const rackCode = `R${String(rackNumber).padStart(2, '0')}`;
      
      const rackData = {
        code: rackCode,
        name,
        floor,
        rackNumber: rackConfig.rackNumber || 1,
        gridCount,
        binsPerGrid,
        maxProductsPerBin,
        location,
        dimensions,
        warehouseId,
        createdAt: new Date().toISOString(),
        totalBins: gridCount * binsPerGrid,
        status: 'active'
      };

      const rack = await warehouseService.createRack(warehouseId, rackData);

      // Create grids and bins with proper location codes
      const grids = [];
      const bins = [];
      
      for (let gridNum = 1; gridNum <= gridCount; gridNum++) {
        // Create grid
        const gridData = {
          rackId: rack.id,
          rackName: rack.name,
          level: gridNum,
          binsCount: binsPerGrid,
          warehouseId,
          createdAt: new Date().toISOString()
        };
        
        const grid = await warehouseService.createShelf(warehouseId, gridData);
        grids.push(grid);

        // Create bins for this grid - sequential positions A1, A2, A3... for grid 1, B1, B2, B3... for grid 2
        for (let position = 1; position <= binsPerGrid; position++) {
          const locationCode = this.generateLocationCode(
            warehouseCode,
            floor,
            rackConfig.rackNumber || 1,
            gridNum,
            position
          );

          const binData = {
            code: locationCode,
            rackId: rack.id,
            rackCode: rack.name,
            shelfId: grid.id,
            gridLevel: gridNum,
            shelfLevel: gridNum, // For backward compatibility - now represents grid number
            position: position,
            capacity: maxProductsPerBin,
            currentQty: 0,
            status: 'available',
            warehouseId,
            floorCode: floor,
            gridCode: `G${String(gridNum).padStart(2, '0')}`,
            location: {
              warehouse: warehouseCode,
              floor: floor,
              grid: gridNum,
              rack: rack.rackNumber || 1,
              gridNumber: gridNum,
              position: position,
              fullCode: locationCode
            },
            createdAt: new Date().toISOString()
          };

          const bin = await warehouseService.createBin(warehouseId, binData);
          bins.push(bin);
        }
      }

      return {
        rack,
        grids,
        bins,
        summary: {
          totalGrids: grids.length,
          totalBins: bins.length,
          rackName: rack.name,
          floor: floor
        }
      };
    } catch (error) {
      console.error('Error creating rack structure:', error);
      throw error;
    }
  }

  /**
   * Update existing rack structure - supports continuous updates
   * Handles: increasing/decreasing bins, changing capacity, relocating products
   */
  async updateRackStructure(warehouseId, rackId, rackConfig) {
    const {
      name,
      floor,
      gridCount,
      binsPerGrid,
      maxProductsPerBin,
      location,
      dimensions
    } = rackConfig;

    try {
      // Get warehouse info for location code
      const warehouse = await warehouseService.getWarehouse(warehouseId);
      const warehouseCode = warehouse.code || 'WH';

      // Get existing rack data
      const existingRack = await this.getRack(warehouseId, rackId);
      if (!existingRack) {
        throw new Error('Rack not found');
      }

      // Check if rack number changed and if it conflicts
      const newRackNumber = rackConfig.rackNumber || existingRack.rackNumber || 1;
      if (newRackNumber !== existingRack.rackNumber) {
        const availability = await this.checkRackNumberAvailability(warehouseId, newRackNumber, rackId);
        
        if (!availability.available) {
          const suggestions = availability.suggestions.slice(0, 3).map(n => `R${String(n).padStart(2, '0')}`).join(', ');
          
          throw new Error(
            `❌ Row R${String(newRackNumber).padStart(2, '0')} already exists!\n\n` +
            `📋 Existing rack: "${availability.conflictRack.name}"\n\n` +
            `💡 Available alternatives: ${suggestions}\n\n` +
            `Please choose a different number.`
          );
        }
      }

      // Get existing bins for this rack
      const existingBins = await warehouseService.getBins(warehouseId);
      const rackBins = existingBins.filter(bin => bin.rackId === rackId);
      
      // Check for products in bins that might be affected
      const occupiedBins = rackBins.filter(bin => bin.currentQty > 0);
      const currentGridCount = existingRack.gridCount || existingRack.shelfCount || 0;
      const currentBinsPerGrid = existingRack.binsPerGrid || existingRack.binsPerShelf || 0;

      // Check if we're reducing size and have products in bins that would be removed
      if (gridCount < currentGridCount || binsPerGrid < currentBinsPerGrid) {
        const binsToRemove = rackBins.filter(bin => {
          const gridLevel = bin.gridLevel || bin.shelfLevel || 1;
          const position = bin.position || 1;
          return gridLevel > gridCount || position > binsPerGrid;
        });

        const occupiedBinsToRemove = binsToRemove.filter(bin => bin.currentQty > 0);
        if (occupiedBinsToRemove.length > 0) {
          const productList = occupiedBinsToRemove.map(bin => 
            `${bin.code}: ${bin.sku || 'Unknown'} (${bin.currentQty} units)`
          ).join(', ');
          throw new Error(`Cannot reduce rack size. The following bins contain products: ${productList}. Please relocate these products first.`);
        }
      }

      // Update rack data
      const rackCode = `R${String(newRackNumber).padStart(2, '0')}`;
      const updatedRackData = {
        code: rackCode,
        name,
        floor,
        rackNumber: newRackNumber,
        gridCount,
        binsPerGrid,
        maxProductsPerBin,
        location,
        dimensions,
        totalBins: gridCount * binsPerGrid,
        status: 'active',
        // Also update legacy field names for compatibility
        shelfCount: gridCount,
        binsPerShelf: binsPerGrid,
        updatedAt: new Date().toISOString()
      };

      await warehouseService.updateRack(warehouseId, rackId, updatedRackData);

      // Handle bin updates/creation/deletion
      const targetBinCount = gridCount * binsPerGrid;
      const currentBinCount = rackBins.length;

      if (targetBinCount > currentBinCount) {
        // Need to create new bins
        await this.createAdditionalBins(warehouseId, rackId, existingRack, rackConfig, warehouseCode);
      } else if (targetBinCount < currentBinCount) {
        // Need to remove bins (already checked they're empty)
        await this.removeExcessBins(warehouseId, rackBins, gridCount, binsPerGrid);
      }

      // Update existing bin capacities if maxProductsPerBin changed
      if (maxProductsPerBin !== (existingRack.maxProductsPerBin || 100)) {
        await this.updateBinCapacities(warehouseId, rackBins, maxProductsPerBin);
      }

      // Update location codes if rack number, floor, or warehouse code changed
      if (newRackNumber !== existingRack.rackNumber || floor !== existingRack.floor) {
        await this.updateBinLocationCodes(warehouseId, rackBins, warehouseCode, floor, newRackNumber);
      }

      return {
        success: true,
        rack: { id: rackId, ...updatedRackData },
        summary: {
          updated: true,
          totalBins: targetBinCount,
          rackName: name,
          floor: floor,
          changes: {
            binsAdded: Math.max(0, targetBinCount - currentBinCount),
            binsRemoved: Math.max(0, currentBinCount - targetBinCount),
            capacityUpdated: maxProductsPerBin !== (existingRack.maxProductsPerBin || 100),
            locationCodesUpdated: newRackNumber !== existingRack.rackNumber || floor !== existingRack.floor
          }
        }
      };

    } catch (error) {
      console.error('Error updating rack structure:', error);
      throw error;
    }
  }

  /**
   * Get rack by ID
   */
  async getRack(warehouseId, rackId) {
    try {
      return await warehouseService.getRack(warehouseId, rackId);
    } catch (error) {
      console.error('Error getting rack:', error);
      throw error;
    }
  }

  /**
   * Create additional bins when expanding rack
   */
  async createAdditionalBins(warehouseId, rackId, existingRack, rackConfig, warehouseCode) {
    const { floor, gridCount, binsPerGrid, maxProductsPerBin } = rackConfig;
    const existingBins = await warehouseService.getBins(warehouseId);
    const rackBins = existingBins.filter(bin => bin.rackId === rackId);

    // Get existing grids
    const existingGrids = [...new Set(rackBins.map(bin => bin.gridLevel || bin.shelfLevel || 1))];
    const maxExistingGrid = Math.max(...existingGrids, 0);

    for (let gridNum = 1; gridNum <= gridCount; gridNum++) {
      // Skip if this grid already exists and is complete
      const gridBins = rackBins.filter(bin => (bin.gridLevel || bin.shelfLevel) === gridNum);
      const existingBinsInGrid = gridBins.length;

      if (existingBinsInGrid >= binsPerGrid) {
        continue; // Grid is already complete
      }

      // Create missing bins in existing grids or all bins in new grids
      const startPosition = existingBinsInGrid + 1;
      
      for (let binNum = startPosition; binNum <= binsPerGrid; binNum++) {
        const locationCode = this.generateLocationCode(
          warehouseCode,
          floor,
          rackConfig.rackNumber || 1,
          gridNum,
          binNum
        );

        const binData = {
          code: locationCode,
          rackId: rackId,
          rackCode: existingRack.name,
          shelfId: `shelf_${rackId}_${gridNum}`,
          gridLevel: gridNum,
          shelfLevel: gridNum, // For backward compatibility
          position: binNum,
          capacity: maxProductsPerBin,
          currentQty: 0,
          status: 'available',
          warehouseId,
          location: {
            warehouse: warehouseCode,
            floor: floor,
            grid: gridNum,
            rack: rackConfig.rackNumber || 1,
            bin: binNum,
            fullCode: locationCode
          },
          createdAt: new Date().toISOString()
        };

        await warehouseService.createBin(warehouseId, binData);
      }
    }
  }

  /**
   * Remove excess bins when reducing rack size
   */
  async removeExcessBins(warehouseId, rackBins, targetGridCount, targetBinsPerGrid) {
    const binsToRemove = rackBins.filter(bin => {
      const gridLevel = bin.gridLevel || bin.shelfLevel || 1;
      const position = bin.position || 1;
      return gridLevel > targetGridCount || position > targetBinsPerGrid;
    });

    for (const bin of binsToRemove) {
      await warehouseService.deleteBin(warehouseId, bin.id);
    }
  }

  /**
   * Update bin capacities
   */
  async updateBinCapacities(warehouseId, rackBins, newCapacity) {
    for (const bin of rackBins) {
      if (bin.capacity !== newCapacity) {
        await warehouseService.updateBin(warehouseId, bin.id, {
          capacity: newCapacity
        });
      }
    }
  }

  /**
   * Update bin location codes when rack details change
   */
  async updateBinLocationCodes(warehouseId, rackBins, warehouseCode, floor, rackNumber) {
    for (const bin of rackBins) {
      const gridLevel = bin.gridLevel || bin.shelfLevel || 1;
      const position = bin.position || 1;
      
      const newLocationCode = this.generateLocationCode(
        warehouseCode,
        floor,
        rackNumber,
        gridLevel,
        position
      );

      if (bin.code !== newLocationCode) {
        await warehouseService.updateBin(warehouseId, bin.id, {
          code: newLocationCode,
          location: {
            warehouse: warehouseCode,
            floor: floor,
            grid: gridLevel,
            rack: rackNumber,
            bin: position,
            fullCode: newLocationCode
          }
        });
      }
    }
  }

  /**
   * Delete rack structure and all associated bins
   */
  async deleteRackStructure(warehouseId, rackId) {
    try {
      await warehouseService.deleteRack(warehouseId, rackId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting rack structure:', error);
      throw error;
    }
  }

  /**
   * Generate rack configuration summary
   */
  generateRackSummary(config) {
    const { name, floor, gridCount, binsPerGrid, maxProductsPerBin } = config;
    const totalBins = gridCount * binsPerGrid;
    const totalCapacity = totalBins * maxProductsPerBin;

    return {
      rackName: name,
      floor: floor,
      configuration: {
        grids: gridCount,
        binsPerGrid: binsPerGrid,
        totalBins: totalBins,
        capacityPerBin: maxProductsPerBin,
        totalCapacity: totalCapacity
      },
      estimatedSetupTime: `${Math.ceil(totalBins / 10)} minutes`,
      locationFormat: 'WH1-GF-R01-G01-A1 (Grid 1: A1,A2,A3... Grid 2: B1,B2,B3...)'
    };
  }

  /**
   * Get available floors for selection
   */
  getFloorOptions() {
    return [
      { value: 'GF', label: 'Ground Floor (GF)' },
      { value: 'FF', label: 'First Floor (FF)' },
      { value: 'SF', label: 'Second Floor (SF)' },
      { value: 'TF', label: 'Third Floor (TF)' },
      { value: 'B1', label: 'Basement 1 (B1)' },
      { value: 'B2', label: 'Basement 2 (B2)' }
    ];
  }

  /**
   * Validate rack configuration
   */
  validateRackConfig(config) {
    const errors = [];
    
    if (!config.name || config.name.trim() === '') {
      errors.push('Rack name is required');
    }
    
    if (!config.floor) {
      errors.push('Floor selection is required');
    }
    
    if (!config.gridCount || config.gridCount < 1) {
      errors.push('Grid count must be at least 1');
    }
    
    if (!config.binsPerGrid || config.binsPerGrid < 1) {
      errors.push('Bins per grid must be at least 1');
    }
    
    if (!config.maxProductsPerBin || config.maxProductsPerBin < 1) {
      errors.push('Max products per bin must be at least 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate rack metrics
   */
  calculateRackMetrics(bins) {
    const totalBins = bins.length;
    const occupiedBins = bins.filter(bin => bin.currentQty > 0).length;
    const emptyBins = totalBins - occupiedBins;
    const totalCapacity = bins.reduce((sum, bin) => sum + (bin.capacity || 0), 0);
    const totalUsed = bins.reduce((sum, bin) => sum + (bin.currentQty || 0), 0);
    const utilization = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

    return {
      totalBins,
      occupiedBins,
      emptyBins,
      totalCapacity,
      totalUsed,
      utilization
    };
  }

  /**
   * Generate QR code data for rack labels
   */
  generateRackQRData(rack) {
    return {
      type: 'rack',
      id: rack.id,
      code: rack.name,
      floor: rack.floor,
      location: rack.location
    };
  }

  /**
   * Generate QR code data for bin labels
   */
  generateBinQRData(bin) {
    return {
      type: 'bin',
      id: bin.id,
      code: bin.code,
      location: bin.location,
      capacity: bin.capacity
    };
  }

  /**
   * Generate bin code for compatibility (legacy method)
   * This actually generates the full location code for the bin
   * gridLevel now represents the grid number, position is the position within that grid
   */
  generateBinCode(rackCode, gridLevel, position, warehouseCode = 'WH', floor = 'GF') {
    // Extract rack number from rackCode (e.g., "R01" -> 1)
    const rackNumber = parseInt(rackCode.substring(1)) || 1;
    const gridNumber = parseInt(gridLevel) || 1;
    const binPosition = parseInt(position) || 1;
    
    return this.generateLocationCode(warehouseCode, floor, rackNumber, gridNumber, binPosition);
  }

  /**
   * Check if rack number is available
   */
  async checkRackNumberAvailability(warehouseId, rackNumber, excludeRackId = null) {
    try {
      const existingRacks = await warehouseService.getRacks(warehouseId);
      const duplicateRack = existingRacks.find(rack => 
        rack.rackNumber === rackNumber && rack.id !== excludeRackId
      );
      
      if (duplicateRack) {
        // Get suggested available numbers
        const suggestedNumbers = this.getSuggestedRackNumbers(existingRacks, 5);
        
        return {
          available: false,
          conflictRack: duplicateRack,
          suggestions: suggestedNumbers,
          message: `Row R${String(rackNumber).padStart(2, '0')} already exists in "${duplicateRack.name}"`
        };
      }
      
      return {
        available: true,
        message: `Row R${String(rackNumber).padStart(2, '0')} is available`
      };
    } catch (error) {
      console.error('Error checking rack number availability:', error);
      throw error;
    }
  }

  /**
   * Get suggested available rack numbers
   */
  getSuggestedRackNumbers(existingRacks, count = 5) {
    const existingNumbers = existingRacks.map(r => r.rackNumber || 1).sort((a, b) => a - b);
    const suggestions = [];
    
    // Find gaps in the sequence and add new numbers
    for (let i = 1; i <= Math.max(20, existingNumbers.length + count); i++) {
      if (!existingNumbers.includes(i)) {
        suggestions.push(i);
        if (suggestions.length >= count) break;
      }
    }
    
    return suggestions;
  }
}

export const rackService = new RackService();
