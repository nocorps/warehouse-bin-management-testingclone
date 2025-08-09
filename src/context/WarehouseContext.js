import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { warehouseService } from '../services/warehouseService';

const WarehouseContext = createContext();

const initialState = {
  currentWarehouse: null,
  warehouses: [],
  racks: [],
  shelves: [],
  bins: [],
  zones: [],
  putAwayTasks: [],
  pickTasks: [],
  inventory: [],
  loading: false,
  error: null,
};

function warehouseReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    
    case 'SET_CURRENT_WAREHOUSE':
      return { ...state, currentWarehouse: action.payload };
    
    case 'SET_WAREHOUSES':
      return { ...state, warehouses: action.payload };
    
    case 'SET_RACKS':
      return { ...state, racks: action.payload };
    
    case 'SET_SHELVES':
      return { ...state, shelves: action.payload };
    
    case 'SET_BINS':
      return { ...state, bins: action.payload };
    
    case 'SET_ZONES':
      return { ...state, zones: action.payload };
    
    case 'SET_PUTAWAY_TASKS':
      return { ...state, putAwayTasks: action.payload };
    
    case 'SET_PICK_TASKS':
      return { ...state, pickTasks: action.payload };
    
    case 'SET_INVENTORY':
      return { ...state, inventory: action.payload };
    
    case 'ADD_RACK':
      return { ...state, racks: [...state.racks, action.payload] };
    
    case 'UPDATE_RACK':
      return {
        ...state,
        racks: state.racks.map(rack =>
          rack.id === action.payload.id ? action.payload : rack
        ),
      };
    
    case 'DELETE_RACK':
      return {
        ...state,
        racks: state.racks.filter(rack => rack.id !== action.payload),
      };
    
    case 'ADD_BIN':
      return { ...state, bins: [...state.bins, action.payload] };
    
    case 'UPDATE_BIN':
      return {
        ...state,
        bins: state.bins.map(bin =>
          bin.id === action.payload.id ? action.payload : bin
        ),
      };
    
    case 'DELETE_BIN':
      return {
        ...state,
        bins: state.bins.filter(bin => bin.id !== action.payload),
      };
    
    case 'ADD_PUTAWAY_TASK':
      return { ...state, putAwayTasks: [...state.putAwayTasks, action.payload] };
    
    case 'UPDATE_PUTAWAY_TASK':
      return {
        ...state,
        putAwayTasks: state.putAwayTasks.map(task =>
          task.id === action.payload.id ? action.payload : task
        ),
      };
    
    case 'ADD_PICK_TASK':
      return { ...state, pickTasks: [...state.pickTasks, action.payload] };
    
    case 'UPDATE_PICK_TASK':
      return {
        ...state,
        pickTasks: state.pickTasks.map(task =>
          task.id === action.payload.id ? action.payload : task
        ),
      };
    
    default:
      return state;
  }
}

export function WarehouseProvider({ children }) {
  const [state, dispatch] = useReducer(warehouseReducer, initialState);
  const unsubscribersRef = useRef(null);

  // Initialize warehouses and load all data
  useEffect(() => {
    const init = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        
        // Get all warehouses from Firestore
        const warehouses = await warehouseService.getWarehouses();
        dispatch({ type: 'SET_WAREHOUSES', payload: warehouses });
        
        // Load all racks and bins for all warehouses to show stats in selector
        if (warehouses.length > 0) {
          console.log('Loading all racks and bins for warehouse selector...');
          
          // Get all racks and bins from all warehouses
          const allRacks = await warehouseService.getAllRacks();
          const allBins = await warehouseService.getAllBins();
          
          console.log('Loaded racks:', allRacks.length, 'bins:', allBins.length);
          
          dispatch({ type: 'SET_RACKS', payload: allRacks });
          dispatch({ type: 'SET_BINS', payload: allBins });
        }
        
        // Auto-select warehouse if only one exists
        if (warehouses.length === 1) {
          const warehouse = warehouses[0];
          dispatch({ type: 'SET_CURRENT_WAREHOUSE', payload: warehouse });
          
          // Setup real-time listeners for the selected warehouse
          setupRealTimeListeners(warehouse.id);
          
          console.log('Auto-selected warehouse:', warehouse.name);
        }
        
      } catch (error) {
        console.error('Error initializing warehouses:', error);
        dispatch({ type: 'SET_ERROR', payload: error.message });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    init();
  }, []);

  const setupRealTimeListeners = (warehouseId) => {
    // Cleanup existing listeners
    if (unsubscribersRef.current) {
      unsubscribersRef.current();
      unsubscribersRef.current = null;
    }

    console.log('Setting up real-time listeners for warehouse:', warehouseId);

    // Listen to racks changes
    const unsubscribeRacks = warehouseService.subscribeToRacks(warehouseId, (racks) => {
      console.log('Racks updated:', racks.length);
      dispatch({ type: 'SET_RACKS', payload: racks });
    });

    // Listen to bins changes
    const unsubscribeBins = warehouseService.subscribeToBins(warehouseId, (bins) => {
      console.log('Bins updated:', bins.length);
      dispatch({ type: 'SET_BINS', payload: bins });
    });

    // Listen to zones changes
    const unsubscribeZones = warehouseService.subscribeToZones(warehouseId, (zones) => {
      dispatch({ type: 'SET_ZONES', payload: zones });
    });

    // Listen to put-away tasks changes
    const unsubscribePutAwayTasks = warehouseService.subscribeToPutAwayTasks(warehouseId, (tasks) => {
      dispatch({ type: 'SET_PUTAWAY_TASKS', payload: tasks });
    });

    // Listen to pick tasks changes
    const unsubscribePickTasks = warehouseService.subscribeToPickTasks(warehouseId, (tasks) => {
      dispatch({ type: 'SET_PICK_TASKS', payload: tasks });
    });

    // Listen to inventory changes
    const unsubscribeInventory = warehouseService.subscribeToInventory(warehouseId, (inventory) => {
      dispatch({ type: 'SET_INVENTORY', payload: inventory });
    });

    dispatch({ type: 'SET_LOADING', payload: false });

    // Store cleanup function
    unsubscribersRef.current = () => {
      unsubscribeRacks?.();
      unsubscribeBins?.();
      unsubscribeZones?.();
      unsubscribePutAwayTasks?.();
      unsubscribePickTasks?.();
      unsubscribeInventory?.();
    };
  };

  const createWarehouse = async (warehouseData) => {
    try {
      const newWarehouse = await warehouseService.createWarehouse(warehouseData);
      
      // Update warehouses list
      const warehouses = await warehouseService.getWarehouses();
      dispatch({ type: 'SET_WAREHOUSES', payload: warehouses });
      
      // Set as current warehouse
      dispatch({ type: 'SET_CURRENT_WAREHOUSE', payload: newWarehouse });
      
      // Set up real-time listeners
      setupRealTimeListeners(newWarehouse.id);
      
      return newWarehouse;
    } catch (error) {
      console.error('Error creating warehouse:', error);
      throw error;
    }
  };

  const setCurrentWarehouse = async (warehouse) => {
    try {
      if (!warehouse || !warehouse.id) {
        console.error('Invalid warehouse provided to setCurrentWarehouse:', warehouse);
        return null;
      }
      
      dispatch({ type: 'SET_CURRENT_WAREHOUSE', payload: warehouse });
      
      // Set up real-time listeners for the new warehouse
      setupRealTimeListeners(warehouse.id);
      
      return warehouse;
    } catch (error) {
      console.error('Error setting current warehouse:', error);
      throw error;
    }
  };

  const value = {
    ...state,
    dispatch,
    createWarehouse,
    setCurrentWarehouse,
  };

  return (
    <WarehouseContext.Provider value={value}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error('useWarehouse must be used within a WarehouseProvider');
  }
  return context;
}
