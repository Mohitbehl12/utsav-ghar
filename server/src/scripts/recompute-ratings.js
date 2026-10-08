/**
 * Make every product's star rating come only from approved customer reviews.
 * Run once before launch if the database was created with sample data:
 *   npm run ratings:recompute
 */
import { db } from '../db.js';

const r = db.prepare(`UPDATE products SET
  rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE product_id = products.id AND status = 'approved'), 0),
  rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = products.id AND status = 'approved')`).run();
console.log(`✔ Ratings recomputed from approved reviews for ${r.changes} products`);
