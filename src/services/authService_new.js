import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Demo credentials for the system
const DEMO_USERS = [
  {
    email: 'admin@whs.com',
    password: 'Aaaa@1234',
    role: 'master',
    name: 'Master Admin',
    isActive: true
  },
  {
    email: 'user1@whs.com', 
    password: 'Aaaa@1234',
    role: 'user',
    name: 'User One',
    isActive: true
  },
  {
    email: 'user2@whs.com',
    password: 'Aaaa@1234', 
    role: 'user',
    name: 'User Two',
    isActive: true
  },
  {
    email: 'user3@whs.com',
    password: 'Aaaa@1234',
    role: 'user', 
    name: 'User Three',
    isActive: true
  },
  {
    email: 'user4@whs.com',
    password: 'Aaaa@1234',
    role: 'user',
    name: 'User Four', 
    isActive: true
  }
];

export const authService = {
  // Auto-create demo users if they don't exist
  async initializeDemoUsers() {
    try {
      console.log('Initializing demo users...');
      
      for (const demoUser of DEMO_USERS) {
        try {
          // Try to create the user
          const userCredential = await createUserWithEmailAndPassword(auth, demoUser.email, demoUser.password);
          const user = userCredential.user;

          // Update profile
          await updateProfile(user, { displayName: demoUser.name });

          // Store user data in Firestore
          await setDoc(doc(db, 'users', user.uid), {
            email: demoUser.email,
            name: demoUser.name,
            role: demoUser.role,
            isActive: demoUser.isActive,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          console.log(`Created demo user: ${demoUser.email}`);
          
          // Sign out after creating
          await signOut(auth);
        } catch (error) {
          if (error.code === 'auth/email-already-in-use') {
            console.log(`Demo user ${demoUser.email} already exists`);
          } else {
            console.error(`Error creating user ${demoUser.email}:`, error);
          }
        }
      }
      
      console.log('Demo users initialization complete');
    } catch (error) {
      console.error('Error initializing demo users:', error);
    }
  },

  // Sign up new user
  async signUp(email, password, userData = {}) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update profile
      if (userData.name) {
        await updateProfile(user, { displayName: userData.name });
      }

      // Store user data in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        name: userData.name || '',
        role: userData.role || 'user',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return {
        uid: user.uid,
        email: user.email,
        name: userData.name || '',
        role: userData.role || 'user'
      };
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  },

  // Sign in user
  async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      let userData = {};

      if (userDoc.exists()) {
        userData = userDoc.data();
      } else {
        // Check if this is a demo user and create profile
        const demoUser = DEMO_USERS.find(u => u.email === email);
        if (demoUser) {
          userData = {
            email: demoUser.email,
            name: demoUser.name,
            role: demoUser.role,
            isActive: demoUser.isActive
          };

          // Create user document in Firestore
          await setDoc(doc(db, 'users', user.uid), {
            ...userData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } else {
          // Default user data
          userData = {
            email: user.email,
            name: user.displayName || '',
            role: 'user',
            isActive: true
          };
        }
      }

      return {
        uid: user.uid,
        email: user.email,
        ...userData
      };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },

  // Sign out user
  async signOut() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },

  // Listen to auth state changes
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          let userData = {};

          if (userDoc.exists()) {
            userData = userDoc.data();
          } else {
            // Check if this is a demo user
            const demoUser = DEMO_USERS.find(u => u.email === user.email);
            if (demoUser) {
              userData = {
                email: demoUser.email,
                name: demoUser.name,
                role: demoUser.role,
                isActive: demoUser.isActive
              };
            } else {
              userData = {
                email: user.email,
                name: user.displayName || '',
                role: 'user',
                isActive: true
              };
            }
          }

          callback({
            uid: user.uid,
            email: user.email,
            ...userData
          });
        } catch (error) {
          console.error('Error getting user data:', error);
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  },

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  },

  // Check if user has specific role
  hasRole(user, role) {
    return user && user.role === role;
  },

  // Check if user is master/admin
  isMaster(user) {
    return user && user.role === 'master';
  },

  // Check if user is normal user
  isUser(user) {
    return user && user.role === 'user';
  },

  // Get demo users (for testing)
  getDemoUsers() {
    return DEMO_USERS.map(({ password, ...user }) => user);
  }
};
