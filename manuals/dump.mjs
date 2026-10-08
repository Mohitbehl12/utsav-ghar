import customer from '../shared/manuals/customer.js';
import dealer from '../shared/manuals/dealer.js';
import admin from '../shared/manuals/admin.js';
import * as common from '../shared/manuals/common.js';
console.log(JSON.stringify({ manuals: [customer, dealer, admin], common }));
