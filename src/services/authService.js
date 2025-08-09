import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export class AuthService {
  // Predefined user credentials
  static USERS = {
    'admin@whs.com': {
      password: 'Aaaa@1234',
      role: 'master',
      name: 'Master Admin',
      uid: 'master_admin_uid'
    },
    'user1@whs.com': {
      password: 'Aaaa@1234',
      role: 'user',
      name: 'User 1',
      uid: 'user1_uid'
    },
    'user2@whs.com': {
      password: 'Aaaa@1234',
      role: 'user',
      name: 'User 2',
      uid: 'user2_uid'
    },
    'user3@whs.com': {
      password: 'Aaaa@1234',
      role: 'user',
      name: 'User 3',
      uid: 'user3_uid'
    },
    'user4@whs.com': {
      password: 'Aaaa@1234',
      role: 'user',
      name: 'User 4',
      uid: 'user4_uid'
    }
  };

  /**
   * Sign in user with email and password
   */
  async signIn(email, password) {
    try {
      // Check predefined users first
      const predefinedUser = AuthService.USERS[email];
      if (predefinedUser && predefinedUser.password === password) {
        return {
          uid: predefinedUser.uid,
          email: email,
          role: predefinedUser.role,
          name: predefinedUser.name,
          isActive: true
        };
      }

      // If not predefined user, throw error for now
      throw new Error('Invalid credentials');
    } catch (error) {
      console.error('Sign in error:', error);
      throw new Error('Invalid email or password');
    }
  }

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      // For predefined users, we just return success
      return Promise.resolve();
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  /**
   * Auth state listener (simplified for predefined users)
   */
  onAuthStateChanged(callback) {
    // For the demo, we'll handle auth state differently
    return () => {}; // Return empty unsubscribe function
  }

  /**
   * Check if user has required role
   */
  hasRole(user, requiredRole) {
    if (!user || !user.role) return false;
    
    if (user.role === 'master') return true; // Master can access everything
    if (user.role === 'user' && requiredRole === 'user') return true;
    
    return false;
  }

  /**
   * Get user permissions based on role
   */
  getUserPermissions(user) {
    if (!user || !user.role) {
      return {
        canAccessDashboard: false,
        canAccessRackConfig: false,
        canAccessPutAway: false,
        canAccessPick: false,
        canAccessSettings: false
      };
    }

    if (user.role === 'master') {
      return {
        canAccessDashboard: true,
        canAccessRackConfig: true,
        canAccessPutAway: true,
        canAccessPick: true,
        canAccessSettings: true
      };
    }

    // Normal user permissions - only putaway and pick
    return {
      canAccessDashboard: false,
      canAccessRackConfig: false,
      canAccessPutAway: true,
      canAccessPick: true,
      canAccessSettings: false
    };
  }

  /**
   * Get error message for display
   */
  getErrorMessage(errorCode) {
    return 'Authentication failed. Please check your credentials.';
  }
}

export const authService = new AuthService();
