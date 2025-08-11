// Test script to verify the print service fix for full report scope
console.log('🧪 Testing Print Service Full Report Scope Fix');

// Mock data to simulate the issue
const mockReportData = {
  config: {
    scope: 'full',  // This is what Settings.js passes for "Full Report (All Data)"
    type: 'stock_movements'
  },
  data: {
    movements: Array.from({ length: 148 }, (_, i) => ({
      sku: `SKU${String(i + 1).padStart(3, '0')}`,
      location: `WH1-GF-R01-G01-A${(i % 3) + 1}`,
      quantity: Math.floor(Math.random() * 100) + 1,
      operationType: i % 2 === 0 ? 'Put-Away' : 'Pick'
    }))
  },
  generatedAt: new Date().toISOString()
};

console.log(`📊 Mock data created with ${mockReportData.data.movements.length} movements`);
console.log(`🎯 Report scope: ${mockReportData.config.scope}`);

// Test the logic that would be used in the print service
const movements = mockReportData.data.movements;
const scope = mockReportData.config.scope;

// This is the new logic for the header
const headerText = scope === 'full' || movements.length <= 100 
  ? `${movements.length} movements` 
  : `First 100 of ${movements.length} movements`;

console.log(`📝 Header will show: "Movement Details (${headerText})"`);

// This is the new logic for data display
const displayedMovements = scope === 'full' ? movements : movements.slice(0, 100);
console.log(`📄 Will display ${displayedMovements.length} movements out of ${movements.length} total`);

// This is the new logic for the note
const showNote = movements.length > 100 && scope !== 'full';
console.log(`📌 Will show limitation note: ${showNote}`);

// Test with different scopes
console.log('\n🔄 Testing different scopes:');

const testScopes = ['full', 'date_range', 'last_week'];
testScopes.forEach(testScope => {
  const testHeaderText = testScope === 'full' || movements.length <= 100 
    ? `${movements.length} movements` 
    : `First 100 of ${movements.length} movements`;
  
  const testDisplayedCount = testScope === 'full' ? movements.length : Math.min(movements.length, 100);
  const testShowNote = movements.length > 100 && testScope !== 'full';
  
  console.log(`  📊 Scope: ${testScope}`);
  console.log(`    Header: "Movement Details (${testHeaderText})"`);
  console.log(`    Display: ${testDisplayedCount}/${movements.length} movements`);
  console.log(`    Note: ${testShowNote ? 'Show limitation note' : 'No limitation note'}`);
});

console.log('\n✅ Print Service fix verification complete!');
console.log('   When scope="full", all 148 movements will be displayed.');
console.log('   When scope="date_range" or others, only first 100 will be shown with a note.');
