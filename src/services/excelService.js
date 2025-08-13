import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export class ExcelService {
  /**
   * Sort locations in warehouse order (R01-G01-A1, R01-G01-B1, R01-G01-C1, R01-G01-A2, etc.)
   */
  sortLocationData(reportData) {
    // Keep header row separate
    const header = reportData[0];
    const dataRows = reportData.slice(1);
    
    // Sort data rows by location
    dataRows.sort((a, b) => {
      const locationA = a[1] || ''; // Location is in column index 1
      const locationB = b[1] || '';
      return this.compareLocations(locationA, locationB);
    });
    
    return [header, ...dataRows];
  }

  /**
   * Compare two location strings for sorting
   */
  compareLocations(locA, locB) {
    // Handle empty/invalid locations
    if (!locA || locA === 'N/A') return 1;
    if (!locB || locB === 'N/A') return -1;
    
    // Parse location components
    const partsA = this.parseLocationParts(locA);
    const partsB = this.parseLocationParts(locB);
    
    // Compare each component in order: row, grid, shelf
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || '';
      const partB = partsB[i] || '';
      
      if (partA !== partB) {
        // Special handling for the last component (shelf like A1, B1, C1, etc.)
        if (i === partsA.length - 1 || i === partsB.length - 1) {
          return this.compareShelfCodes(partA, partB);
        }
        
        // For other components, try numeric comparison first
        const numA = this.extractNumber(partA);
        const numB = this.extractNumber(partB);
        
        if (numA !== null && numB !== null) {
          return numA - numB;
        }
        
        return partA.localeCompare(partB);
      }
    }
    
    return 0;
  }

  /**
   * Compare shelf codes in warehouse order (A1, B1, C1, D1, E1, F1, A2, B2, C2, etc.)
   */
  compareShelfCodes(shelfA, shelfB) {
    // Extract letter and number from shelf codes
    const parseShelf = (shelf) => {
      const match = shelf.match(/^([A-Z])(\d+)$/);
      if (match) {
        return {
          letter: match[1],
          number: parseInt(match[2])
        };
      }
      return { letter: shelf, number: 0 };
    };

    const parsedA = parseShelf(shelfA);
    const parsedB = parseShelf(shelfB);

    // First compare by number (level), then by letter (shelf)
    if (parsedA.number !== parsedB.number) {
      return parsedA.number - parsedB.number;
    }

    // Same level, compare by letter
    return parsedA.letter.localeCompare(parsedB.letter);
  }

  /**
   * Parse location string into components for sorting
   */
  parseLocationParts(location) {
    // Clean and standardize location format
    let cleanLocation = location.trim();
    
    // Remove warehouse prefix if present (WH1-, WH01-, etc.)
    cleanLocation = cleanLocation.replace(/^WH\d*-/, '');
    
    // Remove ground floor prefix if present
    cleanLocation = cleanLocation.replace(/^GF-/, '');
    
    // Split by dash and filter out empty parts
    const parts = cleanLocation.split('-').filter(part => part.length > 0);
    
    return parts;
  }

  /**
   * Extract numeric value from a string for comparison
   */
  extractNumber(str) {
    const match = str.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

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

      // Sort the report data by location
      const sortedReportData = this.sortLocationData(reportData);

      const reportSheet = XLSX.utils.aoa_to_sheet(sortedReportData);
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

      // Sort the report data by location
      const sortedReportData = this.sortLocationData(reportData);

      const reportSheet = XLSX.utils.aoa_to_sheet(sortedReportData);
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
   * Generate Excel report for inventory
   */
  async generateInventoryReport(reportData) {
    try {
      if (!reportData || !reportData.data || !reportData.data.inventory || !Array.isArray(reportData.data.inventory) || reportData.data.inventory.length === 0) {
        throw new Error('No valid inventory data to report');
      }

      const workbook = XLSX.utils.book_new();
      
      // Simple data with only barcode, location, quantity, and status
      const reportRows = [
        ['Barcode', 'Location', 'Quantity', 'Status']
      ];

      // Each inventory item is already a single bin record
      reportData.data.inventory.forEach(item => {
        reportRows.push([
          item.barcode || item.sku || '',
          item.location || item.binCode || '',
          item.quantity || 0,
          item.status || 'Current Stock'
        ]);
      });

      // Sort the report data by location
      const sortedReportRows = this.sortLocationData(reportRows);

      const reportSheet = XLSX.utils.aoa_to_sheet(sortedReportRows);
      XLSX.utils.book_append_sheet(workbook, reportSheet, 'Inventory Report');

      // Generate and download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `inventory-report-${new Date().getTime()}.xlsx`);
      
      return true;
    } catch (error) {
      console.error('Error generating inventory report:', error);
      throw error;
    }
  }

  /**
   * Generate print-friendly HTML report for putaway execution
   */
  generatePutawayPrintReport(executionData) {
    try {
      if (!executionData || !executionData.items || !Array.isArray(executionData.items) || executionData.items.length === 0) {
        throw new Error('No valid execution data to report');
      }

      // Only include successful items
      const successfulItems = executionData.items.filter(item => item.status === 'Completed');
      
      // Build report data
      const reportData = [
        ['Barcode', 'Location', 'Quantity', 'Operation']
      ];

      successfulItems.forEach(item => {
        if (item.allocationPlan && Array.isArray(item.allocationPlan)) {
          item.allocationPlan.forEach(allocation => {
            reportData.push([
              item.barcode || '',
              allocation.binLocation || allocation.binCode,
              allocation.allocatedQuantity,
              'Put-Away'
            ]);
          });
        } else {
          const locationStr = item.location || 'N/A';
          if (locationStr.includes(',')) {
            const locations = locationStr.split(',').map(loc => loc.trim());
            const totalQty = parseInt(item.quantity) || 0;
            const baseQtyPerBin = Math.floor(totalQty / locations.length);
            const remainder = totalQty % locations.length;
            
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
            reportData.push([
              item.barcode || '',
              locationStr,
              item.quantity || '',
              'Put-Away'
            ]);
          }
        }
      });

      // Sort the report data by location
      const sortedReportData = this.sortLocationData(reportData);

      // Generate HTML for printing
      return this.generatePrintHTML('Putaway Report', sortedReportData, new Date().toLocaleDateString());
    } catch (error) {
      console.error('Error generating putaway print report:', error);
      throw error;
    }
  }

  /**
   * Generate print-friendly HTML report for pick execution
   */
  generatePickPrintReport(executionData) {
    try {
      if (!executionData || !executionData.items || !Array.isArray(executionData.items) || executionData.items.length === 0) {
        throw new Error('No valid execution data to report');
      }

      // Only include successful items
      const successfulItems = executionData.items.filter(item => item.status === 'Completed');
      
      // Build report data
      const reportData = [
        ['Barcode', 'Location', 'Quantity', 'Operation']
      ];

      successfulItems.forEach(item => {
        const hasBinDetails = item.pickedBins && Array.isArray(item.pickedBins) && item.pickedBins.length > 0;
        const totalQty = parseInt(item.pickedQty || item.pickedQuantity || item.quantity) || 0;
        
        if (hasBinDetails) {
          item.pickedBins.forEach(bin => {
            let locationStr = bin.binCode || '';
            
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
        } else {
          let locationStr = item.location || item.locations || 'N/A';
          
          if (locationStr !== 'N/A') {
            const rawLocations = locationStr.split(',').map(loc => loc.trim());
            const cleanedLocations = rawLocations.map(loc => {
              if (loc.includes('Row') && loc.includes('WH01') && loc.includes('WH1')) {
                const wh1Index = loc.indexOf('WH1-');
                if (wh1Index > 0) {
                  return loc.substring(wh1Index);
                }
              }
              
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
          
          if (locationStr.includes(',')) {
            const locations = locationStr.split(',').map(loc => loc.trim());
            const baseQtyPerBin = Math.floor(totalQty / locations.length);
            const remainder = totalQty % locations.length;
            
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
            reportData.push([
              item.barcode || item.sku || '',
              locationStr,
              totalQty,
              'Pick'
            ]);
          }
        }
      });

      // Sort the report data by location
      const sortedReportData = this.sortLocationData(reportData);

      // Generate HTML for printing
      return this.generatePrintHTML('Pick Report', sortedReportData, new Date().toLocaleDateString());
    } catch (error) {
      console.error('Error generating pick print report:', error);
      throw error;
    }
  }

  /**
   * Generate print-friendly HTML report for inventory
   */
  generateInventoryPrintReport(reportData) {
    try {
      if (!reportData || !reportData.data || !reportData.data.inventory || !Array.isArray(reportData.data.inventory) || reportData.data.inventory.length === 0) {
        throw new Error('No valid inventory data to report');
      }

      // Build report data
      const reportRows = [
        ['Barcode', 'Location', 'Quantity', 'Status']
      ];

      reportData.data.inventory.forEach(item => {
        reportRows.push([
          item.barcode || item.sku || '',
          item.location || item.binCode || '',
          item.quantity || 0,
          item.status || 'Current Stock'
        ]);
      });

      // Sort the report data by location
      const sortedReportRows = this.sortLocationData(reportRows);

      // Generate HTML for printing
      return this.generatePrintHTML('Inventory Report', sortedReportRows, new Date().toLocaleDateString());
    } catch (error) {
      console.error('Error generating inventory print report:', error);
      throw error;
    }
  }

  /**
   * Generate HTML content for printing
   */
  generatePrintHTML(title, reportData, date) {
    const header = reportData[0];
    const dataRows = reportData.slice(1);

    // Calculate summary statistics
    const totalRecords = dataRows.length;
    const totalQuantity = dataRows.reduce((sum, row) => sum + (parseInt(row[2]) || 0), 0);
    
    // Group by SKU/Barcode to show unique items and their total quantities
    const skuSummary = {};
    dataRows.forEach(row => {
      const barcode = row[0] || 'Unknown';
      const quantity = parseInt(row[2]) || 0;
      
      if (!skuSummary[barcode]) {
        skuSummary[barcode] = {
          totalQuantity: 0,
          locations: new Set()
        };
      }
      
      skuSummary[barcode].totalQuantity += quantity;
      skuSummary[barcode].locations.add(row[1]);
    });
    
    const uniqueItems = Object.keys(skuSummary).length;
    const totalLocations = new Set(dataRows.map(row => row[1])).size;

    let html = `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        @media print {
            body { margin: 0; }
            @page { margin: 0.5in; }
        }
        body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.3;
        }
        .report-header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        .report-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .report-date {
            font-size: 14px;
            color: #666;
        }
        .report-summary {
            margin-bottom: 20px;
            padding: 15px;
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 5px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 15px;
        }
        .summary-item {
            padding: 10px;
            background-color: white;
            border-left: 4px solid #007bff;
            border-radius: 3px;
        }
        .summary-label {
            font-size: 11px;
            color: #6c757d;
            text-transform: uppercase;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .summary-value {
            font-size: 18px;
            font-weight: bold;
            color: #495057;
        }
        .sku-summary {
            margin-top: 15px;
            border-top: 1px solid #dee2e6;
            padding-top: 15px;
        }
        .sku-summary-title {
            font-weight: bold;
            margin-bottom: 10px;
            color: #495057;
        }
        .sku-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 8px;
        }
        .sku-item {
            font-size: 11px;
            padding: 5px 8px;
            background-color: #e9ecef;
            border-radius: 3px;
            display: flex;
            justify-content: space-between;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #333;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .location-cell {
            font-weight: bold;
            color: #007bff;
        }
        .quantity-cell {
            text-align: right;
            font-weight: bold;
        }
        .operation-cell {
            text-align: center;
            font-weight: bold;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 10px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <div class="report-header">
        <div class="report-title">${title}</div>
        <div class="report-date">Generated on: ${date}</div>
    </div>
    
    <div class="report-summary">
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-label">Total Records</div>
                <div class="summary-value">${totalRecords}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Total Quantity</div>
                <div class="summary-value">${totalQuantity}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Unique Items</div>
                <div class="summary-value">${uniqueItems}</div>
            </div>
            <div class="summary-item">
                <div class="summary-label">Locations Used</div>
                <div class="summary-value">${totalLocations}</div>
            </div>
        </div>
        
        <div class="sku-summary">
            <div class="sku-summary-title">Item Summary:</div>
            <div class="sku-list">`;

    // Add SKU summary
    Object.entries(skuSummary).forEach(([barcode, data]) => {
        html += `
                <div class="sku-item">
                    <span>${barcode}</span>
                    <span><strong>${data.totalQuantity}</strong> units</span>
                </div>`;
    });

    html += `
            </div>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>`;

    // Add header cells
    header.forEach(headerCell => {
        html += `<th>${headerCell}</th>`;
    });

    html += `
            </tr>
        </thead>
        <tbody>`;

    // Add data rows
    dataRows.forEach(row => {
        html += '<tr>';
        row.forEach((cell, index) => {
            let cellClass = '';
            if (index === 1) cellClass = 'location-cell'; // Location column
            else if (index === 2) cellClass = 'quantity-cell'; // Quantity column
            else if (index === 3) cellClass = 'operation-cell'; // Operation column
            
            html += `<td class="${cellClass}">${cell}</td>`;
        });
        html += '</tr>';
    });

    html += `
        </tbody>
    </table>
    
    <div class="footer">
        Warehouse Management System - ${title}
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Open print preview for a report
   */
  printReport(htmlContent) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.print();
    };
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
