const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1438878652250198069';
const GUILD_ID = '1073591307487948833';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ───── DATA ───── */

let eventsData = {};
if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

/* ───── EMBEDS ───── */

function createEmbed(event) {
  const list = event.users.length
    ? event.users.map((u, i) => `${i + 1}. <@${u.id}> • ${u.nick}`).join('\n')
    : 'Пока никого нет';

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${event.title}\n\n` +
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      list
    )
    .setTimestamp();
}

function createFamEmbed(event) {
  let text = '';

  for (let i = 1; i <= event.max; i++) {
    const user = Object.keys(event.positions)
      .find(id => event.positions[id] === i);

    text += user
      ? `🔴 ${i} — <@${user}>\n`
      : `🟢 ${i} — свободно\n`;
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Фам капт (${Object.keys(event.positions).length}/${event.max})`)
    .setDescription(text);
}

/* ───── READY ───── */

client.once(Events.ClientReady, () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

/* ───── INTERACTIONS ───── */

client.on(Events.InteractionCreate, async interaction => {

  /* COMMANDS */
  if (interaction.isChatInputCommand()) {

    /* /капт */
    if (interaction.commandName === 'капт') {

      const title = interaction.options.getString('название');
      const date = interaction.options.getString('дата');
      const max = interaction.options.getInteger('колво');

      const id = Date.now().toString();

      eventsData[id] = {
        type: 'capt',
        owner: interaction.user.id,
        title,
        date,
        max,
        users: [],
        messageId: null,
        closed: false
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        embeds: [createEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      eventsData[id].messageId = msg.id;
      save();
    }

    /* /фамкапт */
    if (interaction.commandName === 'фамкапт') {

      const title = interaction.options.getString('название');
      const date = interaction.options.getString('дата');
      const max = interaction.options.getInteger('колво');

      const id = Date.now().toString();

      eventsData[id] = {
        type: 'fam',
        owner: interaction.user.id,
        title,
        date,
        max,
        users: [],
        positions: {},
        threadId: null,
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fjoin_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fleave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fclear_${id}`).setLabel('❌').setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        embeds: [createEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      const thread = await msg.startThread({
        name: `Фам капт`,
        autoArchiveDuration: 60
      });

      eventsData[id].threadId = thread.id;
      eventsData[id].messageId = msg.id;

      await thread.send({ embeds: [createFamEmbed(eventsData[id])] });

      save();
    }
  }

  /* BUTTONS */
  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');
    const event = eventsData[id];
    if (!event) return;

    const channel = interaction.channel;

    /* CAPT JOIN */
    if (action === 'join') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_${id}`)
        .setTitle('Ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Введите ник')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    if (action === 'leave') {
      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({ content: 'Вышел', ephemeral: true });
    }

    /* FAM */
    if (action === 'fjoin') {

      if (!event.users.find(u => u.id === interaction.user.id)) {
        event.users.push({ id: interaction.user.id });
      }

      const thread = await client.channels.fetch(event.threadId);
      await thread.members.add(interaction.user.id);

      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({ content: 'Вошёл', ephemeral: true });
    }

    if (action === 'fleave') {

      event.users = event.users.filter(u => u.id !== interaction.user.id);
      delete event.positions[interaction.user.id];

      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({ content: 'Вышел', ephemeral: true });
    }

    if (action === 'fclear') {

      delete event.positions[interaction.user.id];
      save();

      const thread = await client.channels.fetch(event.threadId);
      const msg = await thread.send({ embeds: [createFamEmbed(event)] });

      return interaction.reply({ content: 'Позиция убрана', ephemeral: true });
    }
  }

  /* MODAL */
  if (interaction.isModalSubmit()) {

    const id = interaction.customId.split('_')[1];
    const event = eventsData[id];

    event.users.push({
      id: interaction.user.id,
      nick: interaction.fields.getTextInputValue('nick')
    });

    save();

    const msg = await interaction.channel.messages.fetch(event.messageId);
    await msg.edit({ embeds: [createEmbed(event)] });

    return interaction.reply({ content: 'Добавлен', ephemeral: true });
  }
});

/* SLASH COMMANDS */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('Создать капт')
    .addStringOption(o => o.setName('название').setDescription('Название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('Дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('Кол-во').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('Фам капт')
    .addStringOption(o => o.setName('название').setDescription('Название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('Дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('Кол-во').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
