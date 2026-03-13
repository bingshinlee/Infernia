/**
 * Infernia Market — Standalone Database Setup
 * Run this once from your project folder: node setup-db.js
 * Requires: npm install pg bcryptjs dotenv
 */

const fs   = require("fs");
const path = require("path");

// Load .env file manually (no dotenv needed)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  console.log("✓ Loaded .env file");
} else {
  console.log("⚠  No .env file found — using existing environment variables");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const { Client } = require("pg");
const bcrypt      = require("bcryptjs");

async function setup() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("✓ Connected to PostgreSQL");
  } catch (err) {
    console.error("✗ Could not connect to database:", err.message);
    console.error("  Check your DATABASE_URL in .env");
    process.exit(1);
  }

  const sql = async (query, params) => {
    try {
      await client.query(query, params);
    } catch (err) {
      console.error("✗ SQL Error:", err.message);
      console.error("  Query:", query.slice(0, 120));
      throw err;
    }
  };

  console.log("\nCreating tables...\n");

  // ── ENUM ──────────────────────────────────────────────────────────────────
  await sql(`
    DO $$ BEGIN
      CREATE TYPE order_status AS ENUM ('pending', 'fulfilled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // ── USERS (admin accounts) ─────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ users");

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS categories (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ categories");

  // ── AFFILIATES ────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS affiliates (
      id               SERIAL PRIMARY KEY,
      store_name       TEXT NOT NULL,
      email            TEXT NOT NULL UNIQUE,
      phone            TEXT,
      password_hash    TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      contact_method   TEXT,
      contact_handle   TEXT,
      message          TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ affiliates");

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS products (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      price        TEXT NOT NULL,
      category_id  INTEGER,
      affiliate_id INTEGER,
      status       TEXT NOT NULL DEFAULT 'pending',
      featured     BOOLEAN NOT NULL DEFAULT FALSE,
      buy_disabled BOOLEAN NOT NULL DEFAULT FALSE,
      images       TEXT[] NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ products");

  // ── PAYMENT METHODS ───────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      type           TEXT NOT NULL,
      details        TEXT,
      wallet_address TEXT,
      blockchain     TEXT,
      bank_name      TEXT,
      account_number TEXT,
      active         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ payment_methods");

  // ── ORDERS ────────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS orders (
      id                SERIAL PRIMARY KEY,
      product_id        INTEGER,
      customer_name     TEXT NOT NULL,
      contact_method    TEXT NOT NULL,
      contact_info      TEXT NOT NULL,
      payment_method_id INTEGER,
      notes             TEXT,
      ip_address        TEXT,
      status            order_status NOT NULL DEFAULT 'pending',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ orders");

  // ── CONTACT MESSAGES ──────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      email          TEXT NOT NULL,
      contact_method TEXT NOT NULL,
      contact_handle TEXT NOT NULL,
      message        TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ contact_messages");

  // ── HEADLINES ─────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS headlines (
      id         SERIAL PRIMARY KEY,
      text       TEXT NOT NULL,
      url        TEXT,
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ headlines");

  // ── SOCIAL LINKS ──────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS social_links (
      id         SERIAL PRIMARY KEY,
      facebook   TEXT,
      instagram  TEXT,
      telegram   TEXT,
      whatsapp   TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ social_links");

  // ── PUSH SUBSCRIPTIONS ────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           SERIAL PRIMARY KEY,
      endpoint     TEXT NOT NULL UNIQUE,
      p256dh       TEXT NOT NULL,
      auth         TEXT NOT NULL,
      affiliate_id INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ push_subscriptions");

  // ── ADMIN LOGS ────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id         SERIAL PRIMARY KEY,
      action     TEXT NOT NULL,
      admin_id   INTEGER,
      details    TEXT,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ admin_logs");

  // ── BLOCKED IPS ───────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id         SERIAL PRIMARY KEY,
      ip_address TEXT NOT NULL UNIQUE,
      reason     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ blocked_ips");

  // ── IP LOGS ───────────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS ip_logs (
      id         SERIAL PRIMARY KEY,
      ip_address TEXT NOT NULL,
      path       TEXT NOT NULL,
      method     TEXT NOT NULL,
      user_agent TEXT,
      blocked    BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ ip_logs");

  // ── SEO METADATA ──────────────────────────────────────────────────────────
  await sql(`
    CREATE TABLE IF NOT EXISTS seo_metadata (
      id               SERIAL PRIMARY KEY,
      product_id       INTEGER NOT NULL UNIQUE,
      meta_title       TEXT,
      meta_description TEXT,
      keywords         TEXT,
      og_title         TEXT,
      og_description   TEXT,
      og_image         TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("  ✓ seo_metadata");

  // ── SEED DATA ─────────────────────────────────────────────────────────────
  console.log("\nSeeding initial data...\n");

  // Admin user
  const existingAdmin = await client.query(
    "SELECT id FROM users WHERE email = $1",
    ["admin@store.com"]
  );
  if (existingAdmin.rows.length === 0) {
    const hash = await bcrypt.hash("admin123", 12);
    await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')",
      ["admin@store.com", hash]
    );
    console.log("  ✓ Admin user created");
    console.log("    Email:    admin@store.com");
    console.log("    Password: admin123  ← change this after first login!");
  } else {
    console.log("  ✓ Admin user already exists (skipped)");
  }

  // Demo affiliate
  const existingAffiliate = await client.query(
    "SELECT id FROM affiliates WHERE email = $1",
    ["demo@affiliate.com"]
  );
  if (existingAffiliate.rows.length === 0) {
    const hash = await bcrypt.hash("demo123", 12);
    await client.query(
      `INSERT INTO affiliates (store_name, email, password_hash, status)
       VALUES ($1, $2, $3, 'active')`,
      ["Demo Store", "demo@affiliate.com", hash]
    );
    console.log("  ✓ Demo affiliate created");
    console.log("    Email:    demo@affiliate.com");
    console.log("    Password: demo123");
  } else {
    console.log("  ✓ Demo affiliate already exists (skipped)");
  }

  // Default categories
  const cats = [
    { name: "Gift Cards",    slug: "gift-cards" },
    { name: "Game Credits",  slug: "game-credits" },
    { name: "Software",      slug: "software" },
    { name: "Hardware",      slug: "hardware" },
    { name: "Other",         slug: "other" },
  ];
  for (const cat of cats) {
    await client.query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [cat.name, cat.slug]
    );
  }
  console.log("  ✓ Default categories seeded");

  // Social links row (one default row)
  await client.query(
    `INSERT INTO social_links (id) VALUES (1)
     ON CONFLICT DO NOTHING`
  );
  console.log("  ✓ Social links row created");

  await client.end();

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Database setup complete!

  Start the server:   node index.js
  Open browser:       http://localhost:3000

  Admin login URL:
  http://localhost:3000/89457gweygwei98734287/ywqiuyqw/avmin

  Admin:     admin@store.com / admin123
  Affiliate: demo@affiliate.com / demo123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

setup().catch((err) => {
  console.error("\n✗ Setup failed:", err.message);
  process.exit(1);
});
