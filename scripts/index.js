require('dotenv').config({ path: '../.env' });
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const cron = require('node-cron');
const express = require('express');
const app = express();
const PORT = 30388;

// 1. Connect to the DB
const dbPath = path.join(__dirname, '../data', 'watch_party.db');
const db = new Database(dbPath);

// 2. Initialize the Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] }); // <-- Fixed closing brackets!

client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    // The Cron Job MUST live inside this 'ready' block so it waits for Discord to connect first
    cron.schedule('0 12 * * 0', async () => {
        try {
            // Tell the bot to find your specific text channel
            const channel = await client.channels.fetch(process.env.WATCH_CHANNEL_ID);

            if (channel) {
                console.log("Dispatching the weekly watch party poll...");

                // Send a Native Discord Poll
                await channel.send({
                    content: "A new week approaches! 🏴‍☠️ When are we setting sail for the next watch session?",
                    poll: {
                        question: { text: 'Which night works best for you?' },
                        answers: [
                            { text: 'Friday Night', emoji: '🍻' },
                            { text: 'Saturday Night', emoji: '🍿' },
                            { text: 'Sunday Night', emoji: '⚓' }
                        ],
                        allowMultiselect: true,
                        duration: 168,
                    }
                });
            }
        } catch (error) {
            console.error("Failed to execute the scheduled poll:", error);
        }
    });
});

// 3. Listen for interactions (Slash Commands)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'next') {
        // Fetch the active week from SQLite safely
        const block = db.prepare(`SELECT * FROM schedule WHERE status = 'up_next' LIMIT 1`).get();

        if (!block) {
            await interaction.reply("I couldn't find an upcoming watch block in the database.");
            return;
        }

        // Parse our JSON tags back into an array
        const tags = JSON.parse(block.tags);

        // Build a sleek visual card for the chat
        const embed = new EmbedBuilder()
        .setColor(0x0099FF) // You can change this hex color
        .setTitle(`📺 Up Next: ${block.title}`)
        .addFields(
            { name: 'Episodes', value: `**${block.episodes}**`, inline: true },
            { name: 'Tags', value: tags.join(' | '), inline: true },
                   { name: 'Synopsis', value: block.synopsis }
        )
        .setFooter({ text: 'One Piece Watch Party Hub' });

        // Send it to the channel
        await interaction.reply({ embeds: [embed] });
    }
});

// Start the bot
client.login(process.env.TOKEN);

// --- WEB SERVER ---

// 1. Tell Express to serve any files inside the 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// 2. Create an API endpoint that sends our database data to the webpage
app.get('/api/schedule', (req, res) => {
    try {
        // Fetch all rows from the database
        const blocks = db.prepare('SELECT * FROM schedule').all();

        // Convert the stringified tags back into arrays for the frontend
        const formattedBlocks = blocks.map(block => ({
            ...block,
            tags: JSON.parse(block.tags)
        }));

        res.json(formattedBlocks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch schedule" });
    }
});

// 3. Start listening on port 3000
app.listen(PORT, () => {
    console.log(`Web Dashboard running at http://localhost:${PORT}`);
});
