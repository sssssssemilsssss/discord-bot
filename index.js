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
const http = require('http');

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

/* ───── ДАННЫЕ ───── */

let eventsData = {};
if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

/* ───── EMBEDS ───── */

function createEmbed(event) {
  const list = event.users
    .map((u, i) =>
      `${i === 0 ? '👑' : '▫️'} ${i + 1}. <@${u.id}> • ${u.nick}`
    )
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${event.title}\n\n` +
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет'}`
    )
    .setTimestamp();
}

function createFamMainEmbed(event) {
  const list = event.users
    .map((u, i) => `▫️ ${i + 1}. <@${u.id}>`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${event.title}\n\n` +
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет'}`
    )
    .setTimestamp();
}

function createFamThreadEmbed(event) {

  let text = '';

  for (let i = 1; i <= event.max; i++) {

    const user = Object.keys(event.positions)
      .find(id => event.positions[id] === i);

    if (user) {
      text += `🔴 ${i} — <@${user}>\n`;
    } else {
      text += `🟢 ${i} — свободно\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Позиции')
    .setDescription(text);
}

/* ───── КИК КНОПКИ ───── */

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

  if (interaction.isChatInputCommand()) {

    /* ───── /капт ───── */

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

      await interaction.reply({ content: '@everyone' });

      const msg = await interaction.followUp({
        embeds: [createEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      eventsData[id].messageId = msg.id;
      save();
    }

    /* ───── /фамкапт ───── */

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
        new ButtonBuilder()
          .setCustomId(`fjoin_${id}`)
          .setLabel('➕')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`fleave_${id}`)
          .setLabel('🚪')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`fclear_${id}`)
          .setLabel('❌ Позиция')
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        embeds: [createFamMainEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      const thread = await msg.startThread({
        name: `Фам капт`,
        autoArchiveDuration: 60
      });

      eventsData[id].threadId = thread.id;
      eventsData[id].messageId = msg.id;

      await thread.send({
        embeds: [createFamThreadEmbed(eventsData[id])]
      });

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

    /* ───── КАПТ ───── */

    if (action === 'join') {

      if (event.users.find(u => u.id === interaction.user.id))
        return interaction.reply({ content: 'Ты уже в списке', ephemeral: true });

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

      return interaction.reply({ content: 'Ты вышел', ephemeral: true });
    }

    if (action === 'close') {

      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: 'Только создатель', ephemeral: true });

      const msg = await channel.messages.fetch(event.messageId);

      await msg.edit({
        embeds: [createEmbed(event)],
        components: []
      });

      return interaction.reply({ content: 'Закрыто', ephemeral: true });
    }

    if (action === 'kick') {

      const index = parseInt(parts[2]);
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

      return interaction.reply({ content: 'Удалён', ephemeral: true });
    }

    /* ───── ФАМ ───── */

    if (action === 'fjoin') {

      if (event.users.find(u => u.id === interaction.user.id))
        return interaction.reply({ content: 'Ты уже в списке', ephemeral: true });

      event.users.push({ id: interaction.user.id });
      save();

      const thread = await client.channels.fetch(event.threadId);
      await thread.members.add(interaction.user.id);

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createFamMainEmbed(event)] });

      return interaction.reply({ content: 'Ты вошёл', ephemeral: true });
    }

    if (action === 'fleave') {

      event.users = event.users.filter(u => u.id !== interaction.user.id);
      delete event.positions[interaction.user.id];
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createFamMainEmbed(event)] });

      return interaction.reply({ content: 'Ты вышел', ephemeral: true });
    }

    if (action === 'fclear') {

      delete event.positions[interaction.user.id];
      save();

      const thread = await client.channels.fetch(event.threadId);
      const messages = await thread.messages.fetch({ limit: 5 });
      const botMsg = messages.find(m => m.author.id === client.user.id);

      if (botMsg) {
        await botMsg.edit({ embeds: [createFamThreadEmbed(event)] });
      }

      return interaction.reply({ content: 'Позиция очищена', ephemeral: true });
    }
  }

  /* ───── МОДАЛКА ───── */

  if (interaction.isModalSubmit()) {

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

    return interaction.reply({ content: 'Ты добавлен', ephemeral: true });
  }
});

/* ───── ПОЗИЦИИ ───── */

client.on('messageCreate', async message => {

  if (!message.channel.isThread()) return;

  const event = Object.values(eventsData)
    .find(e => e.threadId === message.channel.id);

  if (!event) return;

  const num = parseInt(message.content);
  if (isNaN(num)) return;

  if (Object.values(event.positions).includes(num))
    return message.reply('Позиция занята');

  event.positions[message.author.id] = num;
  save();

  const messages = await message.channel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user.id);

  if (botMsg) {
    await botMsg.edit({ embeds: [createFamThreadEmbed(event)] });
  }

  message.reply(`Ты занял ${num}`);
});

/* ───── HTTP ───── */

http.createServer((req, res) => {
  res.end('OK');
}).listen(3000);

/* ───── КОМАНДЫ ───── */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('Создать капт')
    .addStringOption(o => o.setName('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('Фам капт')
    .addStringOption(o => o.setName('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
