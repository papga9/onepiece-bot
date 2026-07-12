const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client, GatewayIntentBits, REST, Routes, Events, MessageFlags } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');

// --- SETUP ---
const dbPath = path.join(__dirname, '../data/watch_party.db');
const db = new Database(dbPath);
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

// --- THE SUNDAY TRANSITION LOGIC ---
async function executeSundayTransition() {
    console.log("Executing the Sunday Transition...");

    let channel;
    try {
        channel = await client.channels.fetch(process.env.WATCH_CHANNEL_ID);
    } catch (err) {
        console.error("CRITICAL: Could not fetch the Discord channel. Check your WATCH_CHANNEL_ID!", err);
        return;
    }

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
                    // Safe send for the tally
                    await channel.send(`A szavazatok beérkeztek! A következő időpont: **${winningAnswer}**!`).catch(e => console.error("Failed to send tally message:", e));
                }
            }
        } catch (err) {
            console.error("Failed to tally the old poll. The message might have been deleted.", err);
        }
    }

    // PART 2: Create the New Poll
    const nextPlannedRow = db.prepare("SELECT week_id FROM episodes WHERE status = 'planned' ORDER BY episode_number ASC LIMIT 1").get();

    if (nextPlannedRow) {
        const nextWeekName = nextPlannedRow.week_id;

        // --- NEW DATE GENERATOR LOGIC ---
        const today = new Date();
        const getDateString = (daysToAdd) => {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + daysToAdd);

            // Format to "MM.DD." (e.g., 07.13.)
            const month = String(targetDate.getMonth() + 1).padStart(2, '0');
            const day = String(targetDate.getDate()).padStart(2, '0');
            return `${month}.${day}.`;
        };

        try {
            // YOUR HUNGARIAN POLL (Now with dynamic dates!)
            const newPollMessage = await channel.send({
                content: `Új hét közeleg! 🏴‍☠️ Mikor gyűlünk össze egy darabra? **${nextWeekName}**?`,
                poll: {
                    question: { text: "Melyik nap lenne jó?" },
                    answers: [
                        { text: `Hétfő (${getDateString(8)})`, emoji: "🥱" },
                        { text: `Kedd (${getDateString(9)})`, emoji: "🌮" },
                        { text: `Szerda (${getDateString(10)})`, emoji: "🐪" },
                        { text: `Csütörtök (${getDateString(11)})`, emoji: "🍺"},
                        { text: `Péntek (${getDateString(12)})`, emoji: "🍻" },
                        { text: `Szombat (${getDateString(13)})`, emoji: "🍿" },
                        { text: `Vasárnap (${getDateString(14)})`, emoji: "⚓" },
                        { text: "Nézzünk többször", emoji: "📅" },
                        { text: "Most hagyjuk ki", emoji: "🛌" }
                    ],
                    allowMultiselect: true,
                    duration: 168 // 7 days in hours
                }
            });

            // Save new poll ID ONLY if the message actually sent successfully
            db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_poll_id', ?)").run(newPollMessage.id);

        } catch (err) {
            console.error("CRITICAL: Failed to send the new poll! Does the bot have 'Send Messages' and 'Create Polls' permissions?", err);
        }

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
        await channel.send("⚠️ **System Alert:** There are no planned episodes in the database! Please update the schedule.").catch(e => console.error(e));
    }
}

// Set the automated clock to run the function every Sunday at noon
cron.schedule('0 12 * * 0', executeSundayTransition);

// --- SLASH COMMANDS ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const captainId = process.env.CAPTAIN_ID ? process.env.CAPTAIN_ID.trim() : "MISSING_ID";

    // --- SECURITY CHECK ---
    if (interaction.commandName !== 'upcoming' && interaction.user.id !== captainId) {
        return await interaction.reply({
            content: "❌ **Mutiny!** Only the Captain is authorized to alter the timeline.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'forcepoll') {
        await interaction.reply({ content: "⚙️ Captain override accepted! Forcing the Sunday Transition right now...", flags: MessageFlags.Ephemeral });
        await executeSundayTransition();
        return;
    }

    if (interaction.commandName === 'next') {
        const scheduledWeek = db.prepare("SELECT week_id FROM episodes WHERE status = 'scheduled' LIMIT 1").get();

        if (scheduledWeek) {
            db.prepare("UPDATE episodes SET status = 'watched' WHERE week_id = ? AND status = 'scheduled'").run(scheduledWeek.week_id);
            await interaction.reply(`✅ Marked **${scheduledWeek.week_id}** as watched! Web timeline updated.`);
        } else {
            await interaction.reply({ content: `There are no 'scheduled' episodes to mark as watched right now.`, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.commandName === 'cancel') {
        const scheduledWeek = db.prepare("SELECT week_id FROM episodes WHERE status = 'scheduled' LIMIT 1").get();

        if (scheduledWeek) {
            db.prepare("UPDATE episodes SET status = 'planned', watch_date = NULL WHERE week_id = ? AND status = 'scheduled'").run(scheduledWeek.week_id);
            await interaction.reply(`⏪ Cancelled **${scheduledWeek.week_id}**. It has been put back in the waiting room and will be polled again next Sunday.`);
        } else {
            await interaction.reply({ content: `There are no 'scheduled' episodes to cancel right now.`, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.commandName === 'upcoming') {
        const scheduledEpisodes = db.prepare("SELECT * FROM episodes WHERE status = 'scheduled' ORDER BY episode_number ASC").all();

        if (scheduledEpisodes.length > 0) {
            const weekName = scheduledEpisodes[0].week_id;
            const watchDate = scheduledEpisodes[0].watch_date;
            const firstEp = scheduledEpisodes[0].episode_number;
            const lastEp = scheduledEpisodes[scheduledEpisodes.length - 1].episode_number;

            await interaction.reply(`📅 **Upcoming Watch Party:**\nWe are sailing through **${weekName}** (Episodes ${firstEp}-${lastEp}) on **${watchDate}**!`);
        } else {
            const plannedWeek = db.prepare("SELECT week_id FROM episodes WHERE status = 'planned' LIMIT 1").get();
            if (plannedWeek) {
                await interaction.reply(`⚓ Nothing is officially scheduled yet, but we are currently voting on **${plannedWeek.week_id}**! Check the active poll.`);
            } else {
                await interaction.reply(`🤷‍♂️ The schedule is completely empty right now. Tell the Captain to update the map!`);
            }
        }
    }
});

// --- WEB API ---
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/schedule', (req, res) => {
    const episodes = db.prepare("SELECT * FROM episodes WHERE status IN ('planned', 'scheduled') ORDER BY episode_number ASC LIMIT 50").all();
    res.json(episodes);
});

client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    app.listen(30388, () => console.log(`Web Dashboard running at http://localhost:30388`));
});

client.login(process.env.TOKEN);
