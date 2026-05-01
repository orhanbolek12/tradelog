const { calcRR } = require('./database');
console.log('RR (3.7, 4.04, 3.3, null):', calcRR(3.7, 4.04, 3.3, null));
console.log('RR (3.7, 4.04, null, 3.3):', calcRR(3.7, 4.04, null, 3.3));
console.log('RR (3.7, 4.04, 3.3, 3.5):', calcRR(3.7, 4.04, 3.3, 3.5));
