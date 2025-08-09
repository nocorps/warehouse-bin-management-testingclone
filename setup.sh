#!/bin/bash

# Warehouse Bin Management Setup Script
echo "🏭 Setting up Warehouse Bin Management System..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm found"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Check if Firebase config exists
if [ ! -f "src/firebase.js" ]; then
    echo "⚠️  Firebase configuration not found"
    echo "📋 Creating Firebase config template..."
    
    cat > src/firebase.js << 'EOF'
// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  // Replace with your Firebase configuration
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

export default app;
EOF

    echo "✅ Firebase config template created at src/firebase.js"
    echo "🔧 Please update src/firebase.js with your actual Firebase configuration"
    echo "📚 Get your config from: https://console.firebase.google.com"
else
    echo "✅ Firebase configuration found"
fi

# Create Firestore security rules if they don't exist
if [ ! -f "firestore.rules" ]; then
    echo "🔒 Creating Firestore security rules..."
    
    cat > firestore.rules << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Warehouse data - authenticated users only
    match /warehouses/{warehouseId}/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // User profiles
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Public read access for warehouse layouts (optional)
    match /layouts/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
EOF

    echo "✅ Firestore security rules created"
else
    echo "✅ Firestore security rules found"
fi

# Check if package.json scripts are up to date
echo "🔧 Checking package.json scripts..."

# Add additional scripts if needed
npm pkg set scripts.start="react-scripts start"
npm pkg set scripts.build="react-scripts build"
npm pkg set scripts.test="react-scripts test"
npm pkg set scripts.eject="react-scripts eject"
npm pkg set scripts.deploy="npm run build && firebase deploy"

echo "✅ Package.json scripts updated"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update src/firebase.js with your Firebase configuration"
echo "2. Set up your Firebase project with Firestore enabled"
echo "3. Deploy firestore.rules to your Firebase project"
echo "4. Run 'npm start' to start the development server"
echo ""
echo "🔗 Useful links:"
echo "   - Firebase Console: https://console.firebase.google.com"
echo "   - Firebase Setup Guide: https://firebase.google.com/docs/web/setup"
echo "   - Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started"
echo ""
echo "🚀 Run 'npm start' to begin development!"
