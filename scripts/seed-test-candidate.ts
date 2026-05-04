/**
 * Crea un candidato de prueba en la DB para testear Extension Sync.
 * Uso: npx tsx scripts/seed-test-candidate.ts
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Insertar o actualizar candidato
  const res = await pool.query(
    `INSERT INTO candidates
       (name, role, email, phone, location, linkedin_url, years_of_experience, bio, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (email) DO UPDATE
       SET name                = EXCLUDED.name,
           role                = EXCLUDED.role,
           phone               = EXCLUDED.phone,
           location            = EXCLUDED.location,
           linkedin_url        = EXCLUDED.linkedin_url,
           years_of_experience = EXCLUDED.years_of_experience,
           bio                 = EXCLUDED.bio,
           updated_at          = NOW()
     RETURNING id, name, email`,
    [
      'Carlos Méndez',
      'Desarrollador Full Stack',
      'carlos.mendez.dev@gmail.com',
      '+1 514 555-9874',
      'Montreal, QC',
      'https://www.linkedin.com/in/carlos-mendez-dev',
      5,
      'Desarrollador Full Stack con 5 años de experiencia en React, Node.js y ' +
      'PostgreSQL. Bilingüe (inglés/español), con experiencia en startups y ' +
      'empresas de tecnología en Canadá.',
      'Available',
    ],
  );

  const cand = res.rows[0];
  console.log('✅ Candidato creado/actualizado:', cand);

  // Insertar skills
  const skills = [
    'React', 'Node.js', 'TypeScript', 'PostgreSQL',
    'Docker', 'Git', 'REST APIs', 'Agile/Scrum',
  ];
  for (const skill of skills) {
    await pool.query(
      `INSERT INTO candidate_skills (candidate_id, skill)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [cand.id, skill],
    );
  }
  console.log('✅ Skills:', skills.join(', '));
  console.log('\nID para probar en la UI:', cand.id);
}

main()
  .catch(e => console.error('❌', e.message))
  .finally(() => pool.end());
