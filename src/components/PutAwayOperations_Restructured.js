import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  ButtonGroup,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  PlayArrow as ExecuteIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  History as HistoryIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  Undo as UndoIcon
} from '@mui/icons-material';
import { useWarehouse } from '../context/WarehouseContext';
import { useNotification } from '../context/NotificationContext';
import { excelService } from '../services/excelService';
import { printService } from '../services/printService';
import { warehouseOperations } from '../services/warehouseOperations';
import { warehouseService } from '../services/warehouseService';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { historyService } from '../services/historyService';

export default function PutAwayOperations() {
  const { currentWarehouse, refreshBins } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  
  // Add warning and info notification functions
  const showWarning = (message) => {
    if (typeof showError === 'function') {
      showError(message); // Reuse error notification with warning message
    }
  };
  
  const showInfo = (message) => {
    if (typeof showSuccess === 'function') {
      showSuccess(message); // Reuse success notification with info message
    }
  };
  
  const [uploadedFile, setUploadedFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [executionResults, setExecutionResults] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // History Detail Dialog
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  
  const openHistoryDetailDialog = (historyItem) => {
    setSelectedHistoryItem(historyItem);
    setHistoryDetailOpen(true);
  };

  const closeHistoryDetailDialog = () => {
    setHistoryDetailOpen(false);
  };

  const [isRollbackInProgress, setIsRollbackInProgress] = useState(false);

  const handleRollbackOperation = async (historyItem, operationIndex, skipConfirmation = false) => {
    // Get operation details
    const operation = historyItem.executionDetails.items[operationIndex];
    
    // If not skipping confirmation, open the dialog
    if (!skipConfirmation) {
      openRollbackDialog(historyItem, operationIndex);
      return;
    }

    try {
      setIsRollbackInProgress(true);
      
      // Make sure operation exists in historyItem's executionDetails
      if (!historyItem || !historyItem.executionDetails || !historyItem.executionDetails.items || 
          !historyItem.executionDetails.items[operationIndex]) {
        throw new Error('Cannot find operation in history data');
      }
      
      // Get the operation history entry from warehouseOperations service
      const historyEntries = await warehouseOperations.getOperationHistory(currentWarehouse.id, {
        sku: operation.barcode,
        operationType: 'putaway',
        limit: 10
      });
      
      if (!historyEntries || !historyEntries.history || historyEntries.history.length === 0) {
        throw new Error('Could not find operation history in database');
      }
      
      // Find matching history entry by timestamp or other criteria
      const matchingEntry = historyEntries.history.find(entry => {
        const entryDate = new Date(entry.timestamp).toISOString().substring(0, 10);
        const operationDate = new Date(operation.executedAt).toISOString().substring(0, 10);
        return entry.sku === operation.barcode && entryDate === operationDate;
      });
      
      if (!matchingEntry) {
        throw new Error('Could not find matching operation in history');
      }
      
      // Execute the rollback using the correct function
      const result = await warehouseOperations.rollbackOperationHistoryEntry(
        currentWarehouse.id,
        matchingEntry
      );
      
      if (!result.success) {
        throw new Error(result.message || 'Rollback failed');
      }
      
      // Mark operation as rolled back in our local history
      const updatedHistoryItem = {...historyItem};
      updatedHistoryItem.executionDetails.items[operationIndex].rolledBack = true;
      updatedHistoryItem.executionDetails.items[operationIndex].rollbackDate = new Date().toISOString();
      
      // Update history
      const updatedHistory = executionHistory.map(item => 
        item.id === historyItem.id ? updatedHistoryItem : item
      );
      
      setExecutionHistory(updatedHistory);
      
      // Update history item in Firestore
      await historyService.updateOperationHistoryItem(
        currentWarehouse.id,
        historyItem.id,
        { executionDetails: updatedHistoryItem.executionDetails }
      );
      
      // If currently viewing this item, update it
      if (selectedHistoryItem?.id === historyItem.id) {
        setSelectedHistoryItem(updatedHistoryItem);
        setExecutionResults(updatedHistoryItem.executionDetails);
      }
      
      // Refresh bins to show updated quantities
      refreshBins();
      
      showSuccess(`Operation successfully rolled back: ${result.message}`);
    } catch (error) {
      console.error('Rollback error:', error);
      showError(`Rollback failed: ${error.message}`);
    } finally {
      setIsRollbackInProgress(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Parse Excel file
      const data = await excelService.parsePutawayFile(file);
      
      setUploadedFile(file);
      setParsedData(data);
      setExecutionResults(null);
      
      if (data.errors.length > 0) {
        showError(`File parsed with ${data.errors.length} errors. Please review before proceeding.`);
      } else {
        showSuccess(`Successfully parsed ${data.totalItems} items from Excel file.`);
      }
    } catch (error) {
      showError(error.message);
      setUploadedFile(null);
      setParsedData(null);
    }
  };

  // No automatic bin creation - removed emergency bin creation helper function

  const handleExecutePutaway = async () => {
    if (!parsedData || parsedData.items.length === 0) {
      showError('No items to process');
      return;
    }

    // Check if there are any available bins before starting execution
    try {
      const allBins = await warehouseOperations.getAllBins(currentWarehouse.id);
      const availableBins = allBins.filter(bin => {
        const currentQty = parseInt(bin.currentQty) || 0;
        const capacity = parseInt(bin.capacity) || 0;
        const isActive = (bin.status === 'available' || bin.status === 'occupied');
        return isActive && capacity > currentQty; // Has available space
      });

      if (availableBins.length === 0) {
        showError('All bins are occupied. Cannot proceed with put-away operations. Please free up some bin space or create new bins first.');
        return;
      }

      // Calculate total available capacity
      const totalAvailableCapacity = availableBins.reduce((sum, bin) => {
        const currentQty = parseInt(bin.currentQty) || 0;
        const capacity = parseInt(bin.capacity) || 0;
        return sum + (capacity - currentQty);
      }, 0);

      const totalRequiredQuantity = parsedData.items.reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0);

      if (totalAvailableCapacity < totalRequiredQuantity) {
        showError(`Insufficient bin capacity. Available capacity: ${totalAvailableCapacity} units, Required: ${totalRequiredQuantity} units. Please free up more space or create additional bins.`);
        return;
      }

      console.log(`✅ Pre-check passed: ${availableBins.length} bins available with ${totalAvailableCapacity} units of capacity for ${totalRequiredQuantity} units required.`);
    } catch (error) {
      showError(`Error checking bin availability: ${error.message}`);
      return;
    }

    setExecuting(true);
    setProgress(0);
    const results = [];

    try {
      for (let i = 0; i < parsedData.items.length; i++) {
        const item = parsedData.items[i];
        setProgress((i / parsedData.items.length) * 100);

        try {
          // Use guaranteed auto-allocation that never fails
          console.log(`📦 Processing item ${i + 1}: ${item.barcode} (${item.quantity} units)`);
          
          // Parse quantity to ensure it's numeric
          const quantity = parseInt(item.quantity);
          if (isNaN(quantity) || quantity <= 0) {
            console.error(`❌ Invalid quantity for ${item.barcode}: ${item.quantity}`);
            results.push({
              ...item,
              status: 'Failed',
              error: 'Invalid quantity. Must be a positive number.',
              location: null
            });
            continue;
          }
          
          try {
            // Use the imported warehouseOperations service for guaranteed allocation
            const allocationResult = await warehouseOperations.autoAllocateQuantity(
              currentWarehouse.id,
              item.barcode,
              quantity,
              {
                preferExistingSku: true,
                preferGroundLevel: true,
                zoneId: item.zone || null
              }
            );
            
            // This should never happen with our guaranteed allocation, but if it does,
            // we no longer create emergency bins automatically
            if (!allocationResult || !allocationResult.allocationPlan || allocationResult.allocationPlan.length === 0) {
              console.log(`❌ No allocation plan available for ${item.barcode}`);
              results.push({
                ...item,
                status: 'Failed',
                error: 'No available bins found for allocation. All bins may be occupied.',
                location: null
              });
              continue;
            }
            
            // Get the first bin for simplified display
            const primaryBin = allocationResult.allocationPlan[0].bin;
            const locationCode = primaryBin.location?.fullCode || primaryBin.code || 'Unknown';
            
            // Create user-friendly bin location string if multiple bins were used
            let fullLocation = locationCode;
            if (allocationResult.allocationPlan.length > 1) {
              fullLocation = allocationResult.allocationPlan
                .map(plan => plan.bin.code)
                .join(', ');
            }
            
            // Execute the auto-allocation plan
            const executionResult = await warehouseOperations.executeAutoAllocation(
              currentWarehouse.id,
              item.barcode,
              allocationResult.allocationPlan,
              {
                lotNumber: null, // Excel import only has barcode and quantity
                expiryDate: null, // Excel import only has barcode and quantity
                notes: `Excel import - Batch ${uploadedFile.name || 'unknown'}`
              }
            );
            
            results.push({
              ...item,
              status: 'Completed',
              location: fullLocation,
              binCode: primaryBin.code,
              rackCode: primaryBin.rackCode,
              shelfCode: `G${String(primaryBin.gridLevel || 1).padStart(3, '0')}`,
              executedAt: new Date().toISOString(),
              binCount: allocationResult.allocationPlan.length,
              autoCreatedBins: allocationResult.summary?.autoCreatedBins || 0,
              // Store actual allocation details for accurate reporting
              allocationPlan: allocationResult.allocationPlan.map(plan => ({
                binCode: plan.bin.code,
                binLocation: plan.bin.location?.fullCode || plan.bin.code,
                allocatedQuantity: plan.allocatedQuantity,
                reason: plan.reason
              }))
            });
            
          } catch (allocationError) {
            console.error(`❌ Error in allocation for ${item.barcode}:`, allocationError);
            
            // No longer create emergency bins - record as failed
            results.push({
              ...item,
              status: 'Failed',
              error: `Allocation failed: ${allocationError.message}. No available bins found.`,
              location: null
            });
          }
        } catch (itemError) {
          console.error(`❌ Error processing item ${item.barcode}:`, itemError);
          results.push({
            ...item,
            status: 'Failed',
            error: itemError.message,
            location: null
          });
        }
      }

      setProgress(100);
      
      // Add auto-created bin count to the summary
      const autoCreatedBinsTotal = results.reduce((sum, r) => sum + (r.autoCreatedBins || 0), 0);
      const emergencyCount = results.filter(r => r.emergency).length;
      
      setExecutionResults({
        items: results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.status === 'Completed').length,
          failed: results.filter(r => r.status === 'Failed').length,
          executedAt: new Date().toISOString(),
          warehouse: currentWarehouse.name,
          autoCreatedBins: autoCreatedBinsTotal,
          emergencyAllocations: emergencyCount
        }
      });

      // Add to history
      addToHistory({
        items: results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.status === 'Completed').length,
          failed: results.filter(r => r.status === 'Failed').length,
          executedAt: new Date().toISOString(),
          warehouse: currentWarehouse.name,
          autoCreatedBins: autoCreatedBinsTotal,
          emergencyAllocations: emergencyCount
        }
      });

      const successCount = results.filter(r => r.status === 'Completed').length;
      const autoCreatedMessage = autoCreatedBinsTotal > 0 ? ` ${autoCreatedBinsTotal} bins auto-created.` : '';
      const emergencyMessage = emergencyCount > 0 ? ` ${emergencyCount} emergency allocations created.` : '';
      
      showSuccess(`Put-away completed! ${successCount}/${results.length} items processed successfully.${autoCreatedMessage}${emergencyMessage}`);

    } catch (error) {
      showError(`Execution failed: ${error.message}`);
    } finally {
      setExecuting(false);
      setProgress(0);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.generatePutawayTemplate();
      showSuccess('Template downloaded successfully');
    } catch (error) {
      showError('Error downloading template');
    }
  };

  const handleGenerateReport = async (format) => {
    if (!executionResults || !executionResults.summary || !executionResults.items) {
      showError('No execution results to export');
      return;
    }

    try {
      switch (format) {
        case 'excel':
          await generateExcelReport();
          showSuccess('Excel report generated and downloaded');
          break;
        
        case 'pdf':
          await generatePDFReport();
          showSuccess('PDF report generated and downloaded');
          break;
        
        case 'print':
          await printService.printSimplePutAwayReport(executionResults);
          showSuccess('Report sent to printer');
          break;
        
        default:
          showError('Unknown format');
      }
    } catch (error) {
      showError(`Error generating ${format} report: ${error.message}`);
    }
  };

  const generateExcelReport = async () => {
    if (!executionResults || !executionResults.summary || !executionResults.items) {
      showError('No execution results to export');
      return;
    }
    
    try {
      // Use the excelService to generate the report instead of direct XLSX manipulation
      await excelService.generatePutawayReport(executionResults);
      return true;
    } catch (error) {
      console.error('Error generating Excel report:', error);
      showError('Failed to generate Excel report');
      return false;
    }
  };

  const generatePDFReport = async () => {
    if (!executionResults || !executionResults.summary || !executionResults.items) {
      showError('No execution results to export');
      return false;
    }

    try {
      // Create PDF document
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text('Put-Away Execution Report', 20, 20);
      
      // Summary
      doc.setFontSize(12);
      doc.text(`Warehouse: ${executionResults.summary.warehouse || 'N/A'}`, 20, 40);
      doc.text(`Execution Date: ${new Date(executionResults.summary.executedAt).toLocaleString()}`, 20, 50);
      doc.text(`Total Items: ${executionResults.summary.total}`, 20, 60);
      doc.text(`Successful: ${executionResults.summary.successful}`, 20, 70);
      doc.text(`Failed: ${executionResults.summary.failed}`, 20, 80);
      doc.text(`Success Rate: ${((executionResults.summary.successful / executionResults.summary.total) * 100).toFixed(1)}%`, 20, 90);
      
      // Table
      const tableData = executionResults.items.map(item => [
        item.rowNumber || '',
        item.barcode || '',
        item.quantity || '',
        item.status || '',
        item.location || '',
        item.emergency ? 'Emergency allocation' : item.error || ''
      ]);
      
      // Fallback method if autoTable is not available
      // First try regular autoTable approach
      try {
        // Try to use autoTable directly
        doc.autoTable({
          head: [['Row', 'Barcode', 'Quantity', 'Status', 'Location', 'Notes']],
          body: tableData,
          startY: 100,
          styles: { fontSize: 8 }
        });
      } catch (tableError) {
        console.warn('AutoTable plugin not working correctly, using fallback:', tableError);
        
        // Fallback to simple text-based table
        doc.setFontSize(10);
        doc.text("Table format not available - Raw Data:", 20, 110);
        let yPos = 120;
        tableData.forEach((row, i) => {
          const text = `Item ${i+1}: ${row.join(' | ')}`;
          const textWidth = doc.getStringUnitWidth(text) * 10 * 0.352778; // Approximate text width
          
          if (textWidth > 170) {
            // Text too wide, split it
            const lines = doc.splitTextToSize(text, 170);
            doc.text(lines, 20, yPos);
            yPos += 10 * lines.length;
          } else {
            doc.text(text, 20, yPos);
            yPos += 10;
          }
          
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
        });
      }
      
      doc.save(`PutAway_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError(`Failed to generate PDF: ${error.message}`);
      return false;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'Failed': return 'error';
      default: return 'default';
    }
  };

  // Effect to save history to Firestore when it changes - NO LONGER NEEDED
  // History is saved individually in addToHistory and other functions
  
  // Load history from Firestore when warehouse changes
  useEffect(() => {
    if (currentWarehouse?.id) {
      const loadHistory = async () => {
        try {
          const history = await historyService.getOperationHistory(
            currentWarehouse.id, 
            historyService.operationTypes.PUTAWAY
          );
          setExecutionHistory(history);
          console.log('📦 PutAway history loaded:', history.length, 'items');
        } catch (error) {
          console.error('Error loading putaway history:', error);
        }
      };
      
      loadHistory();
    }
  }, [currentWarehouse?.id]);

  // Function to add a new history item
  const addToHistory = async (results) => {
    const historyItem = {
      timestamp: new Date().toISOString(),
      warehouseId: currentWarehouse.id,
      warehouseName: currentWarehouse.name,
      fileName: uploadedFile?.name || 'Unknown file',
      totalItems: results.summary.total,
      successCount: results.summary.successful,
      failureCount: results.summary.failed,
      autoCreatedBins: results.summary.autoCreatedBins || 0,
      emergencyAllocations: results.summary.emergencyAllocations || 0,
      executionDetails: results, // Store the complete results object
      type: 'putaway' // Distinguish from pick operations
    };
    
    try {
      // Save to Firestore
      const savedItem = await historyService.saveOperationHistory(
        currentWarehouse.id,
        historyService.operationTypes.PUTAWAY,
        historyItem
      );
      
      // Add to local state (most recent first)
      const updatedHistory = [savedItem, ...executionHistory.slice(0, 19)]; // Keep max 20 items
      setExecutionHistory(updatedHistory);
      
      return savedItem;
    } catch (error) {
      console.error('Error saving putaway history:', error);
      showError('Failed to save operation history');
      
      // Still update local state even if Firestore fails
      const updatedHistory = [historyItem, ...executionHistory.slice(0, 19)];
      setExecutionHistory(updatedHistory);
      
      return historyItem;
    }
  };

  // Function to clear screen after execution
  const handleClearScreen = () => {
    setUploadedFile(null);
    setParsedData(null);
    setExecutionResults(null);
    setProgress(0);
    showSuccess('Screen cleared. You can start a new put-away operation.');
  };

  // Function to view history item details
  const handleViewHistoryItem = (historyItem) => {
    if (!historyItem) {
      showError('History item is not available');
      return;
    }
    
    setSelectedHistoryItem(historyItem);
    
    // Make sure executionDetails exists and has the required properties
    if (historyItem.executionDetails && 
        historyItem.executionDetails.items && 
        historyItem.executionDetails.summary) {
      setExecutionResults(historyItem.executionDetails);
    } else {
      console.error('History item has invalid execution details:', historyItem);
      showError('History data is corrupted or incomplete');
      // Create a minimal valid structure to prevent errors
      setExecutionResults({
        items: [],
        summary: {
          total: historyItem.totalItems || 0,
          successful: historyItem.successCount || 0,
          failed: historyItem.failureCount || 0,
          executedAt: historyItem.timestamp || historyItem.date,
          warehouse: historyItem.warehouseName || 'Unknown'
        }
      });
    }
  };

  // Function to delete a history item
  const handleDeleteHistoryItem = async (itemId) => {
    try {
      // Delete from Firestore
      await historyService.deleteOperationHistoryItem(currentWarehouse.id, itemId);
      
      // Update local state
      setExecutionHistory(prev => prev.filter(item => item.id !== itemId));
      
      if (selectedHistoryItem?.id === itemId) {
        setSelectedHistoryItem(null);
        setExecutionResults(null);
      }
      
      showSuccess('History item deleted successfully');
    } catch (error) {
      console.error('Error deleting history item:', error);
      showError('Failed to delete history item');
    }
  };

  // Function to clear all history
  const handleClearAllHistory = async () => {
    try {
      // Clear all history from Firestore
      await historyService.clearOperationHistory(
        currentWarehouse.id,
        historyService.operationTypes.PUTAWAY
      );
      
      // Update local state
      setExecutionHistory([]);
      setSelectedHistoryItem(null);
      
      if (!uploadedFile) {
        setExecutionResults(null);
      }
      
      showSuccess('All history cleared successfully');
    } catch (error) {
      console.error('Error clearing history:', error);
      showError('Failed to clear history');
    }
  };

  // Add state for rollback confirmation dialog
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [operationToRollback, setOperationToRollback] = useState({ historyItem: null, operationIndex: null });

  const openRollbackDialog = (historyItem, operationIndex) => {
    setOperationToRollback({ historyItem, operationIndex });
    setRollbackDialogOpen(true);
  };

  const handleRollbackConfirm = async () => {
    const { historyItem, operationIndex } = operationToRollback;
    setRollbackDialogOpen(false);
    await handleRollbackOperation(historyItem, operationIndex, true); // true means skip confirmation
  };

  // Add state for full operation rollback confirmation dialog
  const [fullRollbackDialogOpen, setFullRollbackDialogOpen] = useState(false);
  const [operationToFullRollback, setOperationToFullRollback] = useState(null);

  const openFullRollbackDialog = (historyItem) => {
    setOperationToFullRollback(historyItem);
    setFullRollbackDialogOpen(true);
  };

  const handleFullRollbackConfirm = async () => {
    if (!operationToFullRollback) return;
    
    setFullRollbackDialogOpen(false);
    setIsRollbackInProgress(true);
    
    try {
      // Get all operations that haven't been rolled back yet
      const pendingOperations = operationToFullRollback.executionDetails.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !item.rolledBack && item.status === 'Completed');
      
      // Process each operation
      const results = [];
      for (const { item, index } of pendingOperations) {
        try {
          await handleRollbackOperation(operationToFullRollback, index, true);
          results.push({ success: true, barcode: item.barcode, location: item.location });
        } catch (error) {
          console.error(`Error rolling back operation for ${item.barcode}:`, error);
          results.push({ 
            success: false, 
            barcode: item.barcode, 
            location: item.location,
            error: error.message || 'Unknown error'
          });
        }
      }
      
      // Show summary notification
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      
      if (failCount > 0) {
        showWarning(`Rolled back ${successCount} of ${results.length} operations. ${failCount} operations failed.`);
      } else if (successCount > 0) {
        showSuccess(`Successfully rolled back all ${successCount} operations.`);
      } else {
        showInfo('No operations were rolled back. They may have already been processed.');
      }
    } catch (error) {
      console.error('Error during full rollback:', error);
      showError(`Full rollback failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRollbackInProgress(false);
    }
  };

  if (!currentWarehouse) {
    return (
      <Alert severity="warning">
        Please select a warehouse first before proceeding with put-away operations.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Put Away Operations
      </Typography>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Upload an Excel file with barcode and quantity columns to execute put-away operations.
        </Typography>
        
        <ButtonGroup variant="outlined" size="small">
          <Tooltip title="View History">
            <Button
              startIcon={<HistoryIcon />}
              onClick={() => setShowHistory(!showHistory)}
              color={showHistory ? "primary" : "inherit"}
            >
              History
            </Button>
          </Tooltip>
          {executionResults && (
            <Tooltip title="Clear Screen">
              <Button 
                startIcon={<RefreshIcon />} 
                onClick={handleClearScreen}
                color="warning"
              >
                Clear
              </Button>
            </Tooltip>
          )}
        </ButtonGroup>
      </Box>
      
      {/* History Panel */}
      <Collapse in={showHistory} sx={{ mb: 3 }}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Put-Away History
              </Typography>
              {executionHistory.length > 0 && (
                <Button 
                  size="small" 
                  startIcon={<DeleteIcon />} 
                  color="error"
                  onClick={handleClearAllHistory}
                >
                  Clear All
                </Button>
              )}
            </Box>
            
            {executionHistory.length === 0 ? (
              <Alert severity="info">No history found. Complete a put-away operation to see it here.</Alert>
            ) : (
              <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>File</TableCell>
                      <TableCell>Items</TableCell>
                      <TableCell>Success</TableCell>
                      <TableCell>Auto-Created</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {executionHistory.map(historyItem => (
                      <TableRow 
                        key={historyItem.id}
                        selected={selectedHistoryItem?.id === historyItem.id}
                        hover
                      >
                        <TableCell>{new Date(historyItem.timestamp || historyItem.date).toLocaleString()}</TableCell>
                        <TableCell>{historyItem.fileName}</TableCell>
                        <TableCell>{historyItem.totalItems}</TableCell>
                        <TableCell>
                          <Chip 
                            size="small"
                            label={`${historyItem.successCount}/${historyItem.totalItems}`}
                            color={historyItem.successCount === historyItem.totalItems ? "success" : "warning"}
                          />
                        </TableCell>
                        <TableCell>
                          {historyItem.autoCreatedBins > 0 && (
                            <Chip 
                              size="small"
                              label={historyItem.autoCreatedBins}
                              color="info"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <ButtonGroup size="small">
                            <Tooltip title="View Details">
                              <IconButton 
                                size="small" 
                                onClick={() => openHistoryDetailDialog(historyItem)}
                                color="info"
                              >
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => handleDeleteHistoryItem(historyItem.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </ButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Collapse>

      {/* Upload Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            1. Upload Excel File
          </Typography>
          
          <Box sx={{ mb: 2 }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="excel-upload"
            />
            <label htmlFor="excel-upload">
              <Button
                component="span"
                variant="contained"
                startIcon={<UploadIcon />}
                sx={{ mr: 2 }}
              >
                Upload Excel File
              </Button>
            </label>
            
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}
            >
              Download Template
            </Button>
          </Box>

          {uploadedFile && (
            <Alert severity="info" sx={{ mb: 2 }}>
              File uploaded: {uploadedFile.name}
            </Alert>
          )}

          {parsedData && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Parsed Data Summary:
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Chip label={`${parsedData.totalItems} Items`} color="primary" />
                <Chip label={`${parsedData.errors.length} Errors`} color={parsedData.errors.length > 0 ? 'error' : 'success'} />
              </Box>
              
              {parsedData.errors.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Errors found: {parsedData.errors.join(', ')}
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Execution Section */}
      {parsedData && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              2. Execute Put-Away Operations
            </Typography>
            
            <Button
              variant="contained"
              startIcon={<ExecuteIcon />}
              onClick={handleExecutePutaway}
              disabled={executing || !parsedData || parsedData.items.length === 0}
              sx={{ mb: 2 }}
            >
              {executing ? 'Executing...' : 'Execute Put-Away'}
            </Button>

            {executing && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Processing items... {progress.toFixed(0)}%
                </Typography>
                <LinearProgress variant="determinate" value={progress} />
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {executionResults && executionResults.summary && executionResults.items && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" gutterBottom>
                3. Execution Results & Reports
              </Typography>
              
              {selectedHistoryItem && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip 
                    icon={<HistoryIcon />} 
                    label={`Viewing History: ${new Date(selectedHistoryItem.timestamp || selectedHistoryItem.date).toLocaleString()}`}
                    color="secondary"
                    sx={{ mr: 1 }}
                  />
                  <Button 
                    size="small" 
                    startIcon={<CloseIcon />}
                    onClick={() => {
                      setSelectedHistoryItem(null);
                      setExecutionResults(null);
                    }}
                  >
                    Close
                  </Button>
                </Box>
              )}
            </Box>

            {/* Summary */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
              <Chip label={`Total: ${executionResults.summary.total}`} />
              <Chip label={`Success: ${executionResults.summary.successful}`} color="success" />
              {executionResults.summary.failed > 0 ? (
                <Chip label={`Failed: ${executionResults.summary.failed}`} color="error" />
              ) : null}
              <Chip 
                label={`Success Rate: ${((executionResults.summary.successful / executionResults.summary.total) * 100).toFixed(1)}%`} 
                color="primary" 
              />
              {executionResults.summary.autoCreatedBins > 0 && (
                <Chip 
                  color="info" 
                  icon={<SuccessIcon />}
                  label={`Auto-Created Bins: ${executionResults.summary.autoCreatedBins}`} 
                />
              )}
              {executionResults.summary.emergencyAllocations > 0 && (
                <Chip 
                  color="warning" 
                  icon={<SuccessIcon />}
                  label={`Emergency Allocations: ${executionResults.summary.emergencyAllocations}`} 
                />
              )}
            </Box>

            {/* Report Generation Buttons */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Generate Reports:
              </Typography>
              <ButtonGroup variant="outlined">
                <Button
                  startIcon={<PrintIcon />}
                  onClick={() => handleGenerateReport('print')}
                >
                  Print
                </Button>
                {/* <Button
                  startIcon={<PdfIcon />}
                  onClick={() => handleGenerateReport('pdf')}
                >
                  PDF
                </Button> */}
                <Button
                  startIcon={<ExcelIcon />}
                  onClick={() => handleGenerateReport('excel')}
                >
                  Excel Report
                </Button>
              </ButtonGroup>
            </Box>

            {/* Results Table */}
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>Barcode</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell>Auto-Created</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {executionResults.items.slice(0, 10).map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.barcode}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.status}
                          color={getStatusColor(item.status)}
                          size="small"
                          icon={item.status === 'Completed' ? <SuccessIcon /> : <ErrorIcon />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {item.location || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color={item.emergency ? 'warning' : 'error'}>
                          {item.emergency ? 'Emergency allocation' : item.error || ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {item.autoCreatedBins > 0 && (
                          <Chip 
                            label={`${item.autoCreatedBins} Bins`}
                            color="info"
                            size="small"
                          />
                        )}
                      </TableCell>
                      {/* <TableCell>
                        {item.status !== 'Failed' && !item.rolledBack && (
                          <Tooltip title="Rollback Put-Away Operation">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => openRollbackDialog(selectedHistoryItem, index)}
                              disabled={isRollbackInProgress}
                            >
                              <UndoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {item.rolledBack && (
                          <Chip 
                            label="Rolled Back" 
                            size="small" 
                            color="default"
                            icon={<UndoIcon />} 
                          />
                        )}
                      </TableCell> */}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {executionResults.items.length > 10 && (
              <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
                Showing first 10 results. Download full report for complete data.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Section */}
      {/* <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Execution History
          </Typography>
          
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={async () => {
              try {
                const history = await historyService.getOperationHistory(
                  currentWarehouse.id, 
                  historyService.operationTypes.PUTAWAY
                );
                setExecutionHistory(history);
                showSuccess('History refreshed successfully');
              } catch (error) {
                console.error('Error refreshing history:', error);
                showError('Failed to refresh history');
              }
            }}
            sx={{ mb: 2 }}
          >
            Refresh History
          </Button>

          <Divider sx={{ mb: 2 }} />

          {executionHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No execution history found. Execute a put-away operation to generate history.
            </Typography>
          ) : (
            <List>
              {executionHistory.map((item) => (
                <ListItem
                  key={item.id}
                  secondaryAction={
                    <Box>
                      <IconButton
                        edge="end"
                        aria-label="view"
                        onClick={() => handleViewHistoryItem(item)}
                      >
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDeleteHistoryItem(item.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemIcon>
                    <HistoryIcon color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={`Executed on ${new Date(item.timestamp || item.date).toLocaleString()} - ${item.successCount} successful, ${item.failureCount} failed`}
                    secondary={`Warehouse: ${item.warehouseName} | File: ${item.fileName}`}
                  />
                </ListItem>
              ))}
            </List>
          )} */}

          {/* Clear All History Button */}
          {/* {executionHistory.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleClearAllHistory}
              sx={{ mt: 2 }}
            >
              Clear All History
            </Button>
          )}
        </CardContent>
      </Card> */}

      {/* History Details Dialog */}
      <Dialog
        open={historyDetailOpen}
        onClose={closeHistoryDetailDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedHistoryItem && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">
                Put-Away History Details
              </Typography>
              <Chip 
                label={new Date(selectedHistoryItem.timestamp || selectedHistoryItem.date).toLocaleString()}
                color="primary"
              />
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedHistoryItem && selectedHistoryItem.executionDetails && selectedHistoryItem.executionDetails.items ? (
            <Box>
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Execution Summary
                </Typography>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" scope="row">Date & Time</TableCell>
                        <TableCell>{new Date(selectedHistoryItem.timestamp || selectedHistoryItem.date).toLocaleString()}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">File Name</TableCell>
                        <TableCell>{selectedHistoryItem.fileName}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Warehouse</TableCell>
                        <TableCell>{selectedHistoryItem.warehouseName}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Total Items</TableCell>
                        <TableCell>{selectedHistoryItem.totalItems}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Success Rate</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Chip 
                              label={`${selectedHistoryItem.successCount}/${selectedHistoryItem.totalItems}`}
                              color={selectedHistoryItem.successCount === selectedHistoryItem.totalItems ? "success" : "warning"}
                              size="small"
                              sx={{ mr: 1 }}
                            />
                            {((selectedHistoryItem.successCount / selectedHistoryItem.totalItems) * 100).toFixed(1)}%
                          </Box>
                        </TableCell>
                      </TableRow>
                      {selectedHistoryItem.autoCreatedBins > 0 && (
                        <TableRow>
                          <TableCell component="th" scope="row">Auto-Created Bins</TableCell>
                          <TableCell>{selectedHistoryItem.autoCreatedBins}</TableCell>
                        </TableRow>
                      )}
                      {selectedHistoryItem.emergencyAllocations > 0 && (
                        <TableRow>
                          <TableCell component="th" scope="row">Emergency Allocations</TableCell>
                          <TableCell>{selectedHistoryItem.emergencyAllocations}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider sx={{ my: 3 }} />

              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Item Details
                </Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Barcode</TableCell>
                        <TableCell>Quantity</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Location</TableCell>
                        <TableCell>Notes</TableCell>
                        <TableCell>Auto-Created</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedHistoryItem?.executionDetails?.items?.map((item, index) => (
                        <TableRow key={index} sx={item.rolledBack ? { backgroundColor: 'rgba(255,0,0,0.05)' } : {}}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{item.barcode}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            <Chip
                              label={item.status}
                              color={getStatusColor(item.status)}
                              size="small"
                              icon={item.status === 'Completed' ? <SuccessIcon /> : <ErrorIcon />}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontFamily="monospace">
                              {item.location || 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color={item.emergency ? 'warning' : 'error'}>
                              {item.emergency ? 'Emergency allocation' : item.error || ''}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {item.autoCreatedBins > 0 && (
                              <Chip 
                                label={`${item.autoCreatedBins} Bins`}
                                color="info"
                                size="small"
                              />
                            )}
                          </TableCell>
                          {/* <TableCell>                        {item.status !== 'Failed' && !item.rolledBack && (
                          <Tooltip title="Rollback Put-Away Operation">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => openRollbackDialog(selectedHistoryItem, index)}
                              disabled={isRollbackInProgress}
                            >
                              <UndoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                            {item.rolledBack && (
                              <Chip 
                                label="Rolled Back" 
                                size="small" 
                                color="default"
                                icon={<UndoIcon />} 
                              />
                            )}
                          </TableCell> */}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          ) : (
            <Alert severity="info">No detailed history information available.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          {selectedHistoryItem && (
            <>
              {/* <Button
                onClick={() => openFullRollbackDialog(selectedHistoryItem)}
                color="warning"
                startIcon={<UndoIcon />}
                disabled={isRollbackInProgress}
              >
                Rollback Entire Operation
              </Button> */}
              <Button
                onClick={() => handleViewHistoryItem(selectedHistoryItem)}
                color="primary"
                startIcon={<VisibilityIcon />}
              >
                Load to Screen
              </Button>
            </>
          )}
          <Button
            onClick={closeHistoryDetailDialog}
            color="primary"
            variant="contained"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={rollbackDialogOpen} onClose={() => setRollbackDialogOpen(false)}>
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <UndoIcon color="warning" sx={{ mr: 1 }} />
            Confirm Rollback Operation
          </Box>
        </DialogTitle>
        <DialogContent>
          {operationToRollback.historyItem && operationToRollback.operationIndex !== null && (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This action will remove the items from the bin and cannot be undone.
              </Alert>
              
              <Typography variant="subtitle1" gutterBottom>
                Operation details:
              </Typography>
              
              {(() => {
                const operation = operationToRollback.historyItem.executionDetails.items[operationToRollback.operationIndex];
                return (
                  <Box sx={{ mb: 2 }}>
                    <Typography><strong>SKU/Barcode:</strong> {operation.barcode}</Typography>
                    <Typography><strong>Quantity:</strong> {operation.quantity}</Typography>
                    <Typography><strong>Location:</strong> {operation.location}</Typography>
                    <Typography><strong>Date:</strong> {new Date(operation.executedAt || operationToRollback.historyItem.timestamp).toLocaleString()}</Typography>
                  </Box>
                );
              })()}
              
              <Typography variant="body2" color="text.secondary">
                Rollback will update inventory levels and bin status. The quantity will be removed from the bin.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRollbackDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<UndoIcon />}
            onClick={handleRollbackConfirm}
            disabled={isRollbackInProgress}
          >
            {isRollbackInProgress ? "Processing..." : "Rollback Operation"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Rollback Confirmation Dialog */}
      <Dialog open={fullRollbackDialogOpen} onClose={() => setFullRollbackDialogOpen(false)}>
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <UndoIcon color="warning" sx={{ mr: 1 }} />
            Confirm Rollback Entire Operation
          </Box>
        </DialogTitle>
        <DialogContent>
          {operationToFullRollback && (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This action will rollback ALL items in this put-away operation and cannot be undone.
              </Alert>
              
              <Typography variant="subtitle1" gutterBottom>
                Operation details:
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography><strong>Date:</strong> {new Date(operationToFullRollback.timestamp || operationToFullRollback.date).toLocaleString()}</Typography>
                <Typography><strong>File:</strong> {operationToFullRollback.fileName}</Typography>
                <Typography><strong>Total Items:</strong> {operationToFullRollback.totalItems}</Typography>
                <Typography><strong>Items to rollback:</strong> {
                  operationToFullRollback.executionDetails.items
                    .filter(item => !item.rolledBack && item.status === 'Completed')
                    .length
                }</Typography>
              </Box>
              
              <Typography variant="body2" color="text.secondary">
                Rollback will update inventory levels and bin status for all items. Quantities will be removed from their respective bins.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFullRollbackDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<UndoIcon />}
            onClick={handleFullRollbackConfirm}
            disabled={isRollbackInProgress}
          >
            {isRollbackInProgress ? "Processing..." : "Rollback All Operations"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
