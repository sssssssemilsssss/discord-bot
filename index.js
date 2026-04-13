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

function createCaptEmbed(event) {
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
    const userId = Object.keys(event.positions)
      .find(id => event.positions[id] === i);

    text += userId
      ? `🔴 ${i} — <@${userId}>\n`
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

  /* ───── COMMANDS ───── */
  if (interaction.isChatInputCommand()) {

    /* CAPT */
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
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        embeds: [createCaptEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      eventsData[id].messageId = msg.id;
      save();
    }

    /* FAMCAPT */
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
        new ButtonBuilder().setCustomId(`fpos_${id}`).setLabel('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fleave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        embeds: [createCaptEmbed(eventsData[id])],
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

  /* ───── BUTTONS ───── */
  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');
    const event = eventsData[id];
    if (!event) return;

    const channel = interaction.channel;

    /* CAPT JOIN */
    if (action === 'join') {

      const modal = new ModalBuilder()
        .setCustomId(`nick_${id}`)
        .setTitle('Введите ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Ник')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    if (action === 'leave') {

      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createCaptEmbed(event)] });

      return interaction.reply({ content: 'Вышел', ephemeral: true });
    }

    /* FAM JOIN */
    if (action === 'fjoin') {

      if (!event.users.find(u => u.id === interaction.user.id)) {
        event.users.push({ id: interaction.user.id });
      }

      const thread = await client.channels.fetch(event.threadId);
      await thread.members.add(interaction.user.id);

      save();

      return interaction.reply({ content: 'Ты в капте', ephemeral: true });
    }

    /* POSITION */
    if (action === 'fpos') {

      const modal = new ModalBuilder()
        .setCustomId(`pos_${id}`)
        .setTitle('Выбор позиции');

      const input = new TextInputBuilder()
        .setCustomId('pos')
        .setLabel('Введите позицию')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    if (action === 'fleave') {

      event.users = event.users.filter(u => u.id !== interaction.user.id);
      delete event.positions[interaction.user.id];

      save();

      return interaction.reply({ content: 'Вышел', ephemeral: true });
    }
  }

  /* ───── MODALS ───── */
  if (interaction.isModalSubmit()) {

    const [type, id] = interaction.customId.split('_');
    const event = eventsData[id];

    if (!event) return;

    /* CAPT NICK */
    if (type === 'nick') {

      event.users.push({
        id: interaction.user.id,
        nick: interaction.fields.getTextInputValue('nick')
      });

      save();

      const msg = await interaction.channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createCaptEmbed(event)] });

      return interaction.reply({ content: 'Добавлен', ephemeral: true });
    }

    /* POSITION */
    if (type === 'pos') {

      const pos = parseInt(interaction.fields.getTextInputValue('pos'));

      if (isNaN(pos) || pos < 1 || pos > event.max)
        return interaction.reply({ content: 'Неверная позиция', ephemeral: true });

      if (Object.values(event.positions).includes(pos))
        return interaction.reply({ content: 'Занято', ephemeral: true });

      event.positions[interaction.user.id] = pos;
      save();

      const thread = await client.channels.fetch(event.threadId);
      await thread.send({ embeds: [createFamEmbed(event)] });

      return interaction.reply({ content: `Позиция ${pos} занята`, ephemeral: true });
    }
  }
});

/* ───── COMMANDS ───── */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('Создать капт')
    .addStringOption(o => o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('колво').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('Фам капт')
    .addStringOption(o => o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('колво').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
