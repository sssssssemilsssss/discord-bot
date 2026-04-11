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
  intents: [GatewayIntentBits.Guilds]
});

/* ───── КАРТИНКИ ───── */

const images = [
  'https://i.imgur.com/XVaHFVH.jpeg',
  'https://i.imgur.com/gTlqFJh.png',
  'https://i.imgur.com/f1zyGkj.png',
  'https://i.imgur.com/pyNF0UG.png',
  'https://i.imgur.com/2ejrfV6.png'
];

function getRandomImage() {
  return images[Math.floor(Math.random() * images.length)];
}

let eventsData = {};

if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

/* ───── EMBED ───── */

function createEmbed(event) {

  const list = event.users
    .map((u, i) =>
      `${i === 0 ? '👑' : '▫️'} ${i + 1}. <@${u.id}> • ${u.nick}`
    )
    .join('\n');

  let color = 0x00ff00;

  if (event.users.length >= event.max) color = 0xff0000;
  else if (event.users.length >= Math.ceil(event.max * 0.7)) color = 0xffff00;

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(
      `# ${event.title}\n\n` +
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет'}`
    )
    .setImage(getRandomImage())
    .setTimestamp();
}

/* ───── КНОПКИ УДАЛЕНИЯ ───── */

function createKickButtons(eventId, users) {
  const rows = [];

  for (let i = 0; i < users.length; i += 5) {
    const row = new ActionRowBuilder();

    users.slice(i, i + 5).forEach((u, index) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`kick_${eventId}_${i + index}`)
          .setLabel(`❌ ${i + index + 1}`)
          .setStyle(ButtonStyle.Danger)
      );
    });

    rows.push(row);
  }

  return rows;
}

/* ───── READY ───── */

client.once(Events.ClientReady, () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

/* ───── INTERACTIONS ───── */

client.on(Events.InteractionCreate, async interaction => {

  /* ───── КОМАНДА ───── */

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'капт') {

      const title = interaction.options.getString('название');
      const date = interaction.options.getString('дата');
      const max = interaction.options.getInteger('колво');

      const id = Date.now().toString();

      eventsData[id] = {
        owner: interaction.user.id,
        title,
        date,
        max,
        users: [],
        closed: false,
        messageId: null
      };

      const mainRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_${id}`)
          .setLabel('➕ Присоединиться')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`leave_${id}`)
          .setLabel('🚪 Выйти')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`close_${id}`)
          .setLabel('🔒 Закрыть')
          .setStyle(ButtonStyle.Secondary)
      );

      // 🔔 отдельный тег everyone
      await interaction.reply({
        content: '@everyone'
      });

      const msg = await interaction.followUp({
        embeds: [createEmbed(eventsData[id])],
        components: [mainRow],
        fetchReply: true
      });

      eventsData[id].messageId = msg.id;
      save();
    }
  }

  /* ───── КНОПКИ ───── */

  if (interaction.isButton()) {

    const parts = interaction.customId.split('_');
    const action = parts[0];
    const id = parts[1];

    const event = eventsData[id];
    if (!event) return;

    const channel = interaction.channel;

    /* JOIN */
    if (action === 'join') {

      if (event.closed)
        return interaction.reply({ content: '🔒 Набор закрыт', ephemeral: true });

      if (event.users.length >= event.max)
        return interaction.reply({ content: '🚫 Мест нет', ephemeral: true });

      if (event.users.find(u => u.id === interaction.user.id))
        return interaction.reply({ content: '❌ Ты уже в списке', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_${id}`)
        .setTitle('Введите ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Ваш ник')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    /* LEAVE */
    if (action === 'leave') {

      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      const msg = await channel.messages.fetch(event.messageId);

      await msg.edit({
        embeds: [createEmbed(event)],
        components: [
          msg.components[0],
          ...createKickButtons(id, event.users)
        ]
      });

      return interaction.reply({ content: '🚪 Ты вышел', ephemeral: true });
    }

    /* CLOSE */
    if (action === 'close') {

      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: '❌ Только создатель', ephemeral: true });

      event.closed = true;
      save();

      const msg = await channel.messages.fetch(event.messageId);

      await msg.edit({
        embeds: [createEmbed(event)],
        components: []
      });

      return interaction.reply({
        content: '🔒 Капт закрыт',
        ephemeral: true
      });
    }

    /* KICK */
    if (action === 'kick') {

      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: '❌ Только создатель', ephemeral: true });

      const index = parseInt(parts[2]);
      const removedUser = event.users[index];
      if (!removedUser) return;

      event.users.splice(index, 1);
      save();

      const msg = await channel.messages.fetch(event.messageId);

      await msg.edit({
        embeds: [createEmbed(event)],
        components: [
          msg.components[0],
          ...createKickButtons(id, event.users)
        ]
      });

      return interaction.reply({
        content: '❌ Ты был удалён из списка',
        ephemeral: true
      });
    }
  }

  /* ───── МОДАЛКА ───── */

  if (interaction.isModalSubmit()) {

    if (interaction.customId.startsWith('modal_')) {

      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      event.users.push({
        id: interaction.user.id,
        nick: interaction.fields.getTextInputValue('nick')
      });

      save();

      const msg = await interaction.channel.messages.fetch(event.messageId);

      await msg.edit({
        embeds: [createEmbed(event)],
        components: [
          msg.components[0],
          ...createKickButtons(id, event.users)
        ]
      });

      return interaction.reply({
        content: '✅ Ты добавлен',
        ephemeral: true
      });
    }
  }
});

/* ───── КОМАНДЫ ───── */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('Создать капт')
    .addStringOption(opt =>
      opt.setName('название')
        .setDescription('Название')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('дата')
        .setDescription('Дата')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('колво')
        .setDescription('Количество')
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
