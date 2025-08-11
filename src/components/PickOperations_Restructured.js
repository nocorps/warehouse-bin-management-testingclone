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
  ListItemText,
  ListItemIcon,
  ListItemButton
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
  Warning as WarningIcon,
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
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { historyService } from '../services/historyService';

export default function PickOperations() {
  const { currentWarehouse } = useWarehouse();
  const { showSuccess, showError } = useNotification();
  
  const [uploadedFile, setUploadedFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [executionResults, setExecutionResults] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [isRollbackInProgress, setIsRollbackInProgress] = useState(false);

  // Load history from Firestore when warehouse changes
  useEffect(() => {
    if (currentWarehouse?.id) {
      const loadHistory = async () => {
        try {
          const history = await historyService.getOperationHistory(
            currentWarehouse.id, 
            historyService.operationTypes.PICK
          );
          setExecutionHistory(history);
          console.log('📋 Pick history loaded:', history.length, 'items');
        } catch (error) {
          console.error('Error loading pick history:', error);
        }
      };
      
      loadHistory();
    }
  }, [currentWarehouse?.id]);

  const openHistoryDetailDialog = (historyItem) => {
    setSelectedHistoryItem(historyItem);
    setHistoryDetailOpen(true);
  };

  const closeHistoryDetailDialog = () => {
    setHistoryDetailOpen(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Parse Excel file
      const data = await excelService.parsePickFile(file);
      
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

  // Helper function to remove undefined values recursively from an object
  const sanitizeForFirestore = (obj) => {
    if (obj === null || obj === undefined) {
      return null;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== null && item !== undefined);
    }
    
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
          const sanitizedValue = sanitizeForFirestore(value);
          if (sanitizedValue !== undefined && sanitizedValue !== null) {
            sanitized[key] = sanitizedValue;
          }
        }
      }
      return sanitized;
    }
    
    // Convert undefined to null for Firestore
    if (obj === undefined) {
      return null;
    }
    
    return obj;
  };

  const addToHistory = async (results) => {
    const historyItem = {
      timestamp: new Date().toISOString(),
      fileName: uploadedFile?.name || 'Manual Pick',
      totalItems: results.summary?.total || 0,
      successCount: results.summary?.successful || 0,
      partialCount: results.summary?.partial || 0,
      failedCount: results.summary?.failed || 0,
      warehouse: currentWarehouse?.name || 'Unknown',
      warehouseId: currentWarehouse?.id || 'unknown',
      warehouseName: currentWarehouse?.name || 'Unknown',
      executionDetails: results || {}, // Store the full execution details
      type: 'pick', // Distinguish from put-away operations
      mixedBarcodeStrategy: true,
      operationType: 'pick'
    };

    try {
      // Sanitize the history item to remove undefined values
      const sanitizedHistoryItem = sanitizeForFirestore(historyItem);
      
      console.log('📝 Saving sanitized history item:', JSON.stringify(sanitizedHistoryItem, null, 2));
      
      // Save to Firestore - let Firestore generate the ID automatically
      const savedItem = await historyService.saveOperationHistory(
        currentWarehouse.id,
        historyService.operationTypes.PICK,
        sanitizedHistoryItem
      );
      
      // Add to local state (most recent first)
      const updatedHistory = [savedItem, ...executionHistory];
      setExecutionHistory(updatedHistory);
      
      return savedItem;
    } catch (error) {
      console.error('Error saving pick history:', error);
      showError('Failed to save operation history');
      
      // Still update local state even if Firestore fails
      const updatedHistory = [historyItem, ...executionHistory];
      setExecutionHistory(updatedHistory);
      
      return historyItem;
    }
  };
  
  const handleExecutePick = async () => {
    if (!parsedData || parsedData.items.length === 0) {
      showError('No items to process');
      return;
    }

    setExecuting(true);
    setProgress(0);
    const results = [];

    try {
      console.log('🔍 PHASE 1: Checking availability for ALL items before execution...');
      
      // PHASE 1: Check availability for ALL items first (MIXED BARCODE STRATEGY)
      const availabilityChecks = [];
      const unavailableItems = [];
      
      setProgress(10); // Initial progress for availability check
      
      for (let i = 0; i < parsedData.items.length; i++) {
        const item = parsedData.items[i];
        
        // Ensure item has required properties with defaults
        const safeItem = {
          barcode: item?.barcode || 'unknown',
          quantity: item?.quantity || 0,
          ...item // Keep all other properties
        };
        
        try {
          console.log(`📋 Checking availability for ${safeItem.barcode} (${safeItem.quantity} units)...`);
          
          // Find product locations for picking using warehouseOperations service
          const pickingResult = await warehouseOperations.findProductsForPicking(
            currentWarehouse.id,
            safeItem.barcode,
            parseInt(safeItem.quantity)
          );
          
          if (!pickingResult || !pickingResult.isFullyAvailable) {
            // Item not fully available - mark as unavailable
            unavailableItems.push({
              ...safeItem,
              available: pickingResult?.totalAvailable || 0,
              shortfall: parseInt(safeItem.quantity) - (pickingResult?.totalAvailable || 0)
            });
            
            console.log(`❌ ${safeItem.barcode}: Insufficient quantity. Required: ${safeItem.quantity}, Available: ${pickingResult?.totalAvailable || 0}`);
          } else {
            // Item fully available - store for execution
            availabilityChecks.push({
              item: safeItem,
              pickingResult
            });
            
            console.log(`✅ ${safeItem.barcode}: Fully available (${pickingResult.totalAvailable} units)`);
          }
        } catch (error) {
          console.error(`Error checking availability for ${safeItem.barcode}:`, error);
          unavailableItems.push({
            ...safeItem,
            available: 0,
            shortfall: parseInt(safeItem.quantity),
            error: error.message || 'Unknown error'
          });
        }
      }
      
      // If ANY item is not available, STOP execution completely
      if (unavailableItems.length > 0) {
        console.log('❌ EXECUTION STOPPED: One or more items not fully available');
        console.log('🧠 MIXED BARCODE STRATEGY: Checked both primary and mixed bin contents for availability');
        
        // Create error results for all items
        for (const originalItem of parsedData.items) {
          const safeOriginalItem = {
            barcode: originalItem?.barcode || 'unknown',
            quantity: originalItem?.quantity || 0,
            ...originalItem
          };
          
          const unavailableItem = unavailableItems.find(ui => ui.barcode === safeOriginalItem.barcode);
          
          if (unavailableItem) {
            results.push({
              ...safeOriginalItem,
              status: 'Failed',
              error: unavailableItem.error || `Insufficient quantity available (searched all bins including mixed contents). Required: ${safeOriginalItem.quantity}, Available: ${unavailableItem.available}`,
              location: 'Unavailable',
              locations: 'Unavailable',
              pickedBins: [],
              availableQty: unavailableItem.available || 0,
              pickedQty: 0,
              shortfall: unavailableItem.shortfall || 0,
              mixedBins: 0,
              fifoCompliant: false
            });
          } else {
            // Item was available but we're not executing due to other unavailable items
            results.push({
              ...safeOriginalItem,
              status: 'Failed',
              error: `Pick operation cancelled due to unavailable items in the same batch (Mixed Barcode Strategy: all-or-nothing execution)`,
              location: 'Cancelled',
              locations: 'Cancelled',
              pickedBins: [],
              availableQty: 0,
              pickedQty: 0,
              shortfall: 0,
              mixedBins: 0,
              fifoCompliant: false
            });
          }
        }
        
        // Show detailed error message
        const errorDetails = unavailableItems.map(item => 
          `${item.barcode}: Required ${item.quantity}, Available ${item.available} (Short ${item.shortfall})`
        ).join('; ');
        
        showError(`🔍 Mixed Barcode Pick Check Failed! Unavailable items: ${errorDetails}`);
        
        // Set execution results and exit
        setProgress(100);
        const executionResult = {
          items: results || [],
          summary: {
            total: results?.length || 0,
            successful: 0,
            partial: 0,
            failed: results?.length || 0,
            executedAt: new Date().toISOString(),
            warehouse: currentWarehouse?.name || 'Unknown',
            warehouseId: currentWarehouse?.id || 'unknown',
            mixedBins: 0,
            mixedBarcodeStrategy: true,
            availabilityCheckFailed: true,
            unavailableItems: unavailableItems?.length || 0,
            operationType: 'pick'
          }
        };
        
        setExecutionResults(executionResult);
        addToHistory(executionResult);
        return;
      }
      
      console.log('✅ PHASE 1 COMPLETE: All items are fully available. Proceeding with FIFO execution...');
      console.log('🧠 MIXED BARCODE STRATEGY: Pick plans will be recalculated before each execution to ensure accuracy');
      console.log('⚠️ NOTE: Some picks may become partial if multiple SKUs share the same bins (mixed bins)');
      setProgress(25);
      
      // PHASE 2: Execute picks for all available items with FIFO logic
      console.log('🚀 PHASE 2: Executing FIFO picks for all items...');
      
      for (let i = 0; i < availabilityChecks.length; i++) {
        const { item: originalItem } = availabilityChecks[i];
        const safeItem = {
          barcode: originalItem?.barcode || 'unknown',
          quantity: originalItem?.quantity || 0,
          ...originalItem
        };
        
        const progressPercent = 25 + ((i / availabilityChecks.length) * 70); // 25% to 95%
        setProgress(progressPercent);

        try {
          console.log(`📦 Executing FIFO pick for ${safeItem.barcode} (${safeItem.quantity} units)...`);
          
          // CRITICAL FIX: Recalculate pick plan just before execution
          // This ensures we have current bin quantities after previous picks
          const freshPickingResult = await warehouseOperations.findProductsForPicking(
            currentWarehouse.id,
            safeItem.barcode,
            parseInt(safeItem.quantity)
          );
          
          // Check if the item is still fully available after previous picks
          if (!freshPickingResult || !freshPickingResult.isFullyAvailable) {
            // If not fully available, check if we can pick partial quantity
            const availableQuantity = freshPickingResult?.totalAvailable || 0;
            
            if (availableQuantity === 0) {
              throw new Error(`SKU ${safeItem.barcode} is no longer available. All bins containing this SKU were affected by previous picks in this batch operation.`);
            } else {
              console.warn(`⚠️ SKU ${safeItem.barcode} partially available due to shared bins. Required: ${safeItem.quantity}, Available: ${availableQuantity}. Attempting partial pick...`);
              
              // Update the pick plan to only pick what's available
              const partialPickingResult = await warehouseOperations.findProductsForPicking(
                currentWarehouse.id,
                safeItem.barcode,
                availableQuantity
              );
              
              if (!partialPickingResult || !partialPickingResult.isFullyAvailable) {
                throw new Error(`SKU ${safeItem.barcode} availability changed during partial pick calculation. Required: ${availableQuantity}, Available: ${partialPickingResult?.totalAvailable || 0}.`);
              }
              
              // Execute partial pick
              const pickedItems = partialPickingResult.pickPlan.map(plan => ({
                binId: plan.id,
                quantity: plan.pickQuantity,
                sku: safeItem.barcode
              }));
              
              // Create temporary pick task ID
              const tempTaskId = `excel-pick-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
              
              // Execute the pick with FIFO compliance
              const pickExecutionResult = await warehouseOperations.executePick(
                currentWarehouse.id,
                tempTaskId,
                pickedItems
              );
              
              if (!pickExecutionResult.success) {
                throw new Error(pickExecutionResult.message || 'Failed to execute partial pick');
              }
              
              // Add partial result
              results.push({
                ...safeItem,
                status: 'Partial',
                pickedQuantity: availableQuantity,
                requestedQuantity: parseInt(safeItem.quantity),
                shortfall: parseInt(safeItem.quantity) - availableQuantity,
                location: partialPickingResult.pickPlan?.map(p => p.code || 'Unknown').join(', ') || 'Unknown',
                locations: partialPickingResult.pickPlan?.map(p => p.code || 'Unknown').join(', ') || 'Unknown',
                pickedBins: partialPickingResult.pickPlan?.map(p => ({
                  binId: p.id || 'unknown',
                  binCode: p.code || 'unknown',
                  rackCode: p.rackCode || 'unknown',
                  quantity: p.pickQuantity || 0,
                  fifoReason: p.fifoReason || 'FIFO',
                  pickOrder: p.pickOrder || 0,
                  isMixed: p.isMixed || false,
                  originalBinSKU: p.originalBinSKU || safeItem.barcode
                })) || [],
                executedAt: new Date().toISOString(),
                availableQty: availableQuantity,
                pickedQty: availableQuantity,
                mixedBins: partialPickingResult.pickPlan?.filter(p => p.isMixed).length || 0,
                fifoCompliant: true,
                note: `Partial pick due to shared bins with other SKUs. Earlier picks in this batch affected bin availability. Picked ${availableQuantity} of ${safeItem.quantity} requested.`
              });
              
              console.log(`✅ Successfully executed partial pick for ${safeItem.barcode}: ${availableQuantity}/${safeItem.quantity} units from ${partialPickingResult.pickPlan.length} bin(s)`);
              continue; // Move to next item
            }
          }
          
          // Execute the pick operations for this item using fresh FIFO pick plan
          const pickedItems = freshPickingResult.pickPlan.map(plan => ({
            binId: plan.id,
            quantity: plan.pickQuantity,
            sku: safeItem.barcode
          }));
          
          // Create temporary pick task ID
          const tempTaskId = `excel-pick-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          
          // Execute the pick with FIFO compliance
          const pickExecutionResult = await warehouseOperations.executePick(
            currentWarehouse.id,
            tempTaskId,
            pickedItems
          );
          
          if (!pickExecutionResult.success) {
            throw new Error(pickExecutionResult.message || 'Failed to execute pick');
          }
          
          // Add successful result with mixed barcode support and FIFO details
          results.push({
            ...safeItem,
            status: 'Completed',
            location: freshPickingResult.pickPlan?.map(p => p.code || 'Unknown').join(', ') || 'Unknown',
            locations: freshPickingResult.pickPlan?.map(p => p.code || 'Unknown').join(', ') || 'Unknown',
            pickedBins: freshPickingResult.pickPlan?.map(p => ({
              binId: p.id || 'unknown',
              binCode: p.code || 'unknown',
              rackCode: p.rackCode || 'unknown',
              quantity: p.pickQuantity || 0,
              fifoReason: p.fifoReason || 'FIFO',
              pickOrder: p.pickOrder || 0,
              isMixed: p.isMixed || false,
              originalBinSKU: p.originalBinSKU || safeItem.barcode
            })) || [],
            executedAt: new Date().toISOString(),
            availableQty: freshPickingResult.totalAvailable || 0,
            pickedQty: parseInt(safeItem.quantity) || 0,
            mixedBins: freshPickingResult.pickPlan?.filter(p => p.isMixed).length || 0,
            fifoCompliant: true
          });
          
          console.log(`✅ Successfully picked ${safeItem.barcode} from ${freshPickingResult.pickPlan.length} bin(s) using FIFO logic`);
          
          // Small delay to show progress
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (pickError) {
          console.error(`Error executing pick for ${safeItem.barcode}:`, pickError);
          
          // For execution errors, we still need to recalculate current availability
          try {
            const errorPickingResult = await warehouseOperations.findProductsForPicking(
              currentWarehouse.id,
              safeItem.barcode,
              parseInt(safeItem.quantity)
            );
            
            results.push({
              ...safeItem,
              status: 'Failed',
              error: pickError.message || 'Failed to execute pick',
              location: errorPickingResult.pickPlan?.map(p => p.code || 'Unknown').join(', ') || 'Unknown',
              locations: errorPickingResult.pickPlan?.map(p => p.code || 'Unknown').join(', ') || 'Unknown',
              pickedBins: [],
              availableQty: errorPickingResult.totalAvailable || 0,
              pickedQty: 0,
              mixedBins: 0,
              fifoCompliant: false
            });
          } catch (secondError) {
            // Fallback if even the error check fails
            results.push({
              ...safeItem,
              status: 'Failed',
              error: pickError.message || 'Failed to execute pick',
              location: 'Unknown',
              locations: 'Unknown',
              pickedBins: [],
              availableQty: 0,
              pickedQty: 0,
              mixedBins: 0,
              fifoCompliant: false
            });
          }
        }
      }

      setProgress(100);
      const executionResult = {
        items: results || [],
        summary: {
          total: results?.length || 0,
          successful: results?.filter(r => r.status === 'Completed').length || 0,
          partial: results?.filter(r => r.status === 'Partial').length || 0,
          failed: results?.filter(r => r.status === 'Failed').length || 0,
          executedAt: new Date().toISOString(),
          warehouse: currentWarehouse?.name || 'Unknown',
          warehouseId: currentWarehouse?.id || 'unknown',
          mixedBins: results?.reduce((sum, r) => sum + (r.mixedBins || 0), 0) || 0,
          mixedBarcodeStrategy: true,
          operationType: 'pick'
        }
      };
      
      setExecutionResults(executionResult);
      
      // Add to history
      addToHistory(executionResult);

      const successCount = results.filter(r => r.status === 'Completed').length;
      const partialCount = results.filter(r => r.status === 'Partial').length;
      showSuccess(`Pick completed! ${successCount} full picks, ${partialCount} partial picks.`);

    } catch (error) {
      showError(`Execution failed: ${error.message}`);
    } finally {
      setExecuting(false);
      setProgress(0);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await excelService.generatePickTemplate();
      showSuccess('Template downloaded successfully');
    } catch (error) {
      showError('Error downloading template');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Success':
        return 'success';
      case 'Partial':
        return 'warning';
      case 'Failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const generateExcelReport = async () => {
    try {
      if (!executionResults || !executionResults.summary || !executionResults.items) {
        showError('No execution results to export');
        return false;
      }
      
      await excelService.generatePickReport(executionResults);
      return true;
    } catch (error) {
      console.error('Error generating Excel report:', error);
      showError('Failed to generate Excel report: ' + error.message);
      return false;
    }
  };

  const generatePDFReport = async () => {
    try {
      if (!executionResults || !executionResults.summary || !executionResults.items) {
        showError('No execution results to export');
        return false;
      }
      
      // Create PDF document
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(18);
      doc.text('Pick Operation Report', 14, 20);
      
      // Subtitle with date and warehouse
      doc.setFontSize(12);
      doc.text(`Warehouse: ${executionResults.summary.warehouse}`, 14, 30);
      doc.text(`Date: ${new Date(executionResults.summary.executedAt).toLocaleString()}`, 14, 37);
      
      // Summary section
      doc.setFontSize(14);
      doc.text('Summary', 14, 47);
      
      const summaryData = [
        ['Total Items', executionResults.summary.total.toString()],
        ['Successful', executionResults.summary.successful.toString()],
        ['Partial', executionResults.summary.partial.toString()],
        ['Failed', executionResults.summary.failed.toString()],
        ['Success Rate', `${((executionResults.summary.successful / executionResults.summary.total) * 100).toFixed(1)}%`]
      ];
      
      doc.autoTable({
        startY: 50,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        margin: { top: 50 }
      });
      
      // Details section
      doc.setFontSize(14);
      doc.text('Details', 14, doc.autoTable.previous.finalY + 10);
      
      const detailsData = executionResults.items.map((item, index) => [
        index + 1,
        item.barcode,
        item.quantity,
        item.status,
        item.location || 'N/A',
        item.pickedQty || 0,
        item.availableQty || 0
      ]);
      
      doc.autoTable({
        startY: doc.autoTable.previous.finalY + 13,
        head: [['#', 'SKU', 'Requested', 'Status', 'Location', 'Picked Qty', 'Available Qty']],
        body: detailsData,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        margin: { top: 50 }
      });
      
      doc.save('pick_operation_report.pdf');
      return true;
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError('Failed to generate PDF report: ' + error.message);
      return false;
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
          await printService.printSimplePickReport(executionResults);
          showSuccess('Report sent to printer');
          break;
        
        default:
          showError('Unknown format');
      }
    } catch (error) {
      showError(`Failed to generate report: ${error.message}`);
    }
  };

  const handleHistoryToggle = () => {
    setShowHistory(prev => !prev);
  };

  const handleRollback = async (historyItem) => {
    // Show confirmation dialog
    const confirmMessage = `Are you sure you want to rollback this pick operation?\n\nOperation: ${historyItem.fileName}\nItems: ${historyItem.totalItems}\nExecuted: ${new Date(historyItem.timestamp).toLocaleString()}\n\nThis action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return; // User cancelled
    }

    setIsRollbackInProgress(true);
    try {
      // Note: This function rollbacks the entire operation, not individual items
      // For individual items, use handleRollbackOperation instead
      
      // Update state to mark as rolled back
      const updatedItem = { ...historyItem, status: 'rolled_back' };
      const updatedHistory = executionHistory.map(item => 
        item.id === historyItem.id ? updatedItem : item
      );
      
      setExecutionHistory(updatedHistory);
      
      // Update history item in Firestore
      try {
        await historyService.updateOperationHistoryItem(
          currentWarehouse.id,
          historyItem.id,
          { status: 'rolled_back' }
        );
      } catch (updateError) {
        console.warn('Failed to update history item status in Firestore:', updateError);
        // Continue with local update even if Firestore update fails
      }
      
      showSuccess('Pick operation marked as rolled back');
    } catch (error) {
      showError(`Rollback failed: ${error.message}`);
    } finally {
      setIsRollbackInProgress(false);
    }
  };
  
  const handleDeleteHistoryItem = async (id) => {
    try {
      // Delete from Firestore
      await historyService.deleteOperationHistoryItem(currentWarehouse.id, id);
      
      // Update local state
      const updatedHistory = executionHistory.filter(item => item.id !== id);
      setExecutionHistory(updatedHistory);
      
      // If currently viewing this item, clear it
      if (selectedHistoryItem?.id === id) {
        setSelectedHistoryItem(null);
        setExecutionResults(null);
      }
      
      showSuccess("History item deleted successfully");
    } catch (error) {
      console.error('Error deleting history item:', error);
      showError('Failed to delete history item');
    }
  };
  
  const handleClearAllHistory = async () => {
    try {
      // Clear all history from Firestore
      await historyService.clearOperationHistory(
        currentWarehouse.id,
        historyService.operationTypes.PICK
      );
      
      // Update local state
      setExecutionHistory([]);
      setSelectedHistoryItem(null);
      
      showSuccess("All history cleared successfully");
    } catch (error) {
      console.error('Error clearing history:', error);
      showError('Failed to clear history');
    }
  };
  
  const handleClearScreen = () => {
    setExecutionResults(null);
    setSelectedHistoryItem(null);
  };

  const handleRollbackOperation = async (historyItem, operationIndex) => {
    // Show confirmation dialog
    const operation = historyItem.executionDetails.items[operationIndex];
    const confirmMessage = `Are you sure you want to rollback this pick operation?\n\nSKU: ${operation.barcode}\nQuantity: ${operation.quantity}\nLocation: ${operation.location}\n\nThis action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return; // User cancelled
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
        operationType: 'pick',
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
      
      // Execute the rollback
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
      try {
        await historyService.updateOperationHistoryItem(
          currentWarehouse.id,
          historyItem.id,
          { executionDetails: updatedHistoryItem.executionDetails }
        );
      } catch (updateError) {
        console.warn('Failed to update history item in Firestore:', updateError);
        // Continue with local update even if Firestore update fails
      }
      
      // If currently viewing this item, update it
      if (selectedHistoryItem?.id === historyItem.id) {
        setSelectedHistoryItem(updatedHistoryItem);
        setExecutionResults(updatedHistoryItem.executionDetails);
      }
      
      showSuccess("Operation successfully rolled back");
    } catch (error) {
      console.error('Rollback error:', error);
      showError(`Rollback failed: ${error.message}`);
    } finally {
      setIsRollbackInProgress(false);
    }
  };

  // Function to view history item details
  const handleViewHistoryItem = (historyItem) => {
    if (!historyItem) {
      showError('History item is not available');
      return;
    }
    
    setSelectedHistoryItem(historyItem);
    setExecutionResults(historyItem.executionDetails);
    setShowHistory(false); // Hide history panel to show results
    showSuccess('History item loaded to screen');
  };

  if (!currentWarehouse) {
    return (
      <Alert severity="warning">
        Please select a warehouse first before proceeding with pick operations.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Pick Operations
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Upload an Excel file with barcode and quantity columns to execute pick operations.
      </Typography>
      
      {/* Action Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <ButtonGroup>
          <Tooltip title="View Operation History">
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
                Pick Operation History
              </Typography>
              <Box>
                <Button 
                  size="small" 
                  startIcon={<RefreshIcon />}
                  onClick={async () => {
                    try {
                      const history = await historyService.getOperationHistory(
                        currentWarehouse.id, 
                        historyService.operationTypes.PICK
                      );
                      setExecutionHistory(history);
                      showSuccess('History refreshed successfully');
                    } catch (error) {
                      console.error('Error refreshing history:', error);
                      showError('Failed to refresh history');
                    }
                  }}
                  sx={{ mr: 1 }}
                >
                  Refresh
                </Button>
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
            </Box>
            
            {executionHistory.length === 0 ? (
              <Alert severity="info">No history found. Complete a pick operation to see it here.</Alert>
            ) : (
              <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>File</TableCell>
                      <TableCell>Items</TableCell>
                      <TableCell>Success</TableCell>
                      <TableCell>Partial</TableCell>
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
                            color={historyItem.successCount === historyItem.totalItems ? "success" : 
                                  historyItem.successCount > 0 ? "warning" : "error"}
                          />
                        </TableCell>
                        <TableCell>
                          {historyItem.partialCount > 0 && (
                            <Chip 
                              size="small"
                              label={historyItem.partialCount}
                              color="warning"
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
                            <Tooltip title="Load to Screen">
                              <IconButton 
                                size="small" 
                                onClick={() => handleViewHistoryItem(historyItem)}
                                color="primary"
                              >
                                <RefreshIcon fontSize="small" />
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
              2. Execute Pick Operations
            </Typography>
            
            <Button
              variant="contained"
              startIcon={<ExecuteIcon />}
              onClick={handleExecutePick}
              disabled={executing || !parsedData || parsedData.items.length === 0}
              sx={{ mb: 2 }}
            >
              {executing ? 'Executing...' : 'Execute Pick'}
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
        <Card sx={{ mb: 3 }}>
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
              {executionResults.summary.partial > 0 && (
                <Chip label={`Partial: ${executionResults.summary.partial}`} color="warning" />
              )}
              {executionResults.summary.failed > 0 && (
                <Chip label={`Failed: ${executionResults.summary.failed}`} color="error" />
              )}
              <Chip 
                label={`Success Rate: ${((executionResults.summary.successful / executionResults.summary.total) * 100).toFixed(1)}%`} 
                color="primary" 
              />
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
                    <TableCell>SKU</TableCell>
                    <TableCell>Requested Qty</TableCell>
                    <TableCell>Picked Qty</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {executionResults.items.map((item, index) => (
                    <TableRow key={index} sx={item.rolledBack ? { backgroundColor: 'rgba(255,0,0,0.05)' } : {}}>
                      <TableCell>{item.barcode}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.pickedQty || 0}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.status}
                          color={getStatusColor(item.status)}
                          size="small"
                          icon={item.status === 'Success' ? <SuccessIcon /> : 
                                item.status === 'Partial' ? <WarningIcon /> : <ErrorIcon />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {item.location || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="error">
                          {item.rolledBack ? 'ROLLED BACK' : item.error || ''}
                        </Typography>
                      </TableCell>
                      {/* <TableCell>
                        {item.status !== 'Failed' && !item.rolledBack && selectedHistoryItem && (
                          <Tooltip title="Rollback Pick Operation">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => handleRollbackOperation(selectedHistoryItem, index)}
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
          </CardContent>
        </Card>
      )}

      {/* History Section */}
      {/* <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            4. Execution History
          </Typography>

          <Button
            variant="outlined"
            onClick={handleHistoryToggle}
            startIcon={showHistory ? <CloseIcon /> : <HistoryIcon />}
            sx={{ mb: 2 }}
          >
            {showHistory ? 'Hide History' : 'Show Execution History'}
          </Button>

          <Collapse in={showHistory}>
            <Divider sx={{ mb: 2 }} />
            
            {executionHistory.length === 0 ? (
              <Alert severity="info">
                No execution history found for the selected warehouse.
              </Alert>
            ) : (
              <List>
                {executionHistory.map((item) => (
                  <React.Fragment key={item.id}>
                    <ListItemButton onClick={() => openHistoryDetailDialog(item)}>
                      <ListItemIcon>
                        {item.status === 'success' ? <SuccessIcon color="success" /> : <ErrorIcon color="error" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={`Execution on ${new Date(item.executedAt).toLocaleString()}`}
                        secondary={`Total Items: ${item.totalItems}, Successful: ${item.successful}, Failed: ${item.failed}`}
                      />
                      <IconButton
                        edge="end"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRollback(item);
                        }}
                        disabled={item.status === 'rolled_back'}
                      >
                        <UndoIcon color={item.status === 'rolled_back' ? 'disabled' : 'primary'} />
                      </IconButton>
                    </ListItemButton>
                    <Divider />
                  </React.Fragment>
                ))}
              </List>
            )}
          </Collapse>
        </CardContent>
      </Card> */}

      {/* History Detail Dialog */}
      <Dialog
        open={historyDetailOpen}
        onClose={closeHistoryDetailDialog}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Pick History Details
            </Typography>
            <IconButton size="small" onClick={closeHistoryDetailDialog}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedHistoryItem && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                {new Date(selectedHistoryItem.timestamp || selectedHistoryItem.date).toLocaleString()} - {selectedHistoryItem.fileName}
              </Typography>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
                <Chip label={`Total: ${selectedHistoryItem.totalItems}`} />
                <Chip label={`Success: ${selectedHistoryItem.successCount}`} color="success" />
                {selectedHistoryItem.partialCount > 0 && (
                  <Chip label={`Partial: ${selectedHistoryItem.partialCount}`} color="warning" />
                )}
                {selectedHistoryItem.failedCount > 0 && (
                  <Chip label={`Failed: ${selectedHistoryItem.failedCount}`} color="error" />
                )}
              </Box>
              
              <Typography variant="subtitle2" gutterBottom>
                Pick Operation Details
              </Typography>
              
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>Requested Qty</TableCell>
                      <TableCell>Picked Qty</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Notes</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedHistoryItem.executionDetails.items.map((item, index) => (
                      <TableRow key={index} sx={item.rolledBack ? { backgroundColor: 'rgba(255,0,0,0.05)' } : {}}>
                        <TableCell>{item.barcode}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.pickedQty || 0}</TableCell>
                        <TableCell>
                          <Chip
                            label={item.status}
                            color={getStatusColor(item.status)}
                            size="small"
                            icon={item.status === 'Success' ? <SuccessIcon /> : 
                                  item.status === 'Partial' ? <WarningIcon /> : <ErrorIcon />}
                          />
                        </TableCell>
                        <TableCell>{item.location || 'N/A'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" color="error">
                            {item.rolledBack ? 'ROLLED BACK' : item.error || ''}
                          </Typography>
                        </TableCell>
                        {/* <TableCell>
                          {item.status !== 'Failed' && !item.rolledBack && (
                            <Tooltip title="Rollback Pick Operation">
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => handleRollbackOperation(selectedHistoryItem, index)}
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
          )}
        </DialogContent>
        <DialogActions>
          {selectedHistoryItem && (
            <Button
              onClick={() => {
                handleViewHistoryItem(selectedHistoryItem);
                closeHistoryDetailDialog();
              }}
              color="primary"
              startIcon={<RefreshIcon />}
            >
              Load to Screen
            </Button>
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
    </Box>
  );
}
