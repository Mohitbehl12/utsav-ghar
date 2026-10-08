import { db } from '../db.js';

export function audit(req, action, entity, entityId, details) {
  db.prepare('INSERT INTO audit_logs(admin_id, action, entity, entity_id, details, ip) VALUES(?,?,?,?,?,?)').run(
    req.admin?.id ?? null,
    action,
    entity,
    entityId == null ? null : String(entityId),
    details ? JSON.stringify(details).slice(0, 4000) : null,
    req.ip
  );
}
