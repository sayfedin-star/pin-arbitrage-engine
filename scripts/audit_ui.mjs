import fs from 'fs';

const content = fs.readFileSync('src/keywords-ui.mjs', 'utf8');

console.log('--- UI INTEGRITY AUDIT ---');
console.log('velocity_curve occurrences:', (content.match(/velocity_curve/g) || []).length);
console.log("activeTab === 'guides' occurrences:", (content.match(/activeTab\s*===\s*['"]guides['"]/g) || []).length);
console.log('Guided Capsules in Zone 1:', content.includes('<!-- GUIDED CAPSULES RIBBON (Zone 1'));
console.log('Popular Pins Gallery in Trends:', content.includes('<!-- Pinterest Official Popular Pins from Trends Feed'));
console.log('Displaced Pins Vault Tab:', content.includes('<!-- TAB 4: DISPLACED PINS VAULT & VACUUM MOMENTUM ENGINE -->'));
console.log('Performance Trajectory in Dossier:', content.includes('PERFORMANCE TRAJECTORY'));
console.log('Growth Pace filters in SERP:', content.includes("growthPaceFilter === '24h'"));
console.log('Cards vs Table toggle:', content.includes("viewMode = 'table'"));
console.log('Total file lines:', content.split('\n').length);
