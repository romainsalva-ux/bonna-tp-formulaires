// Endpoint de setup — crée les tables Neon si elles n'existent pas
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: "DATABASE_URL manquant" });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Créer les tables
    await sql`CREATE TABLE IF NOT EXISTS documents (
      id bigint PRIMARY KEY,
      type text NOT NULL,
      chantier text,
      date text,
      nom text,
      saved_at timestamptz DEFAULT now(),
      payload jsonb NOT NULL
    )`;

    await sql`CREATE TABLE IF NOT EXISTS chantiers (
      id serial PRIMARY KEY,
      nom text UNIQUE NOT NULL
    )`;

    // Compter les lignes
    const docCount = await sql`SELECT COUNT(*) as count FROM documents`;
    const chanCount = await sql`SELECT COUNT(*) as count FROM chantiers`;

    return res.status(200).json({
      status: "ok",
      tables_created: true,
      documents: parseInt(docCount[0].count),
      chantiers: parseInt(chanCount[0].count)
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
