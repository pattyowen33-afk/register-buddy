const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = path.join(__dirname, 'courses.db')

function getDb() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

function initDb() {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL,        -- e.g. "CSE 271"
      subject     TEXT NOT NULL,        -- e.g. "CSE"
      number      TEXT NOT NULL,        -- e.g. "271"
      name        TEXT NOT NULL,
      credits     REAL,
      department  TEXT,
      description TEXT,
      level       TEXT DEFAULT 'undergraduate',
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sections (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      crn          TEXT NOT NULL,
      course_id    INTEGER REFERENCES courses(id),
      code         TEXT NOT NULL,       -- "CSE 271"
      term         TEXT NOT NULL,       -- "202510"
      term_label   TEXT,                -- "Spring 2025"
      section      TEXT,                -- "A", "001"
      instructor   TEXT,
      rmp_score    REAL,
      days         TEXT,                -- "MWF"
      start_time   TEXT,                -- "10:00"
      end_time     TEXT,                -- "10:50"
      schedule     TEXT,                -- "MWF 10:00-10:50am"
      room         TEXT,
      campus       TEXT DEFAULT 'Oxford',
      seats_total  INTEGER,
      seats_avail  INTEGER,
      waitlist     INTEGER DEFAULT 0,
      credits      REAL,
      delivery     TEXT DEFAULT 'face-to-face',
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      major     TEXT NOT NULL,
      category  TEXT NOT NULL,
      label     TEXT NOT NULL,
      courses   TEXT,           -- JSON array of acceptable course codes
      min_hours INTEGER,
      notes     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_courses_code    ON courses(code);
    CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses(subject);
    CREATE INDEX IF NOT EXISTS idx_sections_code   ON sections(code);
    CREATE INDEX IF NOT EXISTS idx_sections_term   ON sections(term);
    CREATE INDEX IF NOT EXISTS idx_sections_crn    ON sections(crn);
    CREATE INDEX IF NOT EXISTS idx_req_major       ON requirements(major);
  `)

  console.log('✅ Database initialized at', DB_PATH)
  db.close()
}

module.exports = { getDb, initDb, DB_PATH }
