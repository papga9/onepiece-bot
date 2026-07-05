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

        try {
            // YOUR HUNGARIAN POLL
            const newPollMessage = await channel.send({
                content: `Új hét közeleg! 🏴‍☠️ Mikor gyűlünk össze egy darabra? **${nextWeekName}**?`,
                poll: {
                    question: { text: "Melyik nap lenne jó?" },
                    answers: [
                        { text: "Hétfő", emoji: "🥱" },
                        { text: "Kedd", emoji: "🌮" },
                        { text: "Szerda", emoji: "🐪" },
                        { text: "Csütörtök", emoji: "🍺" },
                        { text: "Péntek", emoji: "🍻" },
                        { text: "Szombat", emoji: "🍿" },
                        { text: "Vasárnap", emoji: "⚓" },
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
