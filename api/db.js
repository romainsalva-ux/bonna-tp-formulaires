// Proxy Neon via API HTTP native — aucune dépendance npm requise
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: "DATABASE_URL manquant" });

  // Parser l'URL Neon pour extraire le host
  let neonHost;
  try {
    const parsed = new URL(dbUrl);
    neonHost = parsed.hostname;
  } catch(e) {
    return res.status(500).json({ error: "DATABASE_URL invalide: " + e.message });
  }

  const neonEndpoint = `https://${neonHost}/sql`;

  async function query(sql, params = []) {
    const r = await fetch(neonEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": dbUrl,
      },
      body: JSON.stringify({ query: sql, params }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Neon ${r.status}: ${txt}`);
    }
    const data = await r.json();
    return data.rows || [];
  }

  const { table, id, limit, nom_neq } = req.query;
  const method = req.method.toUpperCase();

  try {
    // GET
    if (method === "GET") {
      if (table === "documents") {
        const rows = await query(
          "SELECT * FROM documents ORDER BY saved_at DESC LIMIT $1",
          [parseInt(limit) || 500]
        );
        return res.status(200).json(rows);
      }
      if (table === "chantiers") {
        const rows = await query(
          "SELECT * FROM chantiers ORDER BY nom ASC LIMIT $1",
          [parseInt(limit) || 200]
        );
        return res.status(200).json(rows);
      }
    }

    // POST
    if (method === "POST") {
      const body = req.body;
      const items = Array.isArray(body) ? body : [body];
      if (table === "documents") {
        for (const doc of items) {
          await query(
            `INSERT INTO documents (id, type, chantier, date, nom, saved_at, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET
               type=$2, chantier=$3, date=$4, nom=$5, saved_at=$6, payload=$7`,
            [doc.id, doc.type, doc.chantier||"", doc.date||"", doc.nom||"",
             doc.saved_at||new Date().toISOString(), JSON.stringify(doc.payload||doc)]
          );
        }
        return res.status(201).json({ success: true });
      }
      if (table === "chantiers") {
        for (const item of items) {
          await query(
            "INSERT INTO chantiers (nom) VALUES ($1) ON CONFLICT (nom) DO NOTHING",
            [item.nom]
          );
        }
        return res.status(201).json({ success: true });
      }
    }

    // PATCH
    if (method === "PATCH" && table === "documents" && id) {
      const body = req.body;
      await query(
        `UPDATE documents SET chantier=$1, date=$2, nom=$3, saved_at=$4, payload=$5 WHERE id=$6`,
        [body.chantier||"", body.date||"", body.nom||"",
         body.saved_at||new Date().toISOString(), JSON.stringify(body.payload||body), parseInt(id)]
      );
      return res.status(200).json({ success: true });
    }

    // DELETE
    if (method === "DELETE") {
      if (table === "documents" && id) {
        await query("DELETE FROM documents WHERE id=$1", [parseInt(id)]);
        return res.status(200).json({ success: true });
      }
      if (table === "chantiers" && id) {
        await query("DELETE FROM chantiers WHERE id=$1", [parseInt(id)]);
        return res.status(200).json({ success: true });
      }
      if (table === "chantiers" && nom_neq) {
        await query("DELETE FROM chantiers WHERE nom != $1", [nom_neq]);
        return res.status(200).json({ success: true });
      }
    }

    return res.status(400).json({ error: "Opération non reconnue", table, method });

  } catch(e) {
    console.error("DB error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
