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
        // Check if we have actual allocation details (new format)
        if (item.allocationPlan && Array.isArray(item.allocationPlan)) {
          // Use actual allocation details - this is the accurate approach
          item.allocationPlan.forEach(allocation => {
            reportData.push([
              item.barcode || '',
              allocation.binLocation || allocation.binCode,
              allocation.allocatedQuantity,
              'Put-Away'
            ]);
          });
        } else {
          // Legacy format - fall back to old logic (less accurate)
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
        // Get the original quantities from the pickedBins array if available
        const hasBinDetails = item.pickedBins && Array.isArray(item.pickedBins) && item.pickedBins.length > 0;
        const totalQty = parseInt(item.pickedQty || item.pickedQuantity || item.quantity) || 0;
        
        if (hasBinDetails) {
          // Use the detailed bin information to create precise report rows
          item.pickedBins.forEach(bin => {
            // Get the bin location and clean it
            let locationStr = bin.binCode || '';
            
            // Apply location cleaning to each bin code
            if (locationStr.includes('Row') && locationStr.includes('WH01') && locationStr.includes('WH1')) {
              const wh1Index = locationStr.indexOf('WH1-');
              if (wh1Index > 0) {
                locationStr = locationStr.substring(wh1Index);
              }
            }
            
            reportData.push([
              item.barcode || item.sku || '',
              locationStr,
              bin.quantity || 0,
              'Pick'
            ]);
          });
        } 
        else {
          // Process locations from comma-separated string
          let locationStr = item.location || item.locations || 'N/A';
          
          // Clean location string (remove duplicates and extra formatting)
          if (locationStr !== 'N/A') {
            // Split by comma first, then clean each location
            const rawLocations = locationStr.split(',').map(loc => loc.trim());
            const cleanedLocations = rawLocations.map(loc => {
              // Clean location format: "WH01-GF-Row 1-G01-WH1-GF-R01-G01-B1" -> "WH1-GF-R01-G01-B1"
              if (loc.includes('Row') && loc.includes('WH01') && loc.includes('WH1')) {
                const wh1Index = loc.indexOf('WH1-');
                if (wh1Index > 0) {
                  return loc.substring(wh1Index);
                }
              }
              
              // More general pattern handling
              const parts = loc.split('-');
              const whIndices = [];
              for (let i = 0; i < parts.length; i++) {
                if (parts[i].match(/^WH\d+$/)) {
                  whIndices.push(i);
                }
              }
              
              if (whIndices.length > 1) {
                const lastWhIndex = whIndices[whIndices.length - 1];
                return parts.slice(lastWhIndex).join('-');
              }
              
              return loc;
            });
            locationStr = cleanedLocations.join(', ');
          }
          
          // Check if location contains multiple bins (comma-separated)
          if (locationStr.includes(',')) {
            const locations = locationStr.split(',').map(loc => loc.trim());
            
            // Split the quantities evenly across locations (since we don't have individual bin quantities)
            const baseQtyPerBin = Math.floor(totalQty / locations.length);
            const remainder = totalQty % locations.length;
            
            // Create a row for each location with its portion of the quantity
            locations.forEach((location, index) => {
              const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
              reportData.push([
                item.barcode || item.sku || '',
                location,
                binQty,
                'Pick'
              ]);
            });
          } else {
            // Single location, just show the total quantity
            reportData.push([
              item.barcode || item.sku || '',
              locationStr,
              totalQty,
              'Pick'
            ]);
          }
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
