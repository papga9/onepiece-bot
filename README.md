Sorry for the AI readme, I'm lazy :P

# 🏴‍☠️ One Piece Watch Party Bot & Web Hub

A self-hosted Discord bot and responsive web dashboard built with **Node.js**, **Express**, **SQLite**, and **Discord.js v14**. Designed to automate weekly *One Piece* watch parties—handling weekly Discord schedule polling, automated reminders, queue inventory alerts, and a live episode timeline displaying tiered canon/theme tags.

---

## ✨ Features

* **Automated Weekly Discord Polls (`node-cron`):**
  * **Sunday Transition (12:00 PM):** Automatically tallies the previous week's Discord poll (bypassing message cache), resolves ties using a custom day-priority system, schedules the winning day for the next batch of episodes, and posts a new 7-day poll for the following week.
  * **Saturday Reminder (12:00 PM):** Pings the crew 24 hours before the poll closes to get final votes in.
* **Live Web Dashboard (`Express` + Vanilla JS/CSS):**
  * Discord-themed dark UI displaying episode batches grouped by week (`planned`, `scheduled`, and toggleable `watched` states).
  * Color-coded 3-tier episode tags (**Status:** Canon, Filler, Mixed Canon, Anime Canon; **Focus & Modifiers:** Action, Lore, Comedy, Backstory, Climax, Slow, Recap).
* **Low-Queue Email Alerts (`Nodemailer`):**
  * Sends an automated email warning to the Captain when only 1 planned week remains in the SQLite queue.
* **TVMaze English Title Sync:**
  * Built-in `/translate` slash command that fetches official English episode titles from the TVMaze API and updates the database in a single pass.

---

## 📂 Project Structure

```text
onepiece-bot/
├── Dockerfile              # Container build instructions (node:20-bookworm-slim)
├── package.json            # Dependencies and package config
├── data/                   # Persistent SQLite database & source CSV (mounted volume)
│   ├── watch_party.db
│   └── one_piece_tagged_guide.csv
├── public/                 # Static frontend for the Web Dashboard
│   ├── index.html
│   └── style.css
└── scripts/
    ├── index.js            # Main bot logic, cron jobs, Express server & API
    ├── register.js         # Discord guild slash command registration script
    └── setup_db.js         # Database initializer & CSV tag importer
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory of the project:

```env
# Discord Configuration
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
GUILD_ID=your_discord_server_id
WATCH_CHANNEL_ID=channel_id_for_polls_and_alerts
PIRATE_ROLE_ID=role_id_to_ping_for_polls          # Optional
CAPTAIN_ID=your_discord_user_id                   # Restricts admin slash commands

# Email Alerts (Gmail App Password recommended)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
```

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize the Database

Place your `one_piece_tagged_guide.csv` inside the `data/` folder (expects columns: `Episode Number`, `Episode Name`, `Tier 1 (Status)`, `Tier 2 (Focus)`, `Tier 3 (Modifiers)`), then run:

```bash
cd scripts
node setup_db.js
```

> **Note:** `setup_db.js` imports all episodes with `status = 'unplanned'`. To queue episodes for upcoming polls, assign them a `week_id` (e.g., `"Week 15 - Water 7"`) and set their `status = 'planned'` in `watch_party.db`.

### 3. Register Slash Commands

Deploy the guild slash commands to your Discord server:

```bash
cd scripts
node register.js
```

### 4. Run the Bot & Web Server

```bash
node scripts/index.js
```

The web dashboard will be available at `http://localhost:30388`.

---

## 🐳 Docker / TrueNAS Deployment

Build and run the container with a persistent volume mounted to `/usr/src/app/data` so your SQLite database survives container restarts:

```bash
# Build the image
docker build -t onepiece-bot .

# Run the container
docker run -d \
  --name onepiece-bot \
  --restart unless-stopped \
  --env-file .env \
  -p 30388:30388 \
  -v /path/to/host/data:/usr/src/app/data \
  onepiece-bot
```

---

## 🎮 Discord Slash Commands

| Command | Access | Description |
| :--- | :--- | :--- |
| `/upcoming` | Everyone | Displays the currently scheduled watch party batch, episodes, and date (or active poll status). |
| `/next` | Captain Only | Marks the currently `scheduled` week as `watched` and updates the web timeline. |
| `/cancel` | Captain Only | Reverts the currently `scheduled` week back to `planned` so it gets re-polled next Sunday. |
| `/forcepoll` | Captain Only | Manually triggers the Sunday transition (tallies active poll and posts the next one immediately). |
| `/translate` | Captain Only | Fetches and overwrites all episode titles in the database with official English titles from TVMaze. |

---

## 🔌 Web API

* **`GET /api/schedule?includeWatched=false`**
  Returns a JSON array of episodes ordered by `episode_number`. Pass `includeWatched=true` to include completed weeks alongside `scheduled` and `planned` batches.
