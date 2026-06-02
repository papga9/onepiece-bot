const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 1. Ensure the data directory exists (Crucial for the future TrueNAS Docker mount)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
    console.log("Created ./data directory.");
}

// 2. Open/Create the database file inside the /data folder
const dbPath = path.join(dataDir, 'watch_party.db');
const db = new Database(dbPath);

console.log(`Setting up the database at ${dbPath}...`);

// 3. Create the schema
db.exec(`
  CREATE TABLE IF NOT EXISTS schedule (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    episodes TEXT NOT NULL,
    tags TEXT,
    synopsis TEXT,
    status TEXT DEFAULT 'future'
  )
`);

// 4. Seed data (First few weeks of One Piece)
const seedData = [
  {
    id: 'week_01',
    title: 'Romance Dawn',
    episodes: '1-3',
    tags: JSON.stringify(['Introduction', 'Classic']),
    synopsis: "The journey begins. Meet the rubber boy who wants to be pirate king, and his incredibly grumpy first crewmate.",
    status: 'watched'
  },
  {
    id: 'week_02',
    title: 'Orange Town',
    episodes: '4-8',
    tags: JSON.stringify(['New Crewmate', 'Clown Antics']),
    synopsis: "A town terrorized by a pirate clown. A girl who hates pirates. Some fun early-series shenanigans.",
    status: 'up_next'
  },
  {
    id: 'week_03',
    title: 'Syrup Village Part 1',
    episodes: '9-12',
    tags: JSON.stringify(['Slow Burn', 'Story Building']),
    synopsis: "We meet a boy who cries wolf. A seemingly peaceful village has a very dark secret brewing beneath the surface.",
    status: 'future'
  },
  {
    id: 'week_04',
    title: 'Syrup Village Finale',
    episodes: '13-18',
    tags: JSON.stringify(['Action', 'Important Crewmate']),
    synopsis: "The attack begins! The crew has to defend a slope from an invading pirate crew. A new ship might be in the cards.",
    status: 'future'
  }
];

// 5. Prepare the insert statement
const insert = db.prepare(`
  INSERT OR REPLACE INTO schedule (id, title, episodes, tags, synopsis, status) 
  VALUES (?, ?, ?, ?, ?, ?)
`);

// 6. Execute in a transaction for safety and speed
const insertMany = db.transaction((blocks) => {
  for (const block of blocks) {
    insert.run(block.id, block.title, block.episodes, block.tags, block.synopsis, block.status);
  }
});

insertMany(seedData);

console.log("Database initialized and seeded successfully!");
db.close();
