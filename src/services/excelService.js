import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export class ExcelService {
  /**
   * Parse Excel file and extract putaway data
   */
  async parsePutawayFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first worksheet
          const worksheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[worksheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length < 2) {
            reject(new Error('Excel file must contain at least a header row and one data row'));
            return;
          }

          // Parse data - simplify to focus on barcode and quantity only
          const headers = jsonData[0].map(h => h?.toString().toLowerCase().trim());
          const barcodeIndex = this.findColumnIndex(headers, ['barcode', 'sku', 'product code', 'item code']);
          const quantityIndex = this.findColumnIndex(headers, ['quantity', 'qty', 'amount']);

          if (barcodeIndex === -1) {
            reject(new Error('Could not find barcode/SKU column. Expected headers: barcode or sku'));
            return;
          }

          if (quantityIndex === -1) {
            reject(new Error('Could not find quantity column. Expected headers: quantity or qty'));
            return;
          }

          const items = [];
          const errors = [];

          // Process data rows
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            if (!row || row.length === 0) continue; // Skip empty rows

            const barcode = row[barcodeIndex]?.toString().trim();
            const quantity = this.parseNumber(row[quantityIndex]);

            if (!barcode) {
              errors.push(`Row ${i + 1}: Missing barcode`);
              continue;
            }

            if (!quantity || quantity <= 0) {
              errors.push(`Row ${i + 1}: Invalid quantity (${row[quantityIndex]})`);
              continue;
            }

            items.push({
              rowNumber: i + 1,
              barcode,
              quantity
            });
          }

          resolve({
            items,
            errors,
            totalItems: items.length,
            totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0)
          });
          
        } catch (error) {
          reject(new Error(`Error parsing Excel file: ${error.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Parse Excel file and extract pick data
   */
  async parsePickFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first worksheet
          const worksheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[worksheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length < 2) {
            reject(new Error('Excel file must contain at least a header row and one data row'));
            return;
          }

          // Parse data - simplify to focus on barcode and quantity only
          const headers = jsonData[0].map(h => h?.toString().toLowerCase().trim());
          const barcodeIndex = this.findColumnIndex(headers, ['barcode', 'sku', 'product code', 'item code']);
          const quantityIndex = this.findColumnIndex(headers, ['quantity', 'qty', 'amount']);

          if (barcodeIndex === -1) {
            reject(new Error('Could not find barcode/SKU column. Expected headers: barcode or sku'));
            return;
          }

          if (quantityIndex === -1) {
            reject(new Error('Could not find quantity column. Expected headers: quantity or qty'));
            return;
          }

          const items = [];
          const errors = [];

          // Process data rows
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            if (!row || row.length === 0) continue; // Skip empty rows

            const barcode = row[barcodeIndex]?.toString().trim();
            const quantity = this.parseNumber(row[quantityIndex]);

            if (!barcode) {
              errors.push(`Row ${i + 1}: Missing barcode`);
              continue;
            }

            if (!quantity || quantity <= 0) {
              errors.push(`Row ${i + 1}: Invalid quantity (${row[quantityIndex]})`);
              continue;
            }

            items.push({
              rowNumber: i + 1,
              barcode,
              quantity
            });
          }

          resolve({
            items,
            errors,
            totalItems: items.length,
            totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0)
          });
          
        } catch (error) {
          reject(new Error(`Error parsing Excel file: ${error.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Generate Excel report for putaway execution
   */
  async generatePutawayReport(executionData) {
    try {
      if (!executionData || !executionData.items || !Array.isArray(executionData.items) || executionData.items.length === 0) {
        throw new Error('No valid execution data to report');
      }

      const workbook = XLSX.utils.book_new();
      
      // Only include successful items
      const successfulItems = executionData.items.filter(item => item.status === 'Completed');
      
      // Simple data with only barcode, location, quantity, and operation
      const reportData = [
        ['Barcode', 'Location', 'Quantity', 'Operation']
      ];

      successfulItems.forEach(item => {
        // Check if location contains multiple bins (comma-separated)
        const locationStr = item.location || 'N/A';
        if (locationStr.includes(',')) {
          const locations = locationStr.split(',').map(loc => loc.trim());
          
          // Split the quantities evenly across locations, with any remainder going to the first bin
          const totalQty = parseInt(item.quantity) || 0;
          const baseQtyPerBin = Math.floor(totalQty / locations.length);
          const remainder = totalQty % locations.length;
          
          // Create a row for each location with its portion of the quantity
          locations.forEach((location, index) => {
            const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
            reportData.push([
              item.barcode || '',
              location,
              binQty,
              'Put-Away'
            ]);
          });
        } else {
          // Single location, just show the total quantity
          reportData.push([
            item.barcode || '',
            locationStr,
            item.quantity || '',
            'Put-Away'
          ]);
        }
      });

      const reportSheet = XLSX.utils.aoa_to_sheet(reportData);
      XLSX.utils.book_append_sheet(workbook, reportSheet, 'Putaway Report');

      // Generate and download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `putaway-report-${new Date().getTime()}.xlsx`);
      
      return true;
    } catch (error) {
      console.error('Error generating putaway report:', error);
      throw error;
    }
  }

  /**
   * Generate Excel report for pick execution
   */
  async generatePickReport(executionData) {
    try {
      if (!executionData || !executionData.items || !Array.isArray(executionData.items) || executionData.items.length === 0) {
        throw new Error('No valid execution data to report');
      }

      const workbook = XLSX.utils.book_new();
      
      // Only include successful items
      const successfulItems = executionData.items.filter(item => item.status === 'Completed');
      
      // Simple data with only barcode, location, quantity, and operation
      const reportData = [
        ['Barcode', 'Location', 'Quantity', 'Operation']
      ];

      successfulItems.forEach(item => {
        // Get the barcode/sku
        const barcode = item.barcode || item.sku || 'N/A';
        
        // Get the total quantity
        const totalQty = parseInt(item.pickedQty || item.pickedQuantity || item.quantity) || 0;
        
        // Determine the locations - could be from various fields depending on the structure
        let locations = [];
        if (Array.isArray(item.pickedBins) && item.pickedBins.length > 0) {
          // If we have detailed picked bins info with quantities
          item.pickedBins.forEach(bin => {
            // Construct full location path from bin info if available
            let fullLocation = bin.location || '';
            if (!fullLocation && (bin.code || bin.binCode)) {
              // Try to construct a full location path
              const warehouseCode = item.warehouseCode || executionData.warehouseCode || 'WH01';
              const floorCode = bin.floorCode || 'GF';
              const rackCode = bin.rackCode || item.rackCode || 'R01';
              const gridCode = bin.gridCode || bin.shelfLevel || 'G01';
              const binCode = bin.code || bin.binCode || 'A1';
              
              fullLocation = `${warehouseCode}-${floorCode}-${rackCode}-${gridCode}-${binCode}`;
            }
            
            reportData.push([
              barcode,
              fullLocation || (bin.code || bin.binCode || 'N/A'),
              bin.quantity || bin.pickedQuantity || 'N/A',
              'Pick'
            ]);
          });
        } else if (Array.isArray(item.sourceBins) && item.sourceBins.length > 0) {
          // Check if sourceBins have full location info
          item.sourceBins.forEach(bin => {
            // If it's just a string, it might be just the bin code
            let fullLocation = typeof bin === 'string' ? bin : (bin.location || bin.code || '');
            
            // If it looks like just a bin code (simple string without dashes), try to construct full path
            if (fullLocation && !fullLocation.includes('-') && fullLocation.length <= 3) {
              const warehouseCode = item.warehouseCode || executionData.warehouseCode || 'WH01';
              const floorCode = bin.floorCode || item.floorCode || 'GF';
              const rackCode = bin.rackCode || item.rackCode || 'R01';
              const gridCode = bin.gridCode || bin.shelfLevel || item.gridCode || 'G01';
              
              fullLocation = `${warehouseCode}-${floorCode}-${rackCode}-${gridCode}-${fullLocation}`;
            }
            
            locations.push(fullLocation);
          });
        } else {
          // Check if it's a comma-separated list
          const locationStr = item.location || item.locations || 'N/A';
          if (typeof locationStr === 'string' && locationStr.includes(',')) {
            const splitLocations = locationStr.split(',').map(loc => loc.trim());
            
            // Check if these look like full locations or just bin codes
            splitLocations.forEach(loc => {
              // If it looks like just a bin code (simple string without dashes), try to construct full path
              if (loc && !loc.includes('-') && loc.length <= 3) {
                const warehouseCode = item.warehouseCode || executionData.warehouseCode || 'WH01';
                const floorCode = item.floorCode || 'GF';
                const rackCode = item.rackCode || 'R01';
                const gridCode = item.gridCode || 'G01';
                
                locations.push(`${warehouseCode}-${floorCode}-${rackCode}-${gridCode}-${loc}`);
              } else {
                locations.push(loc);
              }
            });
          } else {
            // Single location string
            let location = locationStr;
            
            // If it looks like just a bin code (simple string without dashes), try to construct full path
            if (location && !location.includes('-') && location.length <= 3) {
              const warehouseCode = item.warehouseCode || executionData.warehouseCode || 'WH01';
              const floorCode = item.floorCode || 'GF';
              const rackCode = item.rackCode || 'R01';
              const gridCode = item.gridCode || 'G01';
              
              location = `${warehouseCode}-${floorCode}-${rackCode}-${gridCode}-${location}`;
            }
            
            locations = [location];
          }
        }
        
        // If we have multiple locations but no detailed quantities, split them evenly
        if (locations.length > 1 && !Array.isArray(item.pickedBins)) {
          const baseQtyPerBin = Math.floor(totalQty / locations.length);
          const remainder = totalQty % locations.length;
          
          // Then add individual location rows
          locations.forEach((location, index) => {
            const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
            reportData.push([
              barcode,
              location,
              binQty,
              'Pick'
            ]);
          });
        } else if (locations.length === 1 && !Array.isArray(item.pickedBins)) {
          // Single location, show the total quantity
          reportData.push([
            barcode,
            locations[0],
            totalQty,
            'Pick'
          ]);
        }
      });

      const reportSheet = XLSX.utils.aoa_to_sheet(reportData);
      XLSX.utils.book_append_sheet(workbook, reportSheet, 'Pick Report');

      // Generate and download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `pick-report-${new Date().getTime()}.xlsx`);
      
      return true;
    } catch (error) {
      console.error('Error generating pick report:', error);
      throw error;
    }
  }

  /**
   * Find column index by possible header names
   */
  findColumnIndex(headers, possibleNames) {
    for (const name of possibleNames) {
      const index = headers.findIndex(header => 
        header && header.includes(name.toLowerCase())
      );
      if (index !== -1) return index;
    }
    return -1;
  }

  /**
   * Parse number from cell value
   */
  parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  /**
   * Parse date from cell value
   */
  parseDate(value) {
    if (!value) return null;
    
    // Try to parse as Excel date
    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        return new Date(date.y, date.m - 1, date.d).toISOString().split('T')[0];
      }
    }
    
    // Try to parse as string
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    return null;
  }

  /**
   * Validate Excel file
   */
  validateFile(file) {
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!validTypes.includes(file.type)) {
      throw new Error('Please upload a valid Excel file (.xls or .xlsx)');
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('File size must be less than 10MB');
    }
    
    return true;
  }

  /**
   * Generate sample Excel template for putaway
   */
  async generatePutawayTemplate() {
    const workbook = XLSX.utils.book_new();
    
    const templateData = [
      ['Barcode', 'Quantity'],
      ['SKU001', 100],
      ['SKU002', 50],
      ['SKU003', 75]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Putaway Template');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'putaway-template.xlsx');
  }

  /**
   * Generate sample Excel template for pick
   */
  async generatePickTemplate() {
    const workbook = XLSX.utils.book_new();
    
    const templateData = [
      ['Barcode', 'Quantity'],
      ['SKU001', 10],
      ['SKU002', 25],
      ['SKU003', 5]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pick Template');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'pick-template.xlsx');
  }
}

export const excelService = new ExcelService();
