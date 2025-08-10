import QRCode from 'qrcode';

export class PrintService {
  constructor() {
    this.defaultSettings = {
      labelSize: 'small', // small, medium, large
      density: 'high',
      orientation: 'portrait',
      margin: 5,
    };
  }

  /**
   * Generate QR code as data URL
   */
  async generateQRCode(data, options = {}) {
    const qrOptions = {
      width: options.size || 200,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF',
      },
      errorCorrectionLevel: options.errorCorrection || 'M',
    };

    try {
      return await QRCode.toDataURL(data, qrOptions);
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Print bin labels with QR codes
   */
  async printBinLabels(bins, options = {}) {
    const {
      includeQR = true,
      includeCapacity = true,
      includeLocation = true,
      labelSize = 'medium',
    } = options;

    try {
      // Generate HTML for printing
      const html = await this.generateBinLabelsHTML(bins, {
        includeQR,
        includeCapacity,
        includeLocation,
        labelSize,
      });

      // Open print window
      this.openPrintWindow(html, 'Bin Labels');
    } catch (error) {
      console.error('Error printing bin labels:', error);
      throw error;
    }
  }

  /**
   * Print rack configuration summary
   */
  async printRackSummary(rack, shelves, bins, options = {}) {
    try {
      const html = await this.generateRackSummaryHTML(rack, shelves, bins, options);
      this.openPrintWindow(html, `Rack ${rack.code} Summary`);
    } catch (error) {
      console.error('Error printing rack summary:', error);
      throw error;
    }
  }

  /**
   * Print pick list
   */
  async printPickList(pickTask, options = {}) {
    const {
      includeCheckboxes = true,
      includeBarcode = true,
      groupByLocation = true,
    } = options;

    try {
      const html = await this.generatePickListHTML(pickTask, {
        includeCheckboxes,
        includeBarcode,
        groupByLocation,
      });

      this.openPrintWindow(html, `Pick List - ${pickTask.orderNumber}`);
    } catch (error) {
      console.error('Error printing pick list:', error);
      throw error;
    }
  }

  /**
   * Print put-away task list
   */
  async printPutAwayList(tasks, options = {}) {
    try {
      const html = await this.generatePutAwayListHTML(tasks, options);
      this.openPrintWindow(html, 'Put-Away Tasks');
    } catch (error) {
      console.error('Error printing put-away list:', error);
      throw error;
    }
  }

  /**
   * Print put-away execution report
   */
  async printPutAwayReport(executionResults, options = {}) {
    try {
      const html = await this.generatePutAwayReportHTML(executionResults, options);
      this.openPrintWindow(html, 'Put-Away Execution Report');
    } catch (error) {
      console.error('Error printing put-away report:', error);
      throw error;
    }
  }

  /**
   * Print pick execution report
   */
  async printPickReport(executionResults, options = {}) {
    try {
      const html = await this.generatePickReportHTML(executionResults, options);
      this.openPrintWindow(html, 'Pick Execution Report');
    } catch (error) {
      console.error('Error printing pick report:', error);
      throw error;
    }
  }

  /**
   * Print stock movement report
   */
  async printStockMovementReport(reportData, options = {}) {
    try {
      const html = await this.generateStockMovementReportHTML(reportData, options);
      this.openPrintWindow(html, 'Stock Movement Report');
    } catch (error) {
      console.error('Error printing stock movement report:', error);
      throw error;
    }
  }

  /**
   * Generate HTML for bin labels
   */
  async generateBinLabelsHTML(bins, options) {
    const { includeQR, includeCapacity, includeLocation, labelSize } = options;
    
    let labelsHTML = '';
    
    for (const bin of bins) {
      const qrDataURL = includeQR 
        ? await this.generateQRCode(this.generateBinQRData(bin), { size: 100 })
        : null;

      labelsHTML += `
        <div class="bin-label ${labelSize}">
          <div class="label-header">
            <h3>${bin.code}</h3>
          </div>
          
          <div class="label-content">
            ${qrDataURL ? `<img src="${qrDataURL}" alt="QR Code" class="qr-code" />` : ''}
            
            <div class="label-info">
              <div class="rack-info">Rack: ${bin.rackCode}</div>
              <div class="shelf-info">Grid: ${bin.shelfLevel}</div>
              <div class="position-info">Position: ${bin.position}</div>
              
              ${includeCapacity ? `<div class="capacity-info">Capacity: ${bin.capacity}</div>` : ''}
              
              ${includeLocation && bin.location ? `
                <div class="location-info">
                  ${bin.location.aisle ? `Aisle: ${bin.location.aisle}` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    return this.wrapInPrintTemplate(labelsHTML, 'Bin Labels', this.getBinLabelStyles(labelSize));
  }

  /**
   * Generate HTML for rack summary
   */
  async generateRackSummaryHTML(rack, shelves, bins) {
    const qrDataURL = await this.generateQRCode(this.generateRackQRData(rack), { size: 150 });
    
    const occupiedBins = bins.filter(bin => bin.currentQty > 0).length;
    const utilization = bins.length > 0 ? ((occupiedBins / bins.length) * 100).toFixed(1) : 0;

    const html = `
      <div class="rack-summary">
        <div class="summary-header">
          <h2>Rack Configuration Summary</h2>
          <div class="rack-qr">
            <img src="${qrDataURL}" alt="Rack QR Code" />
          </div>
        </div>
        
        <div class="rack-details">
          <h3>Rack Information</h3>
          <table class="info-table">
            <tr><td>Rack Code:</td><td><strong>${rack.code}</strong></td></tr>
            <tr><td>Name:</td><td>${rack.name}</td></tr>
            <tr><td>Zone:</td><td>${rack.zoneId || 'N/A'}</td></tr>
            <tr><td>Created:</td><td>${new Date(rack.createdAt?.toDate?.() || rack.createdAt).toLocaleDateString()}</td></tr>
          </table>
        </div>

        <div class="rack-configuration">
          <h3>Configuration</h3>
          <table class="info-table">
            <tr><td>Grids:</td><td>${rack.shelfCount}</td></tr>
            <tr><td>Bins per Grid:</td><td>${rack.binsPerShelf}</td></tr>
            <tr><td>Total Bins:</td><td>${bins.length}</td></tr>
            <tr><td>Max Products per Bin:</td><td>${rack.maxProductsPerBin}</td></tr>
          </table>
        </div>

        <div class="rack-utilization">
          <h3>Current Utilization</h3>
          <table class="info-table">
            <tr><td>Occupied Bins:</td><td>${occupiedBins}</td></tr>
            <tr><td>Available Bins:</td><td>${bins.length - occupiedBins}</td></tr>
            <tr><td>Utilization:</td><td>${utilization}%</td></tr>
          </table>
        </div>

        <div class="bin-grid">
          <h3>Bin Layout</h3>
          ${this.generateBinGridHTML(rack, bins)}
        </div>
      </div>
    `;

    return this.wrapInPrintTemplate(html, `Rack ${rack.code} Summary`, this.getRackSummaryStyles());
  }

  /**
   * Generate HTML for pick list
   */
  async generatePickListHTML(pickTask, options) {
    const { includeCheckboxes, includeBarcode, groupByLocation } = options;
    
    let itemsHTML = '';
    
    if (groupByLocation) {
      // Group items by rack and grid for optimized picking
      const groupedItems = this.groupItemsByLocation(pickTask.items);
      
      for (const [location, items] of Object.entries(groupedItems)) {
        itemsHTML += `
          <div class="location-group">
            <h4>Location: ${location}</h4>
            ${await this.generatePickItemsHTML(items, { includeCheckboxes, includeBarcode })}
          </div>
        `;
      }
    } else {
      itemsHTML = await this.generatePickItemsHTML(pickTask.items, { includeCheckboxes, includeBarcode });
    }

    const html = `
      <div class="pick-list">
        <div class="pick-header">
          <h2>Pick List</h2>
          <div class="order-info">
            <p><strong>Order:</strong> ${pickTask.orderNumber}</p>
            <p><strong>Priority:</strong> ${pickTask.priority.toUpperCase()}</p>
            <p><strong>Created:</strong> ${new Date(pickTask.createdAt?.toDate?.() || pickTask.createdAt).toLocaleString()}</p>
            <p><strong>Assigned to:</strong> ${pickTask.assignedTo || 'Unassigned'}</p>
          </div>
        </div>

        <div class="pick-instructions">
          <h3>Picking Instructions</h3>
          <ol>
            <li>Follow the locations in order for optimal route</li>
            <li>Scan each bin before picking</li>
            <li>Verify product SKU and quantity</li>
            <li>Check expiry dates for perishable items</li>
            <li>Check off each item when completed</li>
          </ol>
        </div>

        <div class="pick-items">
          ${itemsHTML}
        </div>

        <div class="pick-footer">
          <div class="signature-section">
            <p>Picker Signature: _________________________ Date: _____________</p>
            <p>Checker Signature: ________________________ Date: _____________</p>
          </div>
        </div>
      </div>
    `;

    return this.wrapInPrintTemplate(html, `Pick List - ${pickTask.orderNumber}`, this.getPickListStyles());
  }

  /**
   * Generate HTML for put-away task list
   */
  async generatePutAwayListHTML(tasks, options) {
    let tasksHTML = '';

    for (const task of tasks) {
      tasksHTML += `
        <div class="putaway-task">
          <div class="task-header">
            <h4>Task ${task.id}</h4>
            <span class="priority ${task.priority}">${task.priority.toUpperCase()}</span>
          </div>
          
          <table class="task-table">
            <tr>
              <td><strong>SKU:</strong></td>
              <td>${task.sku}</td>
              <td><strong>Quantity:</strong></td>
              <td>${task.quantity}</td>
            </tr>
            <tr>
              <td><strong>Lot Number:</strong></td>
              <td>${task.lotNumber || 'N/A'}</td>
              <td><strong>Expiry Date:</strong></td>
              <td>${task.expiryDate || 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Suggested Bin:</strong></td>
              <td>${task.suggestedBinCode || 'N/A'}</td>
              <td><strong>Status:</strong></td>
              <td>${task.status}</td>
            </tr>
          </table>
          
          <div class="task-notes">
            <strong>Notes:</strong> ${task.notes || 'None'}
          </div>
          
          <div class="task-completion">
            <label>
              <input type="checkbox" /> Task Completed
            </label>
            <span>Actual Bin: _______________</span>
          </div>
        </div>
      `;
    }

    const html = `
      <div class="putaway-list">
        <div class="list-header">
          <h2>Put-Away Task List</h2>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Total Tasks:</strong> ${tasks.length}</p>
        </div>

        <div class="tasks">
          ${tasksHTML}
        </div>

        <div class="completion-summary">
          <h3>Completion Summary</h3>
          <p>Operator: _________________________ Date: _____________</p>
          <p>Supervisor: _______________________ Date: _____________</p>
        </div>
      </div>
    `;

    return this.wrapInPrintTemplate(html, 'Put-Away Tasks', this.getPutAwayListStyles());
  }

  /**
   * Generate HTML for put-away execution report
   */
  async generatePutAwayReportHTML(executionResults, options = {}) {
    const { includeDetails = true, includeFailures = true, includeStats = true } = options;
    
    const successfulItems = executionResults.items.filter(item => item.status === 'Completed');
    const failedItems = executionResults.items.filter(item => item.status === 'Failed');
    
    let reportHTML = `
      <div class="putaway-report">
        <div class="report-header">
          <h1>Put-Away Execution Report</h1>
          <div class="warehouse-info">
            <p><strong>Warehouse:</strong> ${executionResults.summary.warehouse}</p>
            <p><strong>Execution Date:</strong> ${new Date(executionResults.summary.executedAt).toLocaleString()}</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>

        ${includeStats ? `
        <div class="summary-stats">
          <h2>Execution Summary</h2>
          <table class="stats-table">
            <tr><td><strong>Total Items:</strong></td><td>${executionResults.summary.total}</td></tr>
            <tr><td><strong>Successful:</strong></td><td>${executionResults.summary.successful}</td></tr>
            <tr><td><strong>Failed:</strong></td><td>${executionResults.summary.failed}</td></tr>
            <tr><td><strong>Success Rate:</strong></td><td>${((executionResults.summary.successful / executionResults.summary.total) * 100).toFixed(1)}%</td></tr>
            <tr><td><strong>Overflow Handled:</strong></td><td>${executionResults.summary.overflowHandled || 0}</td></tr>
            <tr><td><strong>Total Bins Used:</strong></td><td>${executionResults.summary.totalBinsUsed || 0}</td></tr>
            <tr><td><strong>Total Quantity Allocated:</strong></td><td>${executionResults.summary.totalQuantityAllocated || 0}</td></tr>
          </table>
        </div>
        ` : ''}

        ${includeDetails && successfulItems.length > 0 ? `
        <div class="successful-items">
          <h2>Successfully Processed Items (${successfulItems.length})</h2>
          <table class="items-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Quantity</th>
                <th>Location(s)</th>
                <th>Bins Used</th>
                <th>Efficiency</th>
              </tr>
            </thead>
            <tbody>
              ${successfulItems.map(item => `
                <tr>
                  <td>${item.barcode}</td>
                  <td>${item.quantity}</td>
                  <td>${item.location || 'N/A'}</td>
                  <td>${item.binCount || 1}</td>
                  <td>${item.efficiency || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${includeFailures && failedItems.length > 0 ? `
        <div class="failed-items">
          <h2>Failed Items (${failedItems.length})</h2>
          <table class="items-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Quantity</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${failedItems.map(item => `
                <tr>
                  <td>${item.barcode}</td>
                  <td>${item.quantity}</td>
                  <td class="error-text">${item.error || 'Unknown error'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="report-footer">
          <p>This report was generated automatically by the Warehouse Management System</p>
          <p>For questions or issues, please contact your warehouse administrator</p>
        </div>
      </div>
    `;

    return this.wrapInPrintTemplate(reportHTML, 'Put-Away Execution Report', this.getPutAwayReportStyles());
  }

  /**
   * Generate HTML for pick execution report
   */
  async generatePickReportHTML(executionResults, options = {}) {
    const { includeDetails = true, includeFailures = true, includeStats = true } = options;
    
    const successfulItems = executionResults.items.filter(item => item.status === 'Completed');
    const failedItems = executionResults.items.filter(item => item.status === 'Failed');
    
    // Generate simplified report data (matching Excel report format)
    const reportRows = [];
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
          
          reportRows.push({
            barcode: item.barcode || item.sku || '',
            location: locationStr,
            quantity: bin.quantity || 0,
            operation: 'Pick'
          });
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
            reportRows.push({
              barcode: item.barcode || item.sku || '',
              location: location,
              quantity: binQty,
              operation: 'Pick'
            });
          });
        } else {
          // Single location, just show the total quantity
          reportRows.push({
            barcode: item.barcode || item.sku || '',
            location: locationStr,
            quantity: totalQty,
            operation: 'Pick'
          });
        }
      }
    });
    
    let reportHTML = `
      <div class="pick-report">
        <div class="report-header">
          <h1>Pick Execution Report</h1>
          <div class="warehouse-info">
            <p><strong>Warehouse:</strong> ${executionResults.summary.warehouse}</p>
            <p><strong>Execution Date:</strong> ${new Date(executionResults.summary.executedAt).toLocaleString()}</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>

        ${includeStats ? `
        <div class="summary-stats">
          <h2>Execution Summary</h2>
          <table class="stats-table">
            <tr><td><strong>Total Items:</strong></td><td>${executionResults.summary.total}</td></tr>
            <tr><td><strong>Successful:</strong></td><td>${executionResults.summary.successful}</td></tr>
            <tr><td><strong>Failed:</strong></td><td>${executionResults.summary.failed}</td></tr>
            <tr><td><strong>Success Rate:</strong></td><td>${((executionResults.summary.successful / executionResults.summary.total) * 100).toFixed(1)}%</td></tr>
            <tr><td><strong>Total Quantity Picked:</strong></td><td>${reportRows.reduce((sum, row) => sum + (parseInt(row.quantity) || 0), 0)}</td></tr>
            <tr><td><strong>Total Locations Used:</strong></td><td>${reportRows.length}</td></tr>
            <tr><td><strong>FIFO Compliance:</strong></td><td>${executionResults.summary.fifoCompliance || 'Yes'}</td></tr>
          </table>
        </div>
        ` : ''}

        ${includeDetails && reportRows.length > 0 ? `
        <div class="successful-items">
          <h2>Successfully Picked Items (${reportRows.length} location entries)</h2>
          <table class="items-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Location</th>
                <th>Quantity</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows.map(row => `
                <tr>
                  <td>${row.barcode}</td>
                  <td>${row.location}</td>
                  <td>${row.quantity}</td>
                  <td>${row.operation}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${includeFailures && failedItems.length > 0 ? `
        <div class="failed-items">
          <h2>Failed Items (${failedItems.length})</h2>
          <table class="items-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Quantity</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${failedItems.map(item => `
                <tr>
                  <td>${item.barcode || item.sku || 'N/A'}</td>
                  <td>${item.quantity || item.requestedQuantity || 'N/A'}</td>
                  <td class="error-text">${item.error || 'Unknown error'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="report-footer">
          <p>This report was generated automatically by the Warehouse Management System</p>
          <p>For questions or issues, please contact your warehouse administrator</p>
        </div>
      </div>
    `;

    return this.wrapInPrintTemplate(reportHTML, 'Pick Execution Report', this.getPickReportStyles());
  }

  /**
   * Generate HTML for stock movement report
   */
  async generateStockMovementReportHTML(reportData, options = {}) {
    const { includeDetails = true, includeStats = true } = options;
    const data = reportData.data;
    const movements = data.movements || [];
    
    let reportHTML = `
      <div class="stock-movement-report">
        <div class="report-header">
          <h1>Stock Movement Report</h1>
          <div class="report-info">
            <p><strong>Report Type:</strong> ${reportData.config.type.replace(/_/g, ' ').toUpperCase()}</p>
            <p><strong>Generated:</strong> ${new Date(reportData.generatedAt).toLocaleString()}</p>
            ${reportData.config.scope === 'date_range' ? 
              `<p><strong>Period:</strong> ${new Date(reportData.config.startDate).toLocaleDateString()} - ${new Date(reportData.config.endDate).toLocaleDateString()}</p>` : 
              `<p><strong>Scope:</strong> ${reportData.config.scope.replace(/_/g, ' ').toUpperCase()}</p>`
            }
          </div>
        </div>

        ${includeStats ? `
        <div class="summary-stats">
          <h2>Movement Summary</h2>
          <table class="stats-table">
            <tr><td><strong>Total Movements:</strong></td><td>${data.summary.totalMovements}</td></tr>
            <tr><td><strong>Put-Away Operations:</strong></td><td>${data.summary.putawayCount}</td></tr>
            <tr><td><strong>Pick Operations:</strong></td><td>${data.summary.pickCount}</td></tr>
            <tr><td><strong>Total Quantity Moved:</strong></td><td>${data.summary.totalQuantityMoved}</td></tr>
            <tr><td><strong>Unique SKUs:</strong></td><td>${data.summary.uniqueSkus}</td></tr>
            <tr><td><strong>Unique Locations:</strong></td><td>${data.summary.uniqueLocations}</td></tr>
          </table>
        </div>
        ` : ''}

        ${includeDetails && movements.length > 0 ? `
        <div class="movement-details">
          <h2>Movement Details (${movements.length > 100 ? 'First 100 of ' + movements.length : movements.length} movements)</h2>
          <table class="items-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Location</th>
                <th>Opening Qty</th>
                <th>SKU</th>
                <th>Put-Away</th>
                <th>Pick</th>
                <th>Movement</th>
                <th>Closing Qty</th>
                <th>Bin Code</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${movements.slice(0, 100).map(movement => `
                <tr>
                  <td>${movement.date}</td>
                  <td>${movement.time}</td>
                  <td><strong>${movement.location}</strong></td>
                  <td>${movement.opening}</td>
                  <td>${movement.sku}</td>
                  <td>${movement.putaway}</td>
                  <td>${movement.pick}</td>
                  <td>${movement.movement}</td>
                  <td>${movement.closing}</td>
                  <td><strong>${movement.binCode}</strong></td>
                  <td>
                    <span class="status ${movement.status.toLowerCase()}">${movement.status}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${movements.length > 100 ? 
            `<p class="note">Note: Only the first 100 movements are shown. Download the full report for complete data.</p>` : 
            ''
          }
        </div>
        ` : ''}

        <div class="report-footer">
          <p>This report was generated automatically by the Warehouse Management System</p>
          <p>For questions or issues, please contact your warehouse administrator</p>
        </div>
      </div>
    `;

    return this.wrapInPrintTemplate(reportHTML, 'Stock Movement Report', this.getStockMovementReportStyles());
  }

  /**
   * Export product locations to CSV
   */
  async exportProductLocations(products, searchTerm = '') {
    try {
      const csvHeaders = [
        'SKU',
        'Total Quantity',
        'Bin Code',
        'Bin Quantity',
        'Lot Number',
        'Expiry Date',
        'Zone',
        'Rack',
        'Grid Level',
        'Bin Status',
        'Last Updated'
      ];

      const csvRows = [];
      csvRows.push(csvHeaders.join(','));

      products.forEach(product => {
        product.locations.forEach(location => {
          const row = [
            `"${product.sku}"`,
            product.totalQuantity,
            `"${location.binCode}"`,
            location.quantity,
            `"${location.lotNumber || ''}"`,
            location.expiryDate ? new Date(location.expiryDate).toLocaleDateString() : '',
            `"${location.zoneId || ''}"`,
            `"${location.rackCode || ''}"`,
            location.shelfLevel || '',
            `"${location.status || ''}"`,
            location.updatedAt ? new Date(location.updatedAt).toLocaleString() : ''
          ];
          csvRows.push(row.join(','));
        });
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `product-locations-${searchTerm || 'all'}-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    } catch (error) {
      console.error('Error exporting product locations:', error);
      throw new Error('Failed to export product locations');
    }
  }

  /**
   * Export dashboard report
   */
  async exportDashboardReport(reportData) {
    try {
      const csvHeaders = [
        'Metric',
        'Value',
        'Category',
        'Timestamp'
      ];

      const csvRows = [];
      csvRows.push(csvHeaders.join(','));

      // Add storage metrics
      csvRows.push([
        'Total Bins',
        reportData.metrics.storage.totalBins,
        'Storage',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Occupied Bins',
        reportData.metrics.storage.occupiedBins,
        'Storage',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Available Bins',
        reportData.metrics.storage.availableBins,
        'Storage',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Utilization Rate (%)',
        reportData.metrics.storage.utilizationRate.toFixed(2),
        'Storage',
        reportData.generatedAt
      ].join(','));

      // Add task metrics
      csvRows.push([
        'Pending Put-away',
        reportData.metrics.tasks.pendingPutAway,
        'Tasks',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Pending Pick',
        reportData.metrics.tasks.pendingPick,
        'Tasks',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Completed Put-away',
        reportData.metrics.tasks.completedPutAway,
        'Tasks',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Completed Pick',
        reportData.metrics.tasks.completedPick,
        'Tasks',
        reportData.generatedAt
      ].join(','));

      // Add alert metrics
      csvRows.push([
        'Low Stock Alerts',
        reportData.metrics.alerts.lowStockBins.length,
        'Alerts',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Expiring Items',
        reportData.metrics.alerts.expiringItems.length,
        'Alerts',
        reportData.generatedAt
      ].join(','));

      csvRows.push([
        'Urgent Tasks',
        reportData.metrics.alerts.urgentTasks.length,
        'Alerts',
        reportData.generatedAt
      ].join(','));

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `dashboard-report-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    } catch (error) {
      console.error('Error exporting dashboard report:', error);
      throw new Error('Failed to export dashboard report');
    }
  }

  /**
   * Generate and print pick list with QR codes
   */
  async printPickList(pickTask, items, options = {}) {
    const {
      includeQR = true,
      includeRoute = true,
      batchMode = false,
    } = options;

    try {
      // Handle case where items is not provided - extract from pickTask
      const taskItems = items || pickTask.items || [];
      
      if (!taskItems || taskItems.length === 0) {
        throw new Error('No items found in pick task');
      }

      // Ensure the task has items for the generatePickListHTML method
      const taskWithItems = {
        ...pickTask,
        items: taskItems
      };

      const html = await this.generatePickListHTML(taskWithItems, {
        includeCheckboxes: true,
        includeBarcode: includeQR,
        groupByLocation: false,
      });

      this.openPrintWindow(html, `Pick List - ${pickTask.orderNumber || pickTask.id}`);
      return true;
    } catch (error) {
      console.error('Error printing pick list:', error);
      throw new Error('Failed to print pick list');
    }
  }

  /**
   * Print multiple pick lists in batch
   */
  async printMultiplePickLists(tasks, options = {}) {
    const {
      includeQR = true,
      includeRoute = true,
      separatePages = true,
    } = options;

    try {
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('No tasks provided for batch printing');
      }

      let combinedHTML = '';
      
      if (separatePages) {
        // Generate separate pages for each task
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const taskItems = task.items || [];
          
          if (taskItems.length === 0) {
            console.warn(`Task ${task.orderNumber || task.id} has no items, skipping`);
            continue;
          }

          // Use the existing generatePickListHTML method with correct signature
          const taskHTML = await this.generatePickListHTML(task, {
            includeCheckboxes: true,
            includeBarcode: includeQR,
            groupByLocation: false,
          });
          
          combinedHTML += taskHTML;
          
          // Add page break between tasks (except for the last one)
          if (i < tasks.length - 1) {
            combinedHTML += '<div style="page-break-after: always;"></div>';
          }
        }
      } else {
        // Generate a single combined list
        combinedHTML = await this.generateCombinedPickListHTML(tasks, {
          includeQR,
          includeRoute,
        });
      }

      if (!combinedHTML.trim()) {
        throw new Error('No valid tasks found for printing');
      }

      this.openPrintWindow(combinedHTML, `Batch Pick Lists (${tasks.length} tasks)`);
      return true;
    } catch (error) {
      console.error('Error printing multiple pick lists:', error);
      throw new Error(`Failed to print batch pick lists: ${error.message}`);
    }
  }

  /**
   * Generate combined HTML for multiple pick tasks
   */
  async generateCombinedPickListHTML(tasks, options) {
    const { includeQR, includeRoute } = options;
    
    const validTasks = tasks.filter(task => task.items && task.items.length > 0);
    
    if (validTasks.length === 0) {
      throw new Error('No valid tasks with items found');
    }

    let tasksHTML = '';
    
    for (let index = 0; index < validTasks.length; index++) {
      const task = validTasks[index];
      const itemsHTML = await this.generatePickItemsListHTML(task.items, { includeQR, compact: true });
      
      tasksHTML += `
        <div class="task-section" style="margin-bottom: 30px; ${index > 0 ? 'border-top: 2px solid #ccc; padding-top: 20px;' : ''}">
          <div class="task-header" style="background: #f5f5f5; padding: 10px; margin-bottom: 15px;">
            <h3 style="margin: 0; color: #333;">Task #${index + 1}: ${task.orderNumber || task.id}</h3>
            <div style="font-size: 11px; color: #666; margin-top: 5px;">
              <span>Priority: <strong>${task.priority || 'Medium'}</strong></span> | 
              <span>Status: <strong>${task.status || 'Pending'}</strong></span> | 
              <span>Items: <strong>${task.items.length}</strong></span>
              ${task.assignedTo ? ` | <span>Assigned: <strong>${task.assignedTo}</strong></span>` : ''}
            </div>
          </div>
          ${itemsHTML}
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Combined Pick Lists</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            font-size: 12px;
            line-height: 1.4;
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            border-bottom: 3px solid #333; 
            padding-bottom: 15px;
          }
          .task-section {
            margin-bottom: 30px;
          }
          .item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid #eee;
          }
          .item-details {
            flex: 1;
          }
          .pick-checkbox {
            margin-right: 10px;
          }
          @media print {
            body { margin: 10mm; }
            .task-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Combined Pick Lists</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>Total Tasks: ${validTasks.length} | Total Items: ${validTasks.reduce((sum, task) => sum + task.items.length, 0)}</p>
        </div>
        ${tasksHTML}
        <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666;">
          <p>Printed: ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate HTML for pick items list (compact version for batch printing)
   */
  async generatePickItemsListHTML(items, options = {}) {
    const { includeQR = true, compact = false } = options;
    
    let itemsHTML = '';
    
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const pickPlan = item.pickPlan || [];
      const locations = pickPlan.length > 0 
        ? pickPlan.map(p => `${p.code} (${p.pickQuantity || 'N/A'})`).join(', ')
        : 'No location assigned';
      
      let qrCodeHTML = '';
      if (includeQR) {
        try {
          const qrDataURL = await this.generateQRCode(item.sku, { size: 40 });
          qrCodeHTML = `<img src="${qrDataURL}" style="width: 40px; height: 40px;" alt="QR Code for ${item.sku}" />`;
        } catch (error) {
          console.warn('Failed to generate QR code for', item.sku, error);
          qrCodeHTML = `<div style="width: 40px; height: 40px; border: 1px solid #ccc; font-size: 8px; text-align: center; line-height: 40px;">QR</div>`;
        }
      }
        
      itemsHTML += `
        <div class="item-row">
          <input type="checkbox" class="pick-checkbox" />
          <div class="item-details">
            <div style="font-weight: bold; font-size: ${compact ? '11px' : '12px'};">${item.sku}</div>
            <div style="color: #666; font-size: ${compact ? '10px' : '11px'};">
              Qty: ${item.quantity} | Locations: ${locations}
            </div>
          </div>
          ${qrCodeHTML}
        </div>
      `;
    }
    
    return itemsHTML;
  }

  // Helper methods
  generateBinQRData(bin) {
    return JSON.stringify({
      type: 'bin',
      binId: bin.id,
      code: bin.code,
      rackCode: bin.rackCode,
      shelfLevel: bin.shelfLevel,
      position: bin.position,
    });
  }

  generateRackQRData(rack) {
    return JSON.stringify({
      type: 'rack',
      rackId: rack.id,
      code: rack.code,
      name: rack.name,
    });
  }

  generateBinGridHTML(rack, bins) {
    let gridHTML = '<div class="bin-grid-container">';
    
    for (let grid = rack.shelfCount; grid >= 1; grid--) {
      const gridBins = bins.filter(bin => bin.shelfLevel === grid)
        .sort((a, b) => a.position - b.position);
      
      gridHTML += `
        <div class="shelf-row">
          <div class="shelf-label">G-${String(grid).padStart(2, '0')}</div>
          <div class="bins-row">
      `;
      
      for (const bin of gridBins) {
        const isOccupied = bin.currentQty > 0;
        gridHTML += `
          <div class="bin-cell ${isOccupied ? 'occupied' : 'empty'}">
            <div class="bin-code">${bin.code.split('-').pop()}</div>
            ${isOccupied ? `<div class="bin-sku">${bin.sku}</div>` : ''}
          </div>
        `;
      }
      
      gridHTML += '</div></div>';
    }
    
    gridHTML += '</div>';
    return gridHTML;
  }

  async generatePickItemsHTML(items, options) {
    let itemsHTML = '';
    
    for (const item of items) {
      const barcodeHTML = options.includeBarcode 
        ? `<img src="${await this.generateQRCode(item.sku, { size: 50 })}" class="item-barcode" />`
        : '';

      itemsHTML += `
        <div class="pick-item">
          ${options.includeCheckboxes ? '<input type="checkbox" class="pick-checkbox" />' : ''}
          
          <div class="item-details">
            <div class="item-sku"><strong>${item.sku}</strong></div>
            <div class="item-quantity">Qty: ${item.quantity}</div>
            <div class="item-locations">
              ${item.pickPlan?.map(p => `${p.code} (${p.pickQuantity})`).join(', ') || 'N/A'}
            </div>
          </div>
          
          ${barcodeHTML}
        </div>
      `;
    }
    
    return itemsHTML;
  }

  groupItemsByLocation(items) {
    return items.reduce((groups, item) => {
      const location = item.pickPlan?.[0]?.rackCode || 'Unknown';
      if (!groups[location]) {
        groups[location] = [];
      }
      groups[location].push(item);
      return groups;
    }, {});
  }

  wrapInPrintTemplate(content, title, additionalStyles = '') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          ${this.getBasePrintStyles()}
          ${additionalStyles}
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
  }

  openPrintWindow(html, title) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  // CSS Styles
  getBasePrintStyles() {
    return `
      @media print {
        body { margin: 0; padding: 10mm; }
        .no-print { display: none !important; }
      }
      
      body {
        font-family: Arial, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        color: #000;
      }
      
      h1, h2, h3, h4 { margin: 0 0 10px 0; }
      table { border-collapse: collapse; width: 100%; }
      th, td { padding: 4px 8px; border: 1px solid #ccc; text-align: left; }
      th { background-color: #f5f5f5; font-weight: bold; }
    `;
  }

  getBinLabelStyles(size) {
    const sizes = {
      small: { width: '2in', height: '1in', fontSize: '8px' },
      medium: { width: '3in', height: '2in', fontSize: '10px' },
      large: { width: '4in', height: '3in', fontSize: '12px' },
    };

    const { width, height, fontSize } = sizes[size] || sizes.medium;

    return `
      .bin-label {
        width: ${width};
        height: ${height};
        border: 2px solid #000;
        margin: 5px;
        padding: 5px;
        display: inline-block;
        vertical-align: top;
        font-size: ${fontSize};
        page-break-inside: avoid;
      }
      
      .label-header h3 {
        text-align: center;
        margin: 0 0 5px 0;
        font-size: ${parseInt(fontSize) + 2}px;
        font-weight: bold;
      }
      
      .label-content {
        display: flex;
        align-items: center;
        height: calc(100% - 20px);
      }
      
      .qr-code {
        width: 30%;
        height: auto;
        margin-right: 5px;
      }
      
      .label-info {
        flex: 1;
        font-size: ${parseInt(fontSize) - 1}px;
      }
      
      .label-info div {
        margin: 1px 0;
      }
    `;
  }

  getRackSummaryStyles() {
    return `
      .rack-summary { max-width: 800px; margin: 0 auto; }
      .summary-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .rack-qr img { width: 150px; height: 150px; }
      .info-table { margin-bottom: 20px; }
      .info-table td:first-child { font-weight: bold; width: 150px; }
      
      .bin-grid-container { margin-top: 20px; }
      .shelf-row { display: flex; margin-bottom: 5px; }
      .shelf-label { width: 50px; font-weight: bold; display: flex; align-items: center; }
      .bins-row { display: flex; flex: 1; }
      .bin-cell { 
        width: 40px; 
        height: 30px; 
        border: 1px solid #ccc; 
        margin: 1px; 
        text-align: center; 
        font-size: 8px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .bin-cell.occupied { background-color: #ffeb3b; }
      .bin-cell.empty { background-color: #f5f5f5; }
      .bin-sku { font-size: 6px; }
    `;
  }

  getPickListStyles() {
    return `
      .pick-list { max-width: 800px; margin: 0 auto; }
      .pick-header { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #000; }
      .order-info p { margin: 5px 0; }
      .pick-instructions { margin-bottom: 20px; }
      .pick-instructions ol { margin-left: 20px; }
      
      .location-group { margin-bottom: 20px; }
      .location-group h4 { background-color: #e0e0e0; padding: 5px; margin: 10px 0 5px 0; }
      
      .pick-item { 
        display: flex; 
        align-items: center; 
        padding: 8px; 
        border-bottom: 1px solid #ddd;
        page-break-inside: avoid;
      }
      .pick-checkbox { margin-right: 10px; }
      .item-details { flex: 1; }
      .item-sku { font-weight: bold; font-size: 14px; }
      .item-quantity { color: #666; }
      .item-locations { font-size: 10px; color: #888; }
      .item-barcode { width: 50px; height: 50px; }
      
      .signature-section { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; }
      .signature-section p { margin: 10px 0; }
    `;
  }

  getPutAwayListStyles() {
    return `
      .putaway-list { max-width: 800px; margin: 0 auto; }
      .list-header { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #000; }
      
      .putaway-task { 
        margin-bottom: 20px; 
        padding: 10px; 
        border: 1px solid #ddd;
        page-break-inside: avoid;
      }
      .task-header { 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        margin-bottom: 10px;
      }
      .priority { 
        padding: 2px 8px; 
        border-radius: 3px; 
        font-size: 10px; 
        font-weight: bold;
      }
      .priority.high { background-color: #ffcdd2; color: #c62828; }
      .priority.medium { background-color: #fff3e0; color: #f57c00; }
      .priority.low { background-color: #e8f5e8; color: #2e7d32; }
      
      .task-table { margin-bottom: 10px; }
      .task-table td { padding: 4px 8px; }
      .task-notes { margin-bottom: 10px; font-style: italic; }
      .task-completion { display: flex; justify-content: space-between; align-items: center; }
      
      .completion-summary { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; }
    `;
  }

  getPutAwayReportStyles() {
    return `
      .putaway-report { max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; }
      .report-header { text-align: center; margin-bottom: 30px; }
      .report-header h1 { margin-bottom: 10px; color: #333; }
      .warehouse-info { margin-top: 15px; text-align: left; }
      .warehouse-info p { margin: 5px 0; }

      .summary-stats { margin-bottom: 30px; }
      .summary-stats h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
      .stats-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .stats-table td { padding: 8px; border: 1px solid #ddd; }
      .stats-table td:first-child { background-color: #f8f9fa; font-weight: bold; width: 40%; }

      .successful-items, .failed-items { margin-bottom: 30px; page-break-inside: avoid; }
      .successful-items h2 { color: #28a745; border-bottom: 2px solid #28a745; padding-bottom: 5px; }
      .failed-items h2 { color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 5px; }

      .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .items-table th, .items-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
      .items-table th { background-color: #f8f9fa; font-weight: bold; }
      .items-table tr:nth-child(even) { background-color: #f8f9fa; }

      .error-text { color: #dc3545; font-size: 12px; }

      .report-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; }
      .report-footer p { margin: 5px 0; font-size: 12px; color: #666; }

      @media print {
        .putaway-report { margin: 0; }
        .items-table { font-size: 12px; }
        .successful-items, .failed-items { page-break-inside: avoid; }
      }
    `;
  }

  getPickReportStyles() {
    return `
      .pick-report { max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; }
      .report-header { text-align: center; margin-bottom: 30px; }
      .report-header h1 { margin-bottom: 10px; color: #333; }
      .warehouse-info { margin-top: 15px; text-align: left; }
      .warehouse-info p { margin: 5px 0; }

      .summary-stats { margin-bottom: 30px; }
      .summary-stats h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
      .stats-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .stats-table td { padding: 8px; border: 1px solid #ddd; }
      .stats-table td:first-child { background-color: #f8f9fa; font-weight: bold; width: 40%; }

      .successful-items, .failed-items { margin-bottom: 30px; page-break-inside: avoid; }
      .successful-items h2 { color: #28a745; border-bottom: 2px solid #28a745; padding-bottom: 5px; }
      .failed-items h2 { color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 5px; }

      .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .items-table th, .items-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
      .items-table th { background-color: #f8f9fa; font-weight: bold; }
      .items-table tr:nth-child(even) { background-color: #f8f9fa; }

      .error-text { color: #dc3545; font-size: 12px; }

      .report-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; }
      .report-footer p { margin: 5px 0; font-size: 12px; color: #666; }

      @media print {
        .pick-report { margin: 0; }
        .items-table { font-size: 12px; }
        .successful-items, .failed-items { page-break-inside: avoid; }
      }
    `;
  }

  getStockMovementReportStyles() {
    return `
      .stock-movement-report { max-width: 1000px; margin: 0 auto; font-family: Arial, sans-serif; }
      .report-header { text-align: center; margin-bottom: 30px; }
      .report-header h1 { margin-bottom: 10px; color: #333; }
      .report-info { margin-top: 15px; text-align: left; }
      .report-info p { margin: 5px 0; }

      .summary-stats { margin-bottom: 30px; }
      .summary-stats h2 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
      .stats-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .stats-table td { padding: 8px; border: 1px solid #ddd; }
      .stats-table td:first-child { background-color: #f8f9fa; font-weight: bold; width: 40%; }

      .movement-details { margin-bottom: 30px; page-break-inside: avoid; }
      .movement-details h2 { color: #333; border-bottom: 2px solid #28a745; padding-bottom: 5px; }

      .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
      .items-table th, .items-table td { padding: 6px 4px; border: 1px solid #ddd; text-align: left; }
      .items-table th { background-color: #f8f9fa; font-weight: bold; font-size: 9px; }
      .items-table tr:nth-child(even) { background-color: #f8f9fa; }
      
      /* Highlight bin codes */
      .items-table td:nth-child(10) { 
        font-weight: bold; 
        color: #d32f2f;
        background-color: #ffebee;
        text-align: center;
      }
      
      /* Format location with hierarchy display */
      .items-table td:nth-child(3) small { 
        display: block;
        color: #666;
        font-size: 8px;
        margin-top: 2px;
        font-style: italic;
      }

      .operation-type { 
        padding: 2px 6px; 
        border-radius: 3px; 
        font-size: 8px; 
        font-weight: bold; 
        text-transform: uppercase;
      }
      .operation-type.putaway { background-color: #e3f2fd; color: #1976d2; }
      .operation-type.pick { background-color: #fff3e0; color: #f57c00; }

      .status { 
        padding: 2px 6px; 
        border-radius: 3px; 
        font-size: 8px; 
        font-weight: bold; 
        text-transform: uppercase;
      }
      .status.completed { background-color: #e8f5e8; color: #2e7d32; }
      .status.failed { background-color: #ffebee; color: #c62828; }
      .status.partial { background-color: #fff9c4; color: #f9a825; }

      .note { font-style: italic; color: #666; margin-top: 10px; font-size: 11px; }

      .report-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; }
      .report-footer p { margin: 5px 0; font-size: 12px; color: #666; }

      @media print {
        .stock-movement-report { margin: 0; }
        .items-table { font-size: 8px; }
        .items-table th { font-size: 7px; }
        .movement-details { page-break-inside: avoid; }
      }
    `;
  }

  /**
   * Print simplified put-away execution report (barcode, location, quantity only)
   */
  async printSimplePutAwayReport(executionResults, options = {}) {
    try {
      const html = await this.generateSimplePutAwayReportHTML(executionResults, options);
      this.openPrintWindow(html, 'Put-Away Report');
    } catch (error) {
      console.error('Error printing simplified put-away report:', error);
      throw error;
    }
  }

  /**
   * Print simplified pick execution report (barcode, location, quantity only)
   */
  async printSimplePickReport(executionResults, options = {}) {
    try {
      const html = await this.generateSimplePickReportHTML(executionResults, options);
      this.openPrintWindow(html, 'Pick Report');
    } catch (error) {
      console.error('Error printing simplified pick report:', error);
      throw error;
    }
  }

  /**
   * Print simplified stock movement report with just barcode, location, quantity, and operation
   */
  async printSimpleStockMovementReport(reportData, options = {}) {
    try {
      const html = await this.generateSimpleStockMovementReportHTML(reportData, options);
      this.openPrintWindow(html, 'Stock Movement Report');
    } catch (error) {
      console.error('Error printing simplified stock movement report:', error);
      throw error;
    }
  }

  /**
   * Generate HTML for simplified put-away report with just barcode, location, quantity, and operation
   */
  async generateSimplePutAwayReportHTML(executionResults, options) {
    const items = executionResults.items || [];
    const successfulItems = items.filter(item => item.status === 'Completed');
    
    let tableHTML = `
      <table class="putaway-table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Operation</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const item of successfulItems) {
      const barcode = item.barcode || item.sku || 'N/A';
      
      // Process location for both dash-connected and comma-separated locations
      const locationStr = item.location || 'N/A';
      let locations = [];
      
      if (locationStr.includes('-')) {
        // Look for patterns like WH01-SF-R10-G02-WH01-GF-R01-G02-A2
        const parts = locationStr.split('-');
        // Improved algorithm to handle any number of concatenated locations
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
        } else if (locationStr.includes(',')) {
          // Fall back to comma splitting
          locations = locationStr.split(',').map(loc => loc.trim());
        } else {
          // Single location
          locations = [locationStr];
        }
      } else if (locationStr.includes(',')) {
        // Location string already has commas
        locations = locationStr.split(',').map(loc => loc.trim());
      } else {
        // Single location
        locations = [locationStr];
      }
      
      const totalQty = parseInt(item.quantity) || 0;
      
      if (locations.length > 1) {
        const baseQtyPerBin = Math.floor(totalQty / locations.length);
        const remainder = totalQty % locations.length;
        
        // Create a row for each location with its portion of the quantity
        locations.forEach((location, index) => {
          const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
          tableHTML += `
            <tr>
              <td>${barcode}</td>
              <td>${location}</td>
              <td>${binQty}</td>
              <td>Put-Away</td>
            </tr>
          `;
        });
      } else {
        // Single location
        tableHTML += `
          <tr>
            <td>${barcode}</td>
            <td>${locations[0]}</td>
            <td>${totalQty}</td>
            <td>Put-Away</td>
          </tr>
        `;
      }
    }
    
    tableHTML += `
        </tbody>
      </table>
    `;
    
    const title = 'Put-Away Report';
    
    const html = `
      <div class="report-container">
        <div class="report-header">
          <h2>${title}</h2>
        </div>
        
        <div class="report-content">
          ${tableHTML}
        </div>
      </div>
    `;
    
    return this.wrapInPrintTemplate(html, title, this.getReportStyles());
  }

  /**
   * Generate HTML for simplified pick report with just barcode, location, quantity, and operation
   */
  async generateSimplePickReportHTML(executionResults, options) {
    const items = executionResults.items || [];
    const successfulItems = items.filter(item => item.status === 'Completed');
    
    let tableHTML = `
      <table class="pick-table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Operation</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const item of successfulItems) {
      const barcode = item.barcode || item.sku || 'N/A';
      const totalQty = parseInt(item.pickedQty || item.pickedQuantity || item.quantity) || 0;
      
      // Check if we have detailed bin information
      if (Array.isArray(item.pickedBins) && item.pickedBins.length > 0) {
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
          
          tableHTML += `
            <tr>
              <td>${barcode}</td>
              <td>${locationStr || 'N/A'}</td>
              <td>${bin.quantity || 0}</td>
              <td>Pick</td>
            </tr>
          `;
        });
      } else {
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
        
        // Check if there are multiple locations
        if (locationStr.includes(',')) {
          const locations = locationStr.split(',').map(loc => loc.trim());
          
          // Split quantities evenly across locations
          const baseQtyPerBin = Math.floor(totalQty / locations.length);
          const remainder = totalQty % locations.length;
          
          locations.forEach((location, index) => {
            const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
            
            tableHTML += `
              <tr>
                <td>${barcode}</td>
                <td>${location}</td>
                <td>${binQty}</td>
                <td>Pick</td>
              </tr>
            `;
          });
        } else {
          // Single location
          tableHTML += `
            <tr>
              <td>${barcode}</td>
              <td>${locationStr}</td>
              <td>${totalQty}</td>
              <td>Pick</td>
            </tr>
          `;
        }
      }
    }
    
    tableHTML += `
        </tbody>
      </table>
    `;
    
    const title = 'Pick Report';
    
    const html = `
      <div class="report-container">
        <div class="report-header">
          <h2>${title}</h2>
        </div>
        
        <div class="report-content">
          ${tableHTML}
        </div>
      </div>
    `;
    
    return this.wrapInPrintTemplate(html, title, this.getReportStyles());
  }

  /**
   * Generate HTML for simplified stock movement report with just barcode, location, quantity, and operation
   */
  async generateSimpleStockMovementReportHTML(reportData, options) {
    const movements = reportData.data.movements || [];
    
    let tableHTML = `
      <table class="movement-table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Operation</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const movement of movements) {
      const barcode = movement.sku || 'N/A';
      
      // Clean up location by ensuring full location paths and proper comma separation
      let location = movement.location || 'N/A';
      // Fix any double warehouse prefixes for connected locations
      if (location.includes('-')) {
        // Look for patterns like WH01-SF-R10-G02-WH01-GF-R01-G02-A2
        const parts = location.split('-');
        // Improved algorithm to handle any number of concatenated locations
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
        
        // Join all distinct locations with commas
        if (locationParts.length > 1) {
          location = locationParts.join(', ');
        }
      }
      
      // Determine quantity based on movement type
      let quantity = Math.abs(movement.movement) || 0;
      let operation = movement.movement > 0 ? 'Put-Away' : 'Pick';
      
      // Check if we have multiple locations
      if (location.includes(',')) {
        const locations = location.split(',').map(loc => loc.trim());
        
        // Calculate quantity per location
        const baseQtyPerBin = Math.floor(quantity / locations.length);
        const remainder = quantity % locations.length;
        
        // Add individual rows for each location
        locations.forEach((loc, index) => {
          const binQty = index === 0 ? baseQtyPerBin + remainder : baseQtyPerBin;
          tableHTML += `
            <tr>
              <td>${barcode}</td>
              <td>${loc}</td>
              <td>${binQty}</td>
              <td>${operation}</td>
            </tr>
          `;
        });
      } else {
        // Single location
        tableHTML += `
          <tr>
            <td>${barcode}</td>
            <td>${location}</td>
            <td>${quantity}</td>
            <td>${operation}</td>
          </tr>
        `;
      }
    }
    
    tableHTML += `
        </tbody>
      </table>
    `;
    
    const title = 'Stock Movement Report';
    
    const html = `
      <div class="report-container">
        <div class="report-header">
          <h2>${title}</h2>
        </div>
        
        <div class="report-content">
          ${tableHTML}
        </div>
      </div>
    `;
    
    return this.wrapInPrintTemplate(html, title, this.getReportStyles());
  }

  /**
   * Get styles for reports
   */
  getReportStyles() {
    return `
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
      }
      .report-container {
        max-width: 100%;
        margin: 0 auto;
        padding: 20px;
      }
      .report-header {
        text-align: center;
        margin-bottom: 20px;
      }
      .report-header h2 {
        margin: 0;
        font-size: 24px;
        color: #333;
      }
      .report-content {
        margin-bottom: 30px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px 12px;
        text-align: left;
      }
      th {
        background-color: #f2f2f2;
        font-weight: bold;
      }
      tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      
      @media print {
        body {
          font-size: 12px;
        }
        .report-header h2 {
          font-size: 16px;
        }
        th, td {
          padding: 6px 8px;
        }
      }
    `;
  }
}

export const printService = new PrintService();
