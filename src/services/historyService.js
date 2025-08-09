import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, doc, deleteDoc, updateDoc, limit, getDoc } from 'firebase/firestore';

export class HistoryService {
  constructor() {
    this.operationTypes = {
      PUTAWAY: 'putaway',
      PICK: 'pick'
    };
  }

  /**
   * Save operation history to Firestore
   */
  async saveOperationHistory(warehouseId, operationType, historyItem) {
    try {
      if (!warehouseId) {
        console.error('No warehouse ID provided');
        return null;
      }

      const historyItemWithMeta = {
        ...historyItem,
        operationType,
        timestamp: historyItem.timestamp || new Date().toISOString(),
      };

      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      const docRef = await addDoc(historyRef, historyItemWithMeta);
      
      return {
        id: docRef.id,
        ...historyItemWithMeta
      };
    } catch (error) {
      console.error(`Error saving ${operationType} history:`, error);
      throw new Error(`Failed to save ${operationType} history`);
    }
  }

  /**
   * Get operation history from Firestore
   */
  async getOperationHistory(warehouseId, operationType, filters = {}) {
    try {
      if (!warehouseId) {
        console.error('No warehouse ID provided');
        return [];
      }

      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      let q = query(historyRef, where('operationType', '==', operationType));
      
      // Order by timestamp descending
      q = query(q, orderBy('timestamp', 'desc'));
      
      // Limit results if specified
      if (filters.limit) {
        q = query(q, limit(filters.limit));
      }
      
      const snapshot = await getDocs(q);
      const historyItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Additional client-side filtering
      let filteredItems = historyItems;
      
      if (filters.startDate) {
        filteredItems = filteredItems.filter(item => 
          new Date(item.timestamp) >= new Date(filters.startDate)
        );
      }
      
      if (filters.endDate) {
        filteredItems = filteredItems.filter(item => 
          new Date(item.timestamp) <= new Date(filters.endDate)
        );
      }

      return filteredItems;
    } catch (error) {
      console.error(`Error retrieving ${operationType} history:`, error);
      throw new Error(`Failed to retrieve ${operationType} history`);
    }
  }

  /**
   * Update operation history item
   */
  async updateOperationHistoryItem(warehouseId, historyItemId, updatedData) {
    try {
      if (!warehouseId || !historyItemId) {
        console.error('Missing warehouse ID or history item ID');
        return false;
      }

      const historyItemRef = doc(db, 'WHT', warehouseId, 'operationHistory', historyItemId);
      await updateDoc(historyItemRef, updatedData);
      
      return true;
    } catch (error) {
      console.error('Error updating history item:', error);
      throw new Error('Failed to update history item');
    }
  }

  /**
   * Delete operation history item
   */
  async deleteOperationHistoryItem(warehouseId, historyItemId) {
    try {
      if (!warehouseId || !historyItemId) {
        console.error('Missing warehouse ID or history item ID');
        return false;
      }

      const historyItemRef = doc(db, 'WHT', warehouseId, 'operationHistory', historyItemId);
      await deleteDoc(historyItemRef);
      
      return true;
    } catch (error) {
      console.error('Error deleting history item:', error);
      throw new Error('Failed to delete history item');
    }
  }

  /**
   * Clear all operation history for a warehouse and type
   */
  async clearOperationHistory(warehouseId, operationType) {
    try {
      if (!warehouseId) {
        console.error('No warehouse ID provided');
        return false;
      }

      const historyRef = collection(db, 'WHT', warehouseId, 'operationHistory');
      const q = query(historyRef, where('operationType', '==', operationType));
      
      const snapshot = await getDocs(q);
      
      // Delete each document
      const deletePromises = snapshot.docs.map(document => 
        deleteDoc(doc(db, 'WHT', warehouseId, 'operationHistory', document.id))
      );
      
      await Promise.all(deletePromises);
      
      return true;
    } catch (error) {
      console.error(`Error clearing ${operationType} history:`, error);
      throw new Error(`Failed to clear ${operationType} history`);
    }
  }

  /**
   * Get a specific history item by ID
   */
  async getOperationHistoryItem(warehouseId, historyItemId) {
    try {
      if (!warehouseId || !historyItemId) {
        console.error('Missing warehouse ID or history item ID');
        return null;
      }

      const historyItemRef = doc(db, 'WHT', warehouseId, 'operationHistory', historyItemId);
      const snapshot = await getDoc(historyItemRef);
      
      if (!snapshot.exists()) {
        return null;
      }
      
      return {
        id: snapshot.id,
        ...snapshot.data()
      };
    } catch (error) {
      console.error('Error retrieving history item:', error);
      throw new Error('Failed to retrieve history item');
    }
  }
}

export const historyService = new HistoryService();
