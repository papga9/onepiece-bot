require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const Database = require('better-sqlite3');
const path = require('path');
const nodemailer = require('nodemailer');

// --- SETUP ---
const db = new Database('../data/watch_party.db');
const app = express();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- THE SUNDAY TRANSITION (POLL TALLY & CREATION) ---
cron.schedule('0 12 * * 0', async () => {
    console.log("Executing the Sunday Transition...");
    const channel = await client.channels.fetch(process.env.WATCH_CHANNEL_ID);

    // PART 1: Tally Last Week's Poll
    const oldPollRow = db.prepare("SELECT value FROM settings WHERE key = 'active_poll_id'").get();

    if (oldPollRow && oldPollRow.value) {
        try {
            const oldMessage = await channel.messages.fetch(oldPollRow.value);
            if (oldMessage.poll) {
                let winningAnswer = "No votes cast";
                let maxVotes = 0;

                oldMessage.poll.answers.forEach(answer => {
                    if (answer.voteCount > maxVotes) {
                        maxVotes = answer.voteCount;
                        winningAnswer = answer.text;
                    }
                });

                const plannedWeekRow = db.prepare("SELECT week_id FROM episodes WHERE status = 'planned' ORDER BY episode_number ASC LIMIT 1").get();

                if (plannedWeekRow) {
                    db.prepare("UPDATE episodes SET watch_date = ?, status = 'scheduled' WHERE week_id = ? AND status = 'planned'").run(winningAnswer, plannedWeekRow.week_id);
                    await channel.send(`The votes are in! We are watching **${plannedWeekRow.week_id}** on **${winningAnswer}**!`);
                }
            }
        } catch (err) {
            console.error("Failed to tally the old poll:", err);
        }
    }

    // PART 2: Create the New Poll
    const nextPlannedRow = db.prepare("SELECT week_id FROM episodes WHERE status = 'planned' ORDER BY episode_number ASC LIMIT 1").get();

    if (nextPlannedRow) {
        const nextWeekName = nextPlannedRow.week_id;

        const newPollMessage = await channel.send({
            content: `A new week approaches! 🏴‍☠️ When are we setting sail for **${nextWeekName}**?`,
            poll: {
                question: { text: "Which night works best for you?" },
                answers: [
                    { text: "Friday Night", emoji: "🍻" },
                    { text: "Saturday Night", emoji: "🍿" },
                    { text: "Sunday Night", emoji: "⚓" }
                ],
                duration: 168 // 7 days in hours
            }
        });

        // Save new poll ID
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_poll_id', ?)").run(newPollMessage.id);

        // PART 3: Inventory Check (Email Alert)
        const remainingWeeksRow = db.prepare("SELECT COUNT(DISTINCT week_id) as count FROM episodes WHERE status = 'planned'").get();

        if (remainingWeeksRow.count <= 1) {
            console.log("Queue is almost empty! Sending alert email...");
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,
                subject: '🚨 One Piece Bot: Empty Queue Warning!',
                text: `Captain! The bot just sent the poll for ${nextWeekName}, but there are NO MORE episodes planned after this.\n\nPlease update watch_party.db with the next batch before next Sunday!`
            };
            transporter.sendMail(mailOptions, (error) => {
                if (error) console.error("Failed to send alert:", error);
            });
        }
    } else {
        await channel.send("⚠️ **System Alert:** There are no planned episodes in the database! Please update the schedule.");
    }
});

// --- SLASH COMMANDS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'next') {
        const scheduledWeek = db.prepare("SELECT week_id FROM episodes WHERE status = 'scheduled' LIMIT 1").get();

        if (scheduledWeek) {
            db.prepare("UPDATE episodes SET status = 'watched' WHERE week_id = ? AND status = 'scheduled'").run(scheduledWeek.week_id);
            await interaction.reply(`✅ Marked **${scheduledWeek.week_id}** as watched! Web timeline updated.`);
        } else {
            await interaction.reply(`There are no 'scheduled' episodes to mark as watched right now.`);
        }
    }
});

// --- WEB API ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/schedule', (req, res) => {
    // Limits the display to the next 50 episodes so it doesn't clutter the screen
    const episodes = db.prepare("SELECT * FROM episodes WHERE status IN ('planned', 'scheduled') ORDER BY episode_number ASC LIMIT 50").all();
    res.json(episodes);
});

client.once('clientReady', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    app.listen(30388, () => console.log(`Web Dashboard running at http://localhost:30388`));
});

client.login(process.env.DISCORD_TOKEN);
