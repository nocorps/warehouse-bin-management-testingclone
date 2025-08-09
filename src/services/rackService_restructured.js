import { warehouseService } from './warehouseService';

export class RackService {
  /**
   * Generate location code based on the format: WH-GF-R01-G01-A1
   * WH = Warehouse, GF = Floor, R01 = Rack, G01 = Grid, A1 = Bin
   */
  generateLocationCode(warehouseCode, floor, rackNumber, gridNumber, binNumber) {
    const paddedRack = String(rackNumber).padStart(2, '0');
    const paddedGrid = String(gridNumber).padStart(2, '0');
    const binCode = this.numberToBinLetter(binNumber, gridNumber);
    
    return `${warehouseCode}-${floor}-R${paddedRack}-G${paddedGrid}-${binCode}`;
  }

  /**
   * Convert bin number to letter format based on grid
   * Grid 1: A1, B1, C1, D1... Grid 2: A2, B2, C2, D2... etc.
   */
  numberToBinLetter(binNumber, gridNumber) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letterIndex = (binNumber - 1) % letters.length;
    const letter = letters[letterIndex];
    
    return `${letter}${gridNumber}`;
  }

  /**
   * Parse location code back to components
   */
  parseLocationCode(locationCode) {
    const parts = locationCode.split('-');
    if (parts.length !== 5) return null;

    return {
      warehouse: parts[0],
      floor: parts[1],
      rack: parseInt(parts[2].substring(1)),
      grid: parseInt(parts[3].substring(1)),
      bin: parts[4]
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

      // Create the rack
      const rackCode = `R${String(rackConfig.rackNumber || 1).padStart(2, '0')}`;
      
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

        // Create bins for this grid
        for (let binNum = 1; binNum <= binsPerGrid; binNum++) {
          const locationCode = this.generateLocationCode(
            warehouseCode,
            floor,
            rackConfig.rackNumber || 1,
            gridNum,
            binNum
          );

          const binData = {
            code: locationCode,
            rackId: rack.id,
            rackCode: rack.name,
            shelfId: grid.id,
            gridLevel: gridNum,
            position: binNum,
            capacity: maxProductsPerBin,
            currentQty: 0,
            status: 'available',
            warehouseId,
            location: {
              warehouse: warehouseCode,
              floor: floor,
              grid: gridNum,
              rack: rack.rackNumber || 1,
              bin: binNum,
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
      locationFormat: 'WH-GF-R01-G01-A1'
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
   */
  generateBinCode(rackCode, gridLevel, position, warehouseCode = 'WH', floor = 'GF') {
    // Extract rack number from rackCode (e.g., "R01" -> 1)
    const rackNumber = parseInt(rackCode.substring(1)) || 1;
    const gridNumber = parseInt(gridLevel) || 1;
    const binNumber = parseInt(position) || 1;
    
    return this.generateLocationCode(warehouseCode, floor, rackNumber, gridNumber, binNumber);
  }
}

export const rackService = new RackService();
