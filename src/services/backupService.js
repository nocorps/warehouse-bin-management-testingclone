import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  deleteDoc, 
  addDoc, 
  updateDoc,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';

export class BackupService {
  constructor() {
    this.MAX_BACKUPS = 10;
    this.BACKUP_TIME = '23:00'; // 11:00 PM for scheduled backups
    this.autoBackupTimeouts = new Map(); // Track auto backup timeouts per warehouse
  }

  /**
   * Create a backup of all warehouse data
   */
  async createBackup(warehouseId, options = {}) {
    try {
      const backupData = await this.collectWarehouseData(warehouseId);
      
      const backup = {
        id: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: options.name || `Auto Backup - ${new Date().toLocaleString()}`,
        type: options.type || 'auto', // 'auto' or 'manual'
        warehouseId,
        createdAt: new Date().toISOString(),
        size: JSON.stringify(backupData).length,
        data: backupData,
        version: '1.0'
      };

      // Save backup to Firestore
      const backupRef = doc(db, 'WHT', warehouseId, 'backups', backup.id);
      await setDoc(backupRef, backup);

      // Clean up old backups if we exceed the limit
      await this.cleanupOldBackups(warehouseId);

      console.log(`✅ Backup created successfully: ${backup.name}`);
      return backup;
    } catch (error) {
      console.error('❌ Error creating backup:', error);
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Collect all warehouse data for backup
   */
  async collectWarehouseData(warehouseId) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        warehouseId
      };

      // Collect warehouse configuration
      const warehouseRef = doc(db, 'WHT', warehouseId);
      const warehouseDoc = await getDoc(warehouseRef);
      data.warehouse = warehouseDoc.data();

      // Collect bins data
      const binsRef = collection(db, 'WHT', warehouseId, 'bins');
      const binsSnapshot = await getDocs(binsRef);
      data.bins = binsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Collect racks data
      const racksRef = collection(db, 'WHT', warehouseId, 'racks');
      const racksSnapshot = await getDocs(racksRef);
      data.racks = racksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Collect put-away tasks
      const putawayTasksRef = collection(db, 'WHT', warehouseId, 'putawayTasks');
      const putawaySnapshot = await getDocs(putawayTasksRef);
      data.putawayTasks = putawaySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Collect pick tasks
      const pickTasksRef = collection(db, 'WHT', warehouseId, 'pickTasks');
      const pickSnapshot = await getDocs(pickTasksRef);
      data.pickTasks = pickSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Collect operation history
      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      const historySnapshot = await getDocs(historyRef);
      data.operationHistory = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Collect zones data if exists
      try {
        const zonesRef = collection(db, 'WHT', warehouseId, 'zones');
        const zonesSnapshot = await getDocs(zonesRef);
        data.zones = zonesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.log('No zones collection found, skipping...');
        data.zones = [];
      }

      console.log(`📊 Collected data summary:
        - Bins: ${data.bins.length}
        - Racks: ${data.racks.length}
        - Put-away tasks: ${data.putawayTasks.length}
        - Pick tasks: ${data.pickTasks.length}
        - Operation history: ${data.operationHistory.length}
        - Zones: ${data.zones.length}
      `);

      return data;
    } catch (error) {
      console.error('❌ Error collecting warehouse data:', error);
      throw new Error(`Failed to collect warehouse data: ${error.message}`);
    }
  }

  /**
   * Restore warehouse from backup
   */
  async restoreBackup(warehouseId, backupId) {
    try {
      // Get backup data
      const backupRef = doc(db, 'WHT', warehouseId, 'backups', backupId);
      const backupDoc = await getDoc(backupRef);
      
      if (!backupDoc.exists()) {
        throw new Error('Backup not found');
      }

      const backup = backupDoc.data();
      const backupData = backup.data;

      console.log(`🔄 Starting restore from backup: ${backup.name}`);

      // Use batch operations for atomic restore
      const batch = writeBatch(db);

      // Clear existing data and restore from backup
      await this.clearAndRestoreCollection(warehouseId, 'bins', backupData.bins, batch);
      await this.clearAndRestoreCollection(warehouseId, 'racks', backupData.racks, batch);
      await this.clearAndRestoreCollection(warehouseId, 'putawayTasks', backupData.putawayTasks, batch);
      await this.clearAndRestoreCollection(warehouseId, 'pickTasks', backupData.pickTasks, batch);
      await this.clearAndRestoreCollection(warehouseId, 'operationHistory', backupData.operationHistory, batch);
      
      if (backupData.zones && backupData.zones.length > 0) {
        await this.clearAndRestoreCollection(warehouseId, 'zones', backupData.zones, batch);
      }

      // Commit all changes
      await batch.commit();

      console.log(`✅ Restore completed successfully from backup: ${backup.name}`);
      return { success: true, backup };
    } catch (error) {
      console.error('❌ Error restoring backup:', error);
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  /**
   * Clear and restore a collection
   */
  async clearAndRestoreCollection(warehouseId, collectionName, data, batch) {
    try {
      // First, get all existing documents to delete them
      const collectionRef = collection(db, 'WHT', warehouseId, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      // Delete existing documents
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Add backup data
      if (data && data.length > 0) {
        data.forEach(item => {
          const docRef = doc(collectionRef, item.id);
          const { id, ...itemData } = item; // Remove id from data to avoid conflicts
          batch.set(docRef, itemData);
        });
      }

      console.log(`📝 Prepared restore for ${collectionName}: ${data?.length || 0} items`);
    } catch (error) {
      console.error(`❌ Error preparing restore for ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Get list of backups for a warehouse
   */
  async getBackups(warehouseId) {
    try {
      const backupsRef = collection(db, 'WHT', warehouseId, 'backups');
      const q = query(backupsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        // Don't include the actual backup data in the list (too large)
        const { data: backupData, ...metadata } = data;
        return { id: doc.id, ...metadata };
      });
    } catch (error) {
      console.error('❌ Error getting backups:', error);
      throw new Error(`Failed to get backups: ${error.message}`);
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(warehouseId, backupId) {
    try {
      const backupRef = doc(db, 'WHT', warehouseId, 'backups', backupId);
      await deleteDoc(backupRef);
      console.log(`✅ Backup deleted: ${backupId}`);
    } catch (error) {
      console.error('❌ Error deleting backup:', error);
      throw new Error(`Failed to delete backup: ${error.message}`);
    }
  }

  /**
   * Clean up old backups beyond the limit
   */
  async cleanupOldBackups(warehouseId) {
    try {
      const backups = await this.getBackups(warehouseId);
      
      if (backups.length > this.MAX_BACKUPS) {
        const backupsToDelete = backups.slice(this.MAX_BACKUPS);
        
        for (const backup of backupsToDelete) {
          await this.deleteBackup(warehouseId, backup.id);
          console.log(`🗑️ Cleaned up old backup: ${backup.name}`);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up old backups:', error);
      // Don't throw - cleanup failure shouldn't prevent backup creation
    }
  }

  /**
   * Download a backup file
   */
  async downloadBackup(warehouseId, backupId) {
    try {
      const backupRef = doc(db, 'WHT', warehouseId, 'backups', backupId);
      const backupDoc = await getDoc(backupRef);
      
      if (!backupDoc.exists()) {
        throw new Error('Backup not found');
      }

      const backup = backupDoc.data();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      
      // Safe filename generation
      const safeName = (backup.name || 'backup').replace(/[^a-z0-9]/gi, '_');
      const timestamp = new Date(backup.createdAt || Date.now()).toISOString().slice(0, 10);
      link.download = `${safeName}_${timestamp}_${backup.id || 'backup'}.json`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      console.log(`📥 Backup downloaded: ${backup.name || 'Backup'}`);
    } catch (error) {
      console.error('❌ Error downloading backup:', error);
      throw new Error(`Failed to download backup: ${error.message}`);
    }
  }

  /**
   * Upload and validate a backup file
   */
  async uploadBackup(warehouseId, file) {
    try {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const backupData = JSON.parse(e.target.result);
            
            // Validate backup format
            if (!this.validateBackupFormat(backupData)) {
              throw new Error('Invalid backup file format');
            }
            
            // Create new backup ID for uploaded backup
            const uploadedBackup = {
              ...backupData,
              id: `uploaded_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              name: `Uploaded: ${backupData.name || file.name}`,
              type: 'uploaded',
              uploadedAt: new Date().toISOString(),
              originalFile: file.name,
              warehouseId: warehouseId // Update warehouse ID to current
            };
            
            // Save uploaded backup to Firestore
            const backupRef = doc(db, 'WHT', warehouseId, 'backups', uploadedBackup.id);
            await setDoc(backupRef, uploadedBackup);
            
            console.log(`📤 Backup uploaded: ${uploadedBackup.name}`);
            resolve(uploadedBackup);
          } catch (parseError) {
            reject(new Error(`Failed to parse backup file: ${parseError.message}`));
          }
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to read backup file'));
        };
        
        reader.readAsText(file);
      });
    } catch (error) {
      console.error('❌ Error uploading backup:', error);
      throw new Error(`Failed to upload backup: ${error.message}`);
    }
  }

  /**
   * Validate backup file format
   */
  validateBackupFormat(backupData) {
    try {
      // Check required fields
      if (!backupData || typeof backupData !== 'object') {
        return false;
      }
      
      // Check for required backup properties
      const requiredFields = ['data', 'createdAt'];
      for (const field of requiredFields) {
        if (!(field in backupData)) {
          console.warn(`Missing required field: ${field}`);
          return false;
        }
      }
      
      // Check if data object exists and has expected structure
      if (!backupData.data || typeof backupData.data !== 'object') {
        return false;
      }
      
      // Optional: Check for expected collections in data
      const expectedCollections = ['warehouse', 'racks', 'bins'];
      const hasValidCollections = expectedCollections.some(collection => 
        collection in backupData.data
      );
      
      if (!hasValidCollections) {
        console.warn('Backup does not contain expected warehouse collections');
        // Still return true as this might be a valid backup with different structure
      }
      
      return true;
    } catch (error) {
      console.error('Error validating backup format:', error);
      return false;
    }
  }

  /**
   * Schedule automatic backup at 11:00 PM
   */
  async scheduleAutoBackup(warehouseId) {
    try {
      // Clear any existing timeout for this warehouse
      this.cancelAutoBackup(warehouseId);

      const createAutoBackup = async () => {
        try {
          console.log(`⏰ Creating scheduled backup for warehouse: ${warehouseId}`);
          await this.createBackup(warehouseId, {
            name: `Auto Backup - ${new Date().toLocaleString()}`,
            type: 'auto'
          });
          
          // Schedule next backup at 11:00 PM
          scheduleNextBackup();
        } catch (error) {
          console.error('❌ Error in auto backup:', error);
          // Retry in 1 hour if failed
          const retryTimeoutId = setTimeout(createAutoBackup, 60 * 60 * 1000);
          this.autoBackupTimeouts.set(warehouseId, retryTimeoutId);
        }
      };

      const scheduleNextBackup = () => {
        // Calculate time until next 11:00 PM
        const now = new Date();
        const [hour, minute] = this.BACKUP_TIME.split(':').map(Number);
        const backupTime = new Date(now);
        backupTime.setHours(hour, minute, 0, 0);
        
        // If it's already past today's backup time, schedule for tomorrow
        if (now > backupTime) {
          backupTime.setDate(backupTime.getDate() + 1);
        }
        
        const timeUntilBackup = backupTime.getTime() - now.getTime();
        console.log(`⏰ Next backup scheduled at ${backupTime.toLocaleString()} (in ${Math.round(timeUntilBackup / 3600000)} hours)`);
        
        const timeoutId = setTimeout(createAutoBackup, timeUntilBackup);
        this.autoBackupTimeouts.set(warehouseId, timeoutId);
      };

      // Schedule first backup
      scheduleNextBackup();
      
      console.log(`✅ Auto backup scheduled for warehouse: ${warehouseId} at 11:00 PM daily`);
    } catch (error) {
      console.error('❌ Error scheduling auto backup:', error);
      throw new Error(`Failed to schedule auto backup: ${error.message}`);
    }
  }

  /**
   * Cancel automatic backup for a warehouse
   */
  cancelAutoBackup(warehouseId) {
    const timeoutId = this.autoBackupTimeouts.get(warehouseId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.autoBackupTimeouts.delete(warehouseId);
      console.log(`❌ Auto backup cancelled for warehouse: ${warehouseId}`);
    }
  }

  /**
   * Check if auto backup is enabled for a warehouse
   */
  async isAutoBackupEnabled(warehouseId) {
    try {
      const settingsRef = doc(db, 'WHT', warehouseId, 'settings', 'backup');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        return settingsDoc.data().autoBackupEnabled !== false;
      }
      
      return true; // Default to enabled
    } catch (error) {
      console.error('❌ Error checking auto backup status:', error);
      return true; // Default to enabled on error
    }
  }

  /**
   * Set auto backup enabled/disabled status
   */
  async setAutoBackupEnabled(warehouseId, enabled) {
    try {
      const settingsRef = doc(db, 'WHT', warehouseId, 'settings', 'backup');
      await setDoc(settingsRef, { 
        autoBackupEnabled: enabled,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      console.log(`✅ Auto backup ${enabled ? 'enabled' : 'disabled'} for warehouse: ${warehouseId}`);
    } catch (error) {
      console.error('❌ Error setting auto backup status:', error);
      throw new Error(`Failed to set auto backup status: ${error.message}`);
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(warehouseId) {
    try {
      const backups = await this.getBackups(warehouseId);
      const totalSize = backups.reduce((sum, backup) => sum + (backup.size || 0), 0);
      const autoBackups = backups.filter(b => b.type === 'auto').length;
      const manualBackups = backups.filter(b => b.type === 'manual').length;
      
      return {
        totalBackups: backups.length,
        autoBackups,
        manualBackups,
        totalSize,
        averageSize: backups.length > 0 ? totalSize / backups.length : 0,
        oldestBackup: backups.length > 0 ? backups[backups.length - 1] : null,
        newestBackup: backups.length > 0 ? backups[0] : null
      };
    } catch (error) {
      console.error('❌ Error getting backup stats:', error);
      throw new Error(`Failed to get backup stats: ${error.message}`);
    }
  }
}

export const backupService = new BackupService();
