// Proxy API pour Neon — traduit les requêtes style Supabase vers Neon HTTP API
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, Prefer");
  
  if (req.method === "OPTIONS") return res.status(200).end();

  const { table, id, order, limit, select } = req.query;
  
  try {
    if (req.method === "GET") {
      if (table === "documents") {
        const rows = await sql`SELECT * FROM documents ORDER BY saved_at DESC LIMIT ${parseInt(limit) || 500}`;
        return res.status(200).json(rows);
      }
      if (table === "chantiers") {
        const rows = await sql`SELECT * FROM chantiers ORDER BY nom ASC LIMIT ${parseInt(limit) || 200}`;
        return res.status(200).json(rows);
      }
    }
    
    if (req.method === "POST") {
      const body = req.body;
      if (table === "documents") {
        if (Array.isArray(body)) {
          for (const doc of body) {
            await sql`INSERT INTO documents (id, type, chantier, date, nom, saved_at, payload) VALUES (${doc.id}, ${doc.type}, ${doc.chantier}, ${doc.date}, ${doc.nom}, ${doc.saved_at || new Date().toISOString()}, ${JSON.stringify(doc.payload)}) ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type, chantier=EXCLUDED.chantier, date=EXCLUDED.date, nom=EXCLUDED.nom, saved_at=EXCLUDED.saved_at, payload=EXCLUDED.payload`;
          }
        } else {
          await sql`INSERT INTO documents (id, type, chantier, date, nom, saved_at, payload) VALUES (${body.id}, ${body.type}, ${body.chantier}, ${body.date}, ${body.nom}, ${body.saved_at || new Date().toISOString()}, ${JSON.stringify(body.payload)}) ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type, chantier=EXCLUDED.chantier, date=EXCLUDED.date, nom=EXCLUDED.nom, saved_at=EXCLUDED.saved_at, payload=EXCLUDED.payload`;
        }
        return res.status(201).json({ success: true });
      }
      if (table === "chantiers") {
        const items = Array.isArray(body) ? body : [body];
        for (const item of items) {
          await sql`INSERT INTO chantiers (nom) VALUES (${item.nom}) ON CONFLICT (nom) DO NOTHING`;
        }
        return res.status(201).json({ success: true });
      }
    }
    
    if (req.method === "PATCH") {
      const body = req.body;
      if (table === "documents" && id) {
        await sql`UPDATE documents SET chantier=${body.chantier}, date=${body.date}, nom=${body.nom}, saved_at=${body.saved_at}, payload=${JSON.stringify(body.payload)} WHERE id=${parseInt(id)}`;
        return res.status(200).json({ success: true });
      }
    }
    
    if (req.method === "DELETE") {
      if (table === "documents" && id) {
        await sql`DELETE FROM documents WHERE id=${parseInt(id)}`;
        return res.status(200).json({ success: true });
      }
      if (table === "chantiers" && id) {
        await sql`DELETE FROM chantiers WHERE id=${parseInt(id)}`;
        return res.status(200).json({ success: true });
      }
      if (table === "chantiers" && req.query.nom_neq) {
        await sql`DELETE FROM chantiers WHERE nom != ${req.query.nom_neq}`;
        return res.status(200).json({ success: true });
      }
    }
    
    return res.status(400).json({ error: "Requête non supportée" });
  } catch (e) {
    console.error("DB error:", e);
    return res.status(500).json({ error: e.message });
  }
}
