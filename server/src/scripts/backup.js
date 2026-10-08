import { backupNow } from '../lib/backup.js';
backupNow().then((f) => { console.log(`✔ Backup written: ${f}`); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
