const Database = require('better-sqlite3');
const fs = require('fs');
const csv = require('csv-parser');

const db = new Database('../data/watch_party.db');

// 1. Wipe old tables
db.exec(`DROP TABLE IF EXISTS episodes;`);
db.exec(`DROP TABLE IF EXISTS settings;`);

// 2. Create the new schema
db.exec(`
CREATE TABLE episodes (
  episode_number INTEGER PRIMARY KEY,
  title TEXT,
  tags TEXT,
  week_id TEXT,
  watch_date TEXT,
  status TEXT DEFAULT 'unplanned'
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

console.log("Tables created. Importing CSV...");

const insert = db.prepare('INSERT INTO episodes (episode_number, title, tags) VALUES (?, ?, ?)');
const insertMany = db.transaction((episodes) => {
  for (const ep of episodes) {
    insert.run(ep.episode_number, ep.title, ep.tags);
  }
});

const episodesData = [];

// 3. Read the CSV and merge the tags into a JSON array
fs.createReadStream('../data/one_piece_tagged_guide.csv')
.pipe(csv())
.on('data', (row) => {
  let tagArray = [];

  // Grab Tier 1
  if (row['Tier 1 (Status)']) {
    tagArray.push(row['Tier 1 (Status)'].trim());
  }

  // Grab Tier 2 (Split by semicolon if there are multiple)
  if (row['Tier 2 (Focus)']) {
    const t2 = row['Tier 2 (Focus)'].split(';');
    t2.forEach(tag => tagArray.push(tag.replace('_', ' ').trim()));
  }

  // Grab Tier 3 (Split by semicolon if there are multiple)
  if (row['Tier 3 (Modifiers)']) {
    const t3 = row['Tier 3 (Modifiers)'].split(';');
    t3.forEach(tag => tagArray.push(tag.replace('_', ' ').trim()));
  }

  episodesData.push({
    episode_number: parseInt(row['Episode Number']),
                    title: row['Episode Name'],
                    tags: JSON.stringify(tagArray) // Convert ["Canon", "Action"] to JSON string
  });
})
.on('end', () => {
  insertMany(episodesData);
  console.log(`✅ Database rebuilt! Inserted ${episodesData.length} episodes with fully formatted tags.`);
});
