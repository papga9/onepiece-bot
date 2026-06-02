require('dotenv').config({ path: '../.env'});
const { REST, Routes } = require('discord.js');

// Define our command
const commands = [
    {
        name: 'next',
        description: 'Displays the upcoming One Piece watch block!',
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Registering slash commands...');

        // We use GuildCommands so it updates instantly in your server.
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                       { body: commands }
        );

        console.log('Successfully registered /next command!');
    } catch (error) {
        console.error(error);
    }
})();
