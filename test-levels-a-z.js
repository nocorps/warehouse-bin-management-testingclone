/**
 * Test script to demonstrate A-Z levels functionality with smart selection
 * Run this with: node test-levels-a-z.js
 */

class TestRackService {
  generateLocationCode(warehouseCode, floor, rackNumber, gridNumber, level, position) {
    const paddedRack = String(rackNumber).padStart(2, '0');
    const paddedGrid = String(gridNumber).padStart(2, '0');
    const binCode = `${level}${position}`;
    
    return `${warehouseCode}-${floor}-R${paddedRack}-G${paddedGrid}-${binCode}`;
  }

  // Simulate smart level selection: if you select J, it includes A through J
  smartLevelSelection(selectedLevel) {
    const allLevels = Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i));
    const levelIndex = allLevels.indexOf(selectedLevel);
    return allLevels.slice(0, levelIndex + 1);
  }
}
const rackService = new TestRackService();

console.log('🧪 Testing A-Z Levels Implementation with Smart Selection\n');

// Test all 26 levels (A-Z)
const levels = Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i));

console.log('📍 Available Levels:');
console.log(levels.join(', '));
console.log(`Total levels supported: ${levels.length}\n`);

console.log('� Smart Selection Examples:');

// Test smart selection for various levels
const testSelections = ['C', 'J', 'P', 'Z'];
testSelections.forEach(selectedLevel => {
  const smartSelected = rackService.smartLevelSelection(selectedLevel);
  console.log(`Select "${selectedLevel}" → Automatically includes: ${smartSelected.join(', ')} (${smartSelected.length} levels)`);
});

console.log('\n�🏭 Sample Location Codes with Smart Selection:\n');

// Generate sample location codes for multiple grids and levels
const warehouseCode = 'WH1';
const floor = 'GF';
const rackNumber = 4;

// Example: User selects "J" - this automatically includes A through J
const userSelection = 'J';
const selectedLevels = rackService.smartLevelSelection(userSelection);

console.log(`User selected: "${userSelection}"`);
console.log(`Smart selection result: ${selectedLevels.join(', ')} (${selectedLevels.length} levels)\n`);

console.log('Grid 1 with Smart Selection (A-J):');
selectedLevels.slice(0, 5).forEach(level => {
  for (let position = 1; position <= 2; position++) {
    const locationCode = rackService.generateLocationCode(
      warehouseCode, floor, rackNumber, 1, level, position
    );
    console.log(`  ${locationCode} (Grid 1, Level ${level}, Position ${position})`);
  }
});

console.log('\nGrid 2 with remaining levels:');
selectedLevels.slice(5, 10).forEach(level => {
  for (let position = 1; position <= 2; position++) {
    const locationCode = rackService.generateLocationCode(
      warehouseCode, floor, rackNumber, 2, level, position
    );
    console.log(`  ${locationCode} (Grid 2, Level ${level}, Position ${position})`);
  }
});

console.log('\nExtreme Examples (Using Y and Z levels):');
const lastLevels = ['Y', 'Z'];
lastLevels.forEach((level, gridIndex) => {
  for (let position = 1; position <= 3; position++) {
    const locationCode = rackService.generateLocationCode(
      warehouseCode, floor, rackNumber, gridIndex + 1, level, position
    );
    console.log(`  ${locationCode} (Grid ${gridIndex + 1}, Level ${level}, Position ${position})`);
  }
});

console.log('\n✅ A-Z Levels Implementation Test Complete!');
console.log('\n📋 Summary:');
console.log(`• Supports ${levels.length} levels per grid (A-Z)`);
console.log('• Each level can have unlimited positions (1, 2, 3, ...)');
console.log('• Format: WH1-GF-R04-G01-A1 where A1 = Level A, Position 1');
console.log('• 🎯 Smart Selection: Select "J" automatically includes A through J');
console.log('• Maximum theoretical bins per grid: 26 levels × positions per level');
console.log('• Warehouse management system can now handle massive storage capacity!');

console.log('\n🎯 Smart Selection Benefits:');
console.log('• Prevents gaps in level selection (no B without A)');
console.log('• Intuitive: select highest level needed');
console.log('• Visual feedback shows range (A-J instead of individual letters)');
console.log('• Reduces configuration errors');
console.log('• Makes rack setup faster and more logical');
