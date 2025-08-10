import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';

export const warehouseService = {
  // Warehouse Management
  async getWarehouse(warehouseId) {
    try {
      const warehouseRef = doc(db, 'WHT', warehouseId);
      const warehouseDoc = await getDoc(warehouseRef);
      
      if (warehouseDoc.exists()) {
        return { id: warehouseDoc.id, ...warehouseDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting warehouse:', error);
      return null;
    }
  },

  async getWarehouses() {
    try {
      const warehousesRef = collection(db, 'WHT');
      const snapshot = await getDocs(warehousesRef);
      const warehouses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return warehouses;
    } catch (error) {
      console.error('Error getting warehouses:', error);
      return [];
    }
  },

  async createWarehouse(warehouseData) {
    try {
      const warehousesRef = collection(db, 'WHT');
      const warehouseWithMetadata = {
        ...warehouseData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(warehousesRef, warehouseWithMetadata);
      return { id: docRef.id, ...warehouseWithMetadata };
    } catch (error) {
      console.error('Error creating warehouse:', error);
      throw error;
    }
  },

  async getOrCreateDefaultWarehouse() {
    const warehousesRef = collection(db, 'WHT');
    const q = query(warehousesRef, where('isDefault', '==', true), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    // Create default warehouse
    const defaultWarehouse = {
      name: 'Main Warehouse',
      code: 'WH-001',
      isDefault: true,
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
      },
      settings: {
        maxShelvesPerRack: 20,
        maxBinsPerGrid: 999999,
        maxProductsPerBin: 10,
        binCodeFormat: 'R-{rack}-G-{grid}-B-{bin}',
      },
      zones: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(warehousesRef, defaultWarehouse);
    return { id: docRef.id, ...defaultWarehouse };
  },

  async deleteWarehouse(warehouseId) {
    try {
      // First, delete all subcollections (racks, bins, putAwayTasks, pickTasks, inventory, etc.)
      const batch = writeBatch(db);
      
      // Get all subcollections that need to be deleted
      const subcollections = [
        'racks',
        'bins', 
        'putAwayTasks',
        'pickTasks',
        'inventory',
        'operationHistory',
        'allocationHistory',
        'reports'
      ];
      
      // Delete all documents in each subcollection
      for (const subcollectionName of subcollections) {
        const subcollectionRef = collection(db, 'WHT', warehouseId, subcollectionName);
        const snapshot = await getDocs(subcollectionRef);
        
        snapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }
      
      // Delete the warehouse document itself
      const warehouseRef = doc(db, 'WHT', warehouseId);
      batch.delete(warehouseRef);
      
      // Commit the batch delete
      await batch.commit();
      
      console.log(`✅ Warehouse ${warehouseId} and all its data deleted successfully`);
      return { success: true, message: 'Warehouse deleted successfully' };
    } catch (error) {
      console.error('Error deleting warehouse:', error);
      throw error;
    }
  },

  // Rack Management
  async createRack(warehouseId, rackData) {
    const racksRef = collection(db, 'WHT', warehouseId, 'racks');
    const rackWithMetadata = {
      ...rackData,
      warehouseId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(racksRef, rackWithMetadata);
    return { id: docRef.id, ...rackWithMetadata };
  },

  async updateRack(warehouseId, rackId, rackData) {
    const rackRef = doc(db, 'WHT', warehouseId, 'racks', rackId);
    const updateData = {
      ...rackData,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(rackRef, updateData);
    return { id: rackId, ...updateData };
  },

  async deleteRack(warehouseId, rackId) {
    // Delete rack and all its shelves and bins
    const batch = writeBatch(db);
    
    // Delete the rack
    const rackRef = doc(db, 'WHT', warehouseId, 'racks', rackId);
    batch.delete(rackRef);

    // Delete all shelves and bins belonging to this rack
    const shelvesRef = collection(db, 'WHT', warehouseId, 'shelves');
    const shelvesQuery = query(shelvesRef, where('rackId', '==', rackId));
    const shelvesSnapshot = await getDocs(shelvesQuery);

    shelvesSnapshot.docs.forEach((shelfDoc) => {
      batch.delete(shelfDoc.ref);
    });

    const binsRef = collection(db, 'WHT', warehouseId, 'bins');
    const binsQuery = query(binsRef, where('rackId', '==', rackId));
    const binsSnapshot = await getDocs(binsQuery);

    binsSnapshot.docs.forEach((binDoc) => {
      batch.delete(binDoc.ref);
    });

    await batch.commit();
  },

  async getRacks(warehouseId) {
    const racksRef = collection(db, 'WHT', warehouseId, 'racks');
    const q = query(racksRef, orderBy('code'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getRack(warehouseId, rackId) {
    try {
      const rackRef = doc(db, 'WHT', warehouseId, 'racks', rackId);
      const rackDoc = await getDoc(rackRef);
      
      if (rackDoc.exists()) {
        return { id: rackDoc.id, ...rackDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting rack:', error);
      throw error;
    }
  },

  subscribeToRacks(warehouseId, callback) {
    const racksRef = collection(db, 'WHT', warehouseId, 'racks');
    const q = query(racksRef, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const racks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('Real-time racks update:', racks.length); // Debug logging
      callback(racks);
    }, (error) => {
      console.error('Error in racks subscription:', error);
    });
  },

  // Get all racks from all warehouses (for warehouse selector)
  async getAllRacks() {
    try {
      const warehouses = await this.getWarehouses();
      const allRacks = [];
      
      for (const warehouse of warehouses) {
        const racks = await this.getRacks(warehouse.id);
        // Add warehouseId to each rack for filtering
        const racksWithWarehouseId = racks.map(rack => ({
          ...rack,
          warehouseId: warehouse.id
        }));
        allRacks.push(...racksWithWarehouseId);
      }
      
      console.log('getAllRacks: Found', allRacks.length, 'racks total');
      return allRacks;
    } catch (error) {
      console.error('Error getting all racks:', error);
      return [];
    }
  },

  // Shelf Management
  async createShelf(warehouseId, shelfData) {
    const shelvesRef = collection(db, 'WHT', warehouseId, 'shelves');
    const shelfWithMetadata = {
      ...shelfData,
      warehouseId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(shelvesRef, shelfWithMetadata);
    return { id: docRef.id, ...shelfWithMetadata };
  },

  subscribeToShelves(warehouseId, callback) {
    const shelvesRef = collection(db, 'WHT', warehouseId, 'shelves');
    const q = query(shelvesRef, orderBy('rackId'), orderBy('level'));
    
    return onSnapshot(q, (snapshot) => {
      const shelves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(shelves);
    });
  },

  // Bin Management
  async createBin(warehouseId, binData) {
    const binsRef = collection(db, 'WHT', warehouseId, 'bins');
    
    // Filter out undefined values to prevent Firestore errors
    const cleanBinData = {};
    Object.keys(binData).forEach(key => {
      if (binData[key] !== undefined) {
        cleanBinData[key] = binData[key];
      }
    });
    
    const binWithMetadata = {
      ...cleanBinData,
      warehouseId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(binsRef, binWithMetadata);
    return { id: docRef.id, ...binWithMetadata };
  },

  async updateBin(warehouseId, binId, binData) {
    const binRef = doc(db, 'WHT', warehouseId, 'bins', binId);
    const updateData = {
      ...binData,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(binRef, updateData);
    return { id: binId, ...updateData };
  },

  async deleteBin(warehouseId, binId) {
    const binRef = doc(db, 'WHT', warehouseId, 'bins', binId);
    await deleteDoc(binRef);
  },

  async getBin(warehouseId, binId) {
    const binRef = doc(db, 'WHT', warehouseId, 'bins', binId);
    const binDoc = await getDoc(binRef);
    if (binDoc.exists()) {
      return { id: binDoc.id, ...binDoc.data() };
    }
    return null;
  },

  async getBinByCode(warehouseId, binCode) {
    const binsRef = collection(db, 'WHT', warehouseId, 'bins');
    const q = query(binsRef, where('code', '==', binCode), limit(1));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  },

  subscribeToBins(warehouseId, callback) {
    const binsRef = collection(db, 'WHT', warehouseId, 'bins');
    const q = query(binsRef, orderBy('code'));
    
    return onSnapshot(q, (snapshot) => {
      const bins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log('Real-time bins update:', bins.length); // Debug logging
      callback(bins);
    }, (error) => {
      console.error('Error in bins subscription:', error);
    });
  },

  // Get all bins from all warehouses (for warehouse selector)
  async getAllBins() {
    try {
      const warehouses = await this.getWarehouses();
      const allBins = [];
      
      for (const warehouse of warehouses) {
        const bins = await this.getBins(warehouse.id);
        // Add warehouseId to each bin for filtering
        const binsWithWarehouseId = bins.map(bin => ({
          ...bin,
          warehouseId: warehouse.id
        }));
        allBins.push(...binsWithWarehouseId);
      }
      
      console.log('getAllBins: Found', allBins.length, 'bins total');
      return allBins;
    } catch (error) {
      console.error('Error getting all bins:', error);
      return [];
    }
  },

  // Zone Management
  async createZone(warehouseId, zoneData) {
    const zonesRef = collection(db, 'WHT', warehouseId, 'zones');
    const zoneWithMetadata = {
      ...zoneData,
      warehouseId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(zonesRef, zoneWithMetadata);
    return { id: docRef.id, ...zoneWithMetadata };
  },

  subscribeToZones(warehouseId, callback) {
    const zonesRef = collection(db, 'WHT', warehouseId, 'zones');
    const q = query(zonesRef, orderBy('name'));
    
    return onSnapshot(q, (snapshot) => {
      const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(zones);
    });
  },

  // Put-Away Tasks
  async createPutAwayTask(warehouseId, taskData) {
    const tasksRef = collection(db, 'WHT', warehouseId, 'putAwayTasks');
    
    // Filter out undefined values to prevent Firestore errors
    const cleanTaskData = {};
    Object.keys(taskData).forEach(key => {
      if (taskData[key] !== undefined) {
        cleanTaskData[key] = taskData[key];
      }
    });
    
    const taskWithMetadata = {
      ...cleanTaskData,
      warehouseId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(tasksRef, taskWithMetadata);
    return { id: docRef.id, ...taskWithMetadata };
  },

  async updatePutAwayTask(warehouseId, taskId, taskData) {
    const taskRef = doc(db, 'WHT', warehouseId, 'putAwayTasks', taskId);
    
    // Filter out undefined values to prevent Firestore errors
    const cleanTaskData = {};
    Object.keys(taskData).forEach(key => {
      if (taskData[key] !== undefined) {
        cleanTaskData[key] = taskData[key];
      }
    });
    
    const updateData = {
      ...cleanTaskData,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(taskRef, updateData);
    return { id: taskId, ...updateData };
  },

  async getPutAwayTask(warehouseId, taskId) {
    try {
      const taskRef = doc(db, 'WHT', warehouseId, 'putAwayTasks', taskId);
      const taskSnap = await getDoc(taskRef);
      
      if (taskSnap.exists()) {
        return { id: taskSnap.id, ...taskSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting putaway task:', error);
      throw error;
    }
  },

  subscribeToPutAwayTasks(warehouseId, callback) {
    const tasksRef = collection(db, 'WHT', warehouseId, 'putAwayTasks');
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(tasks);
    });
  },

  async getPutAwayTasks(warehouseId, filters = {}) {
    try {
      const { status, sku, actualBinId, completedAfter, completedBefore, limit: maxLimit = 50 } = filters;
      
      let q = collection(db, 'WHT', warehouseId, 'putAwayTasks');
      
      const constraints = [];
      
      // Count the number of where clauses to avoid complex index requirements
      const whereClauseCount = [status, sku, actualBinId, completedAfter, completedBefore].filter(Boolean).length;
      
      if (whereClauseCount <= 1) {
        // Simple queries - safe to use all filters
        if (status) {
          constraints.push(where('status', '==', status));
        }
        if (sku) {
          constraints.push(where('sku', '==', sku));
        }
        if (actualBinId) {
          constraints.push(where('actualBinId', '==', actualBinId));
        }
        if (completedAfter) {
          constraints.push(where('completedAt', '>=', new Date(completedAfter)));
        }
        if (completedBefore) {
          constraints.push(where('completedAt', '<=', new Date(completedBefore)));
        }
        constraints.push(orderBy('completedAt', 'desc'));
        constraints.push(limit(maxLimit));
      } else {
        // Complex query - use simplified approach to avoid index issues
        console.warn('Complex put-away tasks query detected, using simplified approach');
        constraints.push(orderBy('completedAt', 'desc'));
        constraints.push(limit(maxLimit * 2)); // Get more to filter in memory
      }
      
      q = query(q, ...constraints);
      
      const snapshot = await getDocs(q);
      let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Apply additional filters in memory if we used the fallback approach
      if (whereClauseCount > 1) {
        results = results.filter(task => {
          let matches = true;
          if (status && task.status !== status) matches = false;
          if (sku && task.sku !== sku) matches = false;
          if (actualBinId && task.actualBinId !== actualBinId) matches = false;
          if (completedAfter && (!task.completedAt || new Date(task.completedAt) < new Date(completedAfter))) matches = false;
          if (completedBefore && (!task.completedAt || new Date(task.completedAt) > new Date(completedBefore))) matches = false;
          return matches;
        }).slice(0, maxLimit);
      }
      
      return results;
    } catch (error) {
      console.error('Error getting put-away tasks:', error);
      return [];
    }
  },

  subscribeToPickTasks(warehouseId, callback) {
    const tasksRef = collection(db, 'WHT', warehouseId, 'pickTasks');
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(tasks);
    });
  },

  // Inventory Management
  async updateInventory(warehouseId, sku, inventoryData) {
    const inventoryRef = doc(db, 'WHT', warehouseId, 'inventory', sku);
    const updateData = {
      ...inventoryData,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(inventoryRef, updateData);
    return { id: sku, ...updateData };
  },

  subscribeToInventory(warehouseId, callback) {
    const inventoryRef = collection(db, 'WHT', warehouseId, 'inventory');
    const q = query(inventoryRef, orderBy('sku'));
    
    return onSnapshot(q, (snapshot) => {
      const inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(inventory);
    });
  },

  // Transaction for moving products between bins
  async moveBetweenBins(warehouseId, fromBinId, toBinId, sku, quantity, lotNumber = null) {
    return await runTransaction(db, async (transaction) => {
      // Get current bin states
      const fromBinRef = doc(db, 'WHT', warehouseId, 'bins', fromBinId);
      const toBinRef = doc(db, 'WHT', warehouseId, 'bins', toBinId);
      
      const fromBinDoc = await transaction.get(fromBinRef);
      const toBinDoc = await transaction.get(toBinRef);

      if (!fromBinDoc.exists() || !toBinDoc.exists()) {
        throw new Error('One or both bins do not exist');
      }

      const fromBin = fromBinDoc.data();
      const toBin = toBinDoc.data();

      // Validate move
      if (fromBin.sku !== sku) {
        throw new Error('SKU does not match source bin');
      }

      if (fromBin.currentQty < quantity) {
        throw new Error('Insufficient quantity in source bin');
      }

      if (toBin.currentQty + quantity > toBin.capacity) {
        throw new Error('Destination bin capacity exceeded');
      }

      // Update bins
      const newFromBinData = {
        ...fromBin,
        currentQty: fromBin.currentQty - quantity,
        updatedAt: serverTimestamp(),
      };

      // If source bin becomes empty, clear SKU and lot info
      if (newFromBinData.currentQty === 0) {
        newFromBinData.sku = null;
        newFromBinData.lotNumber = null;
        newFromBinData.expiryDate = null;
        newFromBinData.status = 'available';
      }

      const newToBinData = {
        ...toBin,
        currentQty: toBin.currentQty + quantity,
        sku: sku,
        lotNumber: lotNumber || toBin.lotNumber,
        updatedAt: serverTimestamp(),
        status: 'occupied',
      };

      transaction.update(fromBinRef, newFromBinData);
      transaction.update(toBinRef, newToBinData);

      return { fromBin: newFromBinData, toBin: newToBinData };
    });
  },

  async getBins(warehouseId) {
    try {
      const binsRef = collection(db, 'WHT', warehouseId, 'bins');
      const q = query(binsRef, orderBy('code'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting bins for warehouse:', warehouseId, error);
      return [];
    }
  },

  // Pick Tasks Management
  async getPickTasks(warehouseId, filters = {}) {
    try {
      const { status, completedAfter, completedBefore, limit: maxLimit = 50 } = filters;
      
      let q = collection(db, 'WHT', warehouseId, 'pickTasks');
      
      const constraints = [];
      
      // Only use complex queries if we have minimal constraints to avoid index issues
      if (status && !completedAfter && !completedBefore) {
        // Simple status filter
        constraints.push(where('status', '==', status));
        constraints.push(orderBy('completedAt', 'desc'));
        constraints.push(limit(maxLimit));
      } else if (!status && (completedAfter || completedBefore)) {
        // Date range only
        if (completedAfter) {
          constraints.push(where('completedAt', '>=', new Date(completedAfter)));
        }
        if (completedBefore) {
          constraints.push(where('completedAt', '<=', new Date(completedBefore)));
        }
        constraints.push(orderBy('completedAt', 'desc'));
        constraints.push(limit(maxLimit));
      } else if (!status && !completedAfter && !completedBefore) {
        // No filters, just order and limit
        constraints.push(orderBy('completedAt', 'desc'));
        constraints.push(limit(maxLimit));
      } else {
        // Complex query - fall back to simpler approach to avoid index issues
        console.warn('Complex pick tasks query detected, using simplified approach');
        constraints.push(orderBy('completedAt', 'desc'));
        constraints.push(limit(maxLimit * 2)); // Get more to filter in memory
      }
      
      q = query(q, ...constraints);
      
      const snapshot = await getDocs(q);
      let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Apply additional filters in memory if we used the fallback approach
      if (status && (completedAfter || completedBefore)) {
        results = results.filter(task => {
          let matches = true;
          if (status && task.status !== status) matches = false;
          if (completedAfter && (!task.completedAt || new Date(task.completedAt) < new Date(completedAfter))) matches = false;
          if (completedBefore && (!task.completedAt || new Date(task.completedAt) > new Date(completedBefore))) matches = false;
          return matches;
        }).slice(0, maxLimit);
      }
      
      return results;
    } catch (error) {
      console.error('Error getting pick tasks:', error);
      return [];
    }
  },

  async createPickTask(warehouseId, taskData) {
    try {
      const tasksRef = collection(db, 'WHT', warehouseId, 'pickTasks');
      const taskDoc = await addDoc(tasksRef, {
        ...taskData,
        status: 'pending',
        createdAt: serverTimestamp(),
        createdBy: 'system'
      });
      
      return { id: taskDoc.id, ...taskData };
    } catch (error) {
      console.error('Error creating pick task:', error);
      throw error;
    }
  },

  async updatePickTask(warehouseId, taskId, updates) {
    try {
      const taskRef = doc(db, 'WHT', warehouseId, 'pickTasks', taskId);
      await updateDoc(taskRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      
      return { id: taskId, ...updates };
    } catch (error) {
      console.error('Error updating pick task:', error);
      throw error;
    }
  },
};
